# Valoraciones de reportes — HU-08/T4 y T7

## Contrato HTTP para T5 y T6

`POST /api/reports/{reportId}/assessments`, con `Authorization: Bearer <access_token>`
y cuerpo JSON de un único campo:

```json
{ "action": "validate" }
```

`action` solo admite `validate` e `invalidate`. El reporte debe ser un UUID con
guiones; se acepta mayúscula y se normaliza. Se rechazan JSON inválido, arrays,
campos ausentes o adicionales. No se reciben identidad, confianza, permisos,
mínimo, revisión de política ni fechas del navegador.

Éxito: `201 Created`, después de la respuesta satisfactoria de la transacción RPC:

```json
{
  "id": "08000000-0000-4000-8000-000000000004",
  "reportId": "08000000-0000-4000-8000-000000000002",
  "action": "validate",
  "createdAt": "2026-11-20T12:00:00.000001+00:00"
}
```

Es el recibo de esta operación, no una lectura del historial ni de la credibilidad.
Todas las respuestas llevan `Cache-Control: private, no-store`. Los errores tienen
la forma `{ "error": { "code", "message" } }`:

| HTTP | Código                | Condición                                                                  |
| ---- | --------------------- | -------------------------------------------------------------------------- |
| 400  | `INVALID_INPUT`       | UUID, JSON, acción o argumentos inválidos.                                 |
| 401  | `UNAUTHENTICATED`     | Bearer ausente, inválido o caducado.                                       |
| 403  | `FORBIDDEN`           | Perfil ausente/inactivo, confianza insuficiente o permiso revocado.        |
| 403  | `OWN_REPORT`          | El valorador es el autor del reporte.                                      |
| 404  | `REPORT_NOT_FOUND`    | Reporte inexistente, tras comprobar al actor.                              |
| 409  | `ASSESSMENT_CONFLICT` | Cambio de revisión, conflicto de serialización o interbloqueo.             |
| 503  | `POLICY_UNAVAILABLE`  | Política sin configurar, incoherente con T2 o historial temporal inválido. |
| 503  | `SERVICE_UNAVAILABLE` | Fallo de servicio, persistencia o respuesta RPC inesperada.                |

T5 consumirá el recibo y T6 ampliará la presentación de errores. No hay reintentos
automáticos: una pérdida de respuesta puede ocurrir después del commit. Repetir
la petición crea otra fila; solo cuenta la última, pero no hay idempotencia ni
deduplicación de reintentos. No se compensa un fallo de red borrando valoraciones.

## Autorización y escritura

`web/src/server/assessments.ts` reutiliza `checkAssessmentAuthorization` de T2,
incluyendo Supabase Auth, el perfil de HU-10 y los permisos de HU-14. Se utiliza
exclusivamente la clave publicable y el Bearer del usuario.

La migración `20261120120000_submit_report_assessments.sql` añade:

- `private.assessment_policy`: singleton con mínimo nullable y revisión UUID,
  RLS habilitada y sin permisos para roles API. El mínimo inicial es `NULL`:
  **la escritura queda desactivada**, incluida la RPC directa.
- Trigger privado que renueva la revisión en cualquier actualización de política.
- `public.assessment_policy()` y `public.submit_report_assessment(target_report_id
uuid, requested_action text, expected_policy_revision uuid)`: wrappers
  `SECURITY INVOKER`, ejecutables únicamente por `authenticated`.
- Funciones equivalentes en `assessment_internal`, no expuesto por PostgREST:
  `SECURITY DEFINER`, `search_path = ''`, referencias cualificadas y sin SQL dinámico.
  Invocarlas directamente desde SQL aplica las mismas comprobaciones.
- Índice `(report_id, assessor_id, created_at DESC, id DESC)` para el historial
  y la selección de última valoración que ya utiliza HU-09.

La RPC obtiene el actor de `auth.uid()`; **no recibe un umbral**. La revisión solo
permite rechazar una política que haya cambiado; no concede facultades ni es un
secreto. La API consulta la política y compara su mínimo con el evaluado por T2.

En una transacción `READ COMMITTED`, la función de escritura `VOLATILE`:

1. Bloquea la política con `FOR SHARE` y comprueba mínimo configurado y revisión.
2. Bloquea el perfil con `FOR UPDATE` y comprueba actividad y confianza.
3. Bloquea con `FOR SHARE` la asignación vigente `assessments.submit` del rol real.
4. Bloquea el reporte con `FOR SHARE`, comprueba existencia y rechaza su autor.
5. Inserta una fila, generando identidad, UUID y fecha en PostgreSQL.

Los bloqueos duran hasta el commit. Si un cambio de perfil, permiso, política o
autor estaba en curso, la RPC espera y evalúa el estado confirmado. Si la valoración
obtiene primero el bloqueo, el cambio espera: esa valoración es anterior a la
revocación y D4 conserva su historial. Se rechazan otros niveles de aislamiento
con `40001` para evitar snapshots antiguos. Fundamento: [bloqueos de PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html)
y [snapshots VOLATILE](https://www.postgresql.org/docs/17/xfunc-volatility.html).

No se conceden permisos directos ni se añaden políticas RLS a `report_assessments`.
Solo se incorpora esta inserción acotada, sin edición, retirada o lectura de
historial. El propietario SQL conserva sus facultades de mantenimiento.

## Historial y decisiones D1–D6

Se conserva historial sin unicidad `(report_id, assessor_id)`. Cada envío válido,
incluso repetido, añade una fila. El bloqueo del perfil serializa las operaciones
del mismo valorador, también entre reportes distintos: una elección conservadora
de Sprint 1 que limita el paralelismo por persona.

La fecha es el máximo entre `clock_timestamp()` y la última fecha de ese par más
un microsegundo. Respeta el orden de serialización aunque una transacción empezara
antes que otra o retroceda el reloj. No se usa `now()` (inicio de transacción).
Una fecha histórica infinita bloquea la operación y requiere mantenimiento.
HU-09 ya ordena por fecha e ID descendentes; su algoritmo no cambia. El recibo HTTP
conserva la precisión recibida de PostgreSQL.

- **D1:** solo cuenta la última por valorador; las anteriores permanecen guardadas.
- **D2:** no hay retirada en Sprint 1, ni endpoints de edición o borrado.
- **D3:** se rechaza valorar el propio reporte dentro de la transacción.
- **D4:** revocar permisos no elimina opiniones anteriores. El cálculo existente
  sigue usando la actividad y confianza actuales del perfil.
- **D5:** las lecturas de clientes siguen limitadas a agregados de HU-09. Un recibo
  de escritura no permite consultar otras filas o identidades.
- **D6:** no hay estados adicionales hoy. Si HU-05 los añade, deberá incorporarse
  una condición explícita en la RPC; el definer no hereda automáticamente futuras
  políticas RLS del reporte.

## Configuración y activación pendiente

El mínimo **1 es una propuesta sin aprobación formal** y esta migración no lo
activa. El PO debe aprobar un entero de 1–100. Un operador SQL autorizado deberá
configurar `private.assessment_policy.minimum_trust_level` y el entorno del
servidor `ASSESSMENTS_MIN_TRUST_LEVEL` con ese mismo valor.

PostgreSQL es la autoridad de escritura, incluso ante llamadas directas de RPC.
El entorno es una comprobación adicional de T2: la API rechaza una discrepancia.
La RPC no conoce el entorno de Next.js ni debe confiar en un mínimo enviado como
parámetro. Cambiar solo el entorno **no** reconfigura ni desactiva la RPC; para
suspenderla hay que poner el mínimo protegido a `NULL`. No se añade una API de
administración de política.

Procedimiento, después de aprobación y sobre el proyecto confirmado:

1. Mediante el procedimiento SQL privilegiado del equipo, ejecutar
   `UPDATE private.assessment_policy SET minimum_trust_level = NULL WHERE singleton;`.
   Espera escrituras en curso; las posteriores se deniegan.
2. Configurar y desplegar `ASSESSMENTS_MIN_TRUST_LEVEL` con el entero aprobado.
3. Asignar ese entero a `minimum_trust_level` por el mismo procedimiento SQL.
   El trigger genera la revisión; no editar el historial de migraciones.
4. Verificar la coincidencia con `assessment_policy()` y realizar las pruebas de
   aceptación autorizadas. Para cambiar el mínimo, repetir el procedimiento.

Solo se versiona aquí la estructura. Los mínimos de los tests son fixtures, no
reglas aprobadas. No se modifica ningún `.env` ni proyecto remoto.

## Integración con credibilidad — HU-08/T7

Tras recibir y validar el recibo confirmado de `submit_report_assessment`, el
servidor espera `recalculateReportCredibility(receipt.reportId,
{ cause: 'validation_added', triggerId: receipt.id }, { client })` tanto para
`validate` como para `invalidate`. Reutiliza el cliente autenticado de la petición,
sin claves privilegiadas. Un rechazo, fallo de escritura o recibo inválido no
dispara el cálculo. La causa identifica una nueva valoración de cualquiera de
las dos acciones; no significa necesariamente una validación favorable.

HU-09/T2 consulta `report_credibility_inputs` y calcula desde los agregados actuales:
solo cuenta la última valoración de cada usuario activo distinto del autor, con
su confianza actual, y las evidencias visibles según HU-09. La RLS limita los
reportes accesibles. Los permisos revocados posteriormente no borran el historial.
La credibilidad es dinámica y **no es un veredicto definitivo**.

Esta lectura no persiste una puntuación ni actualiza una caché. No se añaden
columnas, tablas, triggers ni otra fórmula. Cada escritura confirmada provoca una
consulta nueva; el historial y la selección de la última valoración siguen siendo
los de T4/HU-09. Si hay escrituras concurrentes, la lectura puede incluir otras
valoraciones ya confirmadas, no representa una instantánea exclusiva del recibo.

La llamada se espera dentro de un `try/catch`: no queda una promesa en segundo
plano al terminar la petición. Si falla, HU-09 registra una sola vez el error con
reporte, causa e identificador de valoración. T7 captura el rechazo sin duplicar
el log y mantiene el mismo `201` y recibo, sin puntuación ni detalles internos.
No hay rollback, borrado compensatorio ni reintento automático. Una consulta
posterior de credibilidad vuelve a leer los datos persistidos. Esperar el cálculo
añade su latencia a la respuesta; no se incorpora una cola ni un timeout nuevo.

## Alcance y verificación

T7 conecta exclusivamente las valoraciones con el servicio existente de HU-09.
No implementa interfaz T5, UX T6, login HU-11, E2E T8 ni la integración de
evidencias HU-06/T5. HU-11 debe suministrar y renovar tokens para el flujo final.

- Vitest importa la ruta real y ejecuta T2, sesión y consulta de perfil con la E/S
  del SDK sustituida. Cubre entradas, recibos, errores y rechazos en la escritura.
  Ejecuta también el servicio y la fórmula reales de HU-09, observando argumentos,
  orden escritura/cálculo, ausencia de llamadas ante rechazos, esperas, fallos con
  un único log y recibo intacto, y consultas nuevas tras repetir una valoración.
- `assessment_submission.test.sql`: funciones reales, ACL/RLS, política, identidad,
  integridad, repeticiones y compatibilidad con los agregados existentes.
- `assessment_submission_concurrency.test.sql`: conexiones `dblink` independientes,
  espera observada en `pg_stat_activity`, commits reales y rechazo tras revocación,
  desactivación, cambios de confianza, rol, política y autor.

**La suite concurrente requiere una base local aislada.** Confirma fixtures para
que sean visibles entre conexiones; al terminar elimina solo sus UUID y restaura
el mínimo y permisos originales. La revisión de política cambia. Un aborto antes
de la limpieza puede dejar fixtures: nunca ejecutarla en una base compartida o
con datos reales. La otra suite usa rollback. `dblink` solo pertenece a los tests.

Ejecutar `npm.cmd run check`, `npm.cmd run test:coverage`, `npm.cmd run test:db`
(con `-- --workdir <directorio>` para la instancia independiente) y
`git diff --check`. No resetear bases existentes para reproducir la prueba.

T7 no modifica SQL, migraciones, RLS, ACL ni la selección de agregados: para esta
integración TypeScript no es necesario repetir pgTAP. Sus pruebas existentes
siguen verificando las reglas SQL; los tests de T7 no atribuyen a sus respuestas
controladas del SDK una verificación de PostgreSQL real.
