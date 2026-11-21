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

T6 completa dos casos de clasificación sin cambiar el contrato público:

- Si la sesión caduca durante la consulta del perfil, `my_permissions` o
  `assessment_policy`, se devuelve `401 UNAUTHENTICATED` con el mensaje
  «Se requiere una sesión válida.», antes de escribir o recalcular.
- Un `429` de Supabase Auth se trata como indisponibilidad temporal:
  `503 SERVICE_UNAVAILABLE`, «No se pudo completar la valoración.».

Para las consultas PostgREST se prioriza el estado HTTP: `401` identifica el
fallo de autenticación. Solo si el estado no está disponible se usan los códigos
`PGRST301`, `PGRST302` y `PGRST303`. No se inspeccionan mensajes ni se considera
`42501` por sí solo una sesión caducada. `PGRST300` y los fallos de infraestructura
mantienen el tratamiento de servicio no disponible. Un error inesperado de
permisos al consultar datos conserva su tratamiento previo; la denegación del
permiso efectivo continúa devolviendo `403 FORBIDDEN`. Véase la
[clasificación oficial de PostgREST](https://docs.postgrest.org/en/stable/references/errors.html#group-3-jwt).
El perfil compartido conserva el mensaje genérico de error y solo añade una
clasificación interna, sin transportar mensajes, detalles ni pistas del proveedor.
Todas estas respuestas mantienen `Cache-Control: private, no-store` y el JSON
`{ "error": { "code", "message" } }`.

T5 consume el recibo y presenta los mensajes de error en la interfaz. No hay reintentos
automáticos: una pérdida de respuesta puede ocurrir después del commit. Repetir
la petición crea otra fila; solo cuenta la última, pero no hay idempotencia ni
deduplicación de reintentos. No se compensa un fallo de red borrando valoraciones.

## Controles del listado — HU-08/T5

Cada `ReportSummaryCard` contiene `ReportAssessmentControls`, con botones
«Validar reporte» e «Invalidar reporte». La consulta continúa siendo pública.
Los controles usan `useAuth()` del proveedor existente de HU-11 y obtienen el
token vigente mediante `getAccessToken()` justo antes del envío. No consultan
ni simulan roles, perfiles o confianza: el backend conserva la decisión final.

Mientras se carga la sesión o para visitantes sin sesión, ambas acciones están
deshabilitadas. Se ofrece `/login?next=%2Fconsulta`, un destino local fijo que
el login de HU-11 valida con su utilidad existente. Al volver se realiza una
nueva búsqueda; no se persisten aquí filtros ni páginas del listado.

Cada tarjeta bloquea ambas acciones durante la petición, incluida la lectura del
token. Un bloqueo síncrono evita dobles clics antes del siguiente renderizado.
Los estados son independientes entre reportes y se descartan al cambiar de
cuenta; una respuesta tardía no se muestra a otro usuario. Si se cierra la sesión
antes de obtener el token, no se envía el POST. Una escritura ya enviada puede
terminar en el servidor aunque la tarjeta deje de estar montada.

Se envían exclusivamente la acción y el Bearer, al endpoint del ID de la tarjeta.
Solo un `201` con los cuatro campos del recibo, ID válido, reporte y acción
coincidentes y fecha válida muestra «Validación registrada» o «Invalidación
registrada». Los errores documentados se traducen a mensajes locales en español;
no se muestra el mensaje recibido de Supabase ni del servidor. Un `401` ofrece
de nuevo el enlace de acceso. Las respuestas inesperadas, los fallos de red y
`SERVICE_UNAVAILABLE` avisan de que el resultado no se ha confirmado y podría
haberse guardado. No hay reintentos ni redirecciones automáticas del POST.

No se recalcula ni cambia la puntuación en el navegador. La API de consulta
actual devuelve páginas y no una tarjeta individual; para conservar los resultados
y su cursor, el éxito indica que la credibilidad se actualizará en una nueva
consulta. Los botones nativos admiten teclado, tienen foco visible y una altura
mínima de 44 px; el estado se anuncia con `role="status"`, los errores con
`role="alert"` y la espera con `aria-busy`. En móvil los botones se apilan.

`report-assessment-controls.test.ts` monta React y el proveedor real de HU-11 en
jsdom, sustituyendo solo la frontera del cliente Supabase y HTTP. Comprueba
interacciones, sesión, respuestas, concurrencia visual, accesibilidad básica y
búsqueda/paginación con el Dashboard real. jsdom se añade solo para desarrollo;
no es una verificación de Supabase. Las pruebas de tarjetas conservan sus
aserciones de credibilidad y ahora se renderizan bajo el proveedor de sesión.

El mínimo de confianza sigue pendiente de aprobación. T5 muestra el rechazo
`POLICY_UNAVAILABLE` y no configura ese mínimo ni desbloquea escrituras.

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
T5 añade los controles descritos arriba y reutiliza el login y la renovación de
sesión de HU-11. No modifica las pruebas E2E de T8 ni la integración de evidencias
HU-06/T5.

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
- `web/tests/assessments-e2e.test.ts`: ejecuta la ruta real con cuentas temporales de
  Auth contra Supabase local, comprueba los recibos y la credibilidad actual, y
  verifica entradas inválidas, autoría, confianza insuficiente y reporte inexistente.
  El runner `npm run test:assessments:e2e --workspace @darkshield/web` obtiene las
  claves locales desde `supabase status`; el job `database` lo ejecuta tras pgTAP.

**La suite concurrente requiere una base local aislada.** Confirma fixtures para
que sean visibles entre conexiones; al terminar elimina solo sus UUID y restaura
el mínimo y permisos originales. La revisión de política cambia. Un aborto antes
de la limpieza puede dejar fixtures: nunca ejecutarla en una base compartida o
con datos reales. La otra suite usa rollback. `dblink` solo pertenece a los tests.

Ejecutar `npm.cmd run check`, `npm.cmd run test:coverage`, `npm.cmd run test:db`
(con `-- --workdir <directorio>` para la instancia independiente) y
`npm.cmd run test:assessments:e2e --workspace @darkshield/web` con Supabase local
arrancado y política sin configurar; la prueba restaura la política a `NULL` y
borra sus cuentas y UUID aleatorios al terminar. Ejecutarla solo en una instancia
local aislada, nunca en una base compartida o con datos reales. No resetear bases
existentes para reproducir la prueba. Completar también `git diff --check`.

T7 no modifica SQL, migraciones, RLS, ACL ni la selección de agregados: para esta
integración TypeScript no es necesario repetir pgTAP. Sus pruebas existentes
siguen verificando las reglas SQL; los tests de T7 no atribuyen a sus respuestas
controladas del SDK una verificación de PostgreSQL real.
