# HU-08/T3 — Persistencia de valoraciones

Esta tarea implementa solo el almacenamiento de validaciones e invalidaciones.
Aplica las [reglas de HU-08/T1](domain-design.md#validación-e-invalidación-de-reportes)
y las convenciones de [arquitectura](architecture.md) y
[desarrollo](development.md). No habilita operaciones de HU-08/T4 ni completa HU-08.

## Esquema

La migración `20261118120000_create_report_assessments.sql` crea
`public.report_assessments` sin modificar migraciones anteriores ni añadir datos:

| Columna       | Tipo          | Restricciones y finalidad                                                                     |
| ------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `id`          | `uuid`        | PK, generado mediante `gen_random_uuid()`. Identifica la valoración.                          |
| `report_id`   | `uuid`        | Obligatorio, FK a `public.reports(id)`.                                                       |
| `assessor_id` | `uuid`        | Obligatorio, FK a `public.profiles(id)`. Identifica al usuario que emite la valoración.       |
| `action`      | `text`        | Obligatorio, sin valor predeterminado, CHECK que admite únicamente `validate` o `invalidate`. |
| `created_at`  | `timestamptz` | Obligatorio, predeterminado `now()`. Fecha de registro con zona horaria.                      |

Las dos FK usan `ON UPDATE RESTRICT ON DELETE RESTRICT`: no se eliminan ni se
reasignan valoraciones en cascada al cambiar sus referencias. Los índices B-tree
en `report_id` y `assessor_id` permiten localizar valoraciones y comprobar las FK
desde cada padre. No se añaden índices de acción o fecha sin consultas que los
justifiquen. La PK ya dispone de su índice único.

La referencia al usuario que emite la valoración se llama
`report_assessments_assessor_fkey` y su índice es
`report_assessments_assessor_id_idx`. `public.reports.author_id` sigue identificando
al autor original del reporte y no cambia con este renombrado.

## Decisiones provisionales y límites

- No hay `UNIQUE (report_id, assessor_id)`: decidirlo ahora fijaría la regla pendiente
  sobre repeticiones. El UUID separa identidad y cardinalidad. La ausencia de esa
  restricción **no autoriza repeticiones**; el acceso de aplicación está cerrado.
  Antes de abrirlo se debe acordar la cardinalidad y su protección ante concurrencia.
  Si se decide unicidad, habrá que comprobar posibles duplicados introducidos por
  operadores SQL privilegiados antes de añadirla en una nueva migración.
- No se añaden `updated_at`, retirada lógica, versiones ni triggers de inmutabilidad:
  edición, retirada y conservación de historial siguen pendientes. Tampoco se
  conceden permisos de actualización o eliminación. El esquema no es un registro
  de auditoría inmutable frente al propietario SQL.
- `created_at` tiene un default de base de datos; no es una prueba de auditoría
  contra escrituras privilegiadas que proporcionen una fecha explícita. El futuro
  contrato de escritura debe decidir cómo gestionar los campos controlados por el servidor.
- Las FK conservadoras preservan las asociaciones. Una futura eliminación de
  reportes o perfiles con valoraciones necesitará una política explícita de
  conservación o anonimización; no debe resolverse con un borrado en cascada accidental.

## Acceso cerrado por defecto

RLS está habilitada sin políticas. Se revocan todos los privilegios de tabla a
`PUBLIC`, `anon`, `authenticated` y `service_role`, incluidos los grants por defecto
de Supabase. No hay RPC, cliente privilegiado ni acceso autorizado de aplicación,
ni siquiera de lectura. El propietario SQL conserva acceso para migraciones y
pruebas; `service_role` puede eludir RLS, por lo que su ACL revocada es necesaria.

No se deducen permisos del rol `collaborator`, del perfil activo ni de un valor de
confianza. Quedan por acordar con HU-14/HU-11/HU-10: identidad y sesiones, permisos
efectivos, condición de cuenta activa y umbral de confianza. También quedan
pendientes repeticiones, cambios/retiradas, reportes propios y estados elegibles
del reporte (HU-05). HU-09 debe definir el contrato de credibilidad. Todo ello
bloquea abrir las operaciones correspondientes de HU-08/T4.

## Verificación

Las pruebas usan PostgreSQL real y pgTAP, con fixtures locales dentro de
`BEGIN`/`ROLLBACK`; no son datos de aplicación ni semillas:

- `report_assessments_model.test.sql`: persistencia de ambas acciones, asociaciones,
  UUID y fecha predeterminados, obligatoriedad, CHECK, PK, FK e índices.
- `report_assessments_rls.test.sql`: ACL de tabla/columna y operaciones reales como
  `anon`, `authenticated` y `service_role`; grants temporales para aislar RLS con
  filas existentes, autores distintos y ausencia de identidad. Comprueba que las
  operaciones denegadas no alteran los registros.
- `report_assessments_migration.test.sql`: reproduce el SQL registrado por la CLI
  sobre perfiles y reportes preexistentes; comprueba su preservación y el cierre
  del acceso. No mantiene una copia paralela de la migración.

Las pruebas históricas `profiles_backfill.test.sql` y `reports_backfill.test.sql`
retiran únicamente la nueva FK entrante antes de reconstruir su esquema anterior.
Ese ajuste es necesario porque PostgreSQL impide eliminar una tabla referenciada;
sus aserciones permanecen intactas y el rollback restaura las FK.

Ejecutar `npm run check`, `npm run test:coverage` y `npm run test:db`, preparando
Supabase local según [su guía](../supabase/README.md). No ejecutar estas pruebas
de reconstrucción en una base compartida. La cobertura V8 no mide SQL; la revisión
independiente exigida por la DoD y la ejecución de CI tras publicar siguen siendo
necesarias. T3 no aplica migraciones al proyecto remoto.

### Resultado local anterior al renombrado (18 de noviembre de 2026)

Entorno: Windows, Node.js 24.18.0, npm 11.16.0, Supabase CLI 3.1.0 y PostgreSQL
17 local sobre Docker. El arranque aplicó las cuatro migraciones en orden.

- `npm.cmd run check`: correcto (formato, lint, tipos y compilación de web y
  extensión), después de corregir el formato de este documento.
- `npm.cmd run test:coverage`: 126 pruebas correctas en cinco archivos; 100 %
  en sentencias (141/141), ramas (107/107), funciones (24/24) y líneas (132/132)
  del ámbito V8 configurado. No incluye SQL.
- `npm.cmd run test:db`: 12 archivos y 392 aserciones correctas, de las cuales
  128 corresponden a las tres suites nuevas. La primera ejecución detectó diez
  fallos por una sobrecarga incorrecta de las aserciones pgTAP de tipos y
  obligatoriedad; se corrigieron y se volvió a ejecutar toda la suite con éxito.

Estos resultados son locales: no acreditan CI, despliegue remoto ni revisión
independiente. No se han creado commits, push ni pull request.

### Verificación del renombrado a `assessor_id`

Editar una migración ya aplicada no actualiza automáticamente el esquema local
ni el SQL guardado en `supabase_migrations.schema_migrations`. `migration up`
no vuelve a ejecutar una versión que ya figura como aplicada. Además, la suite
`report_assessments_migration.test.sql` reproduce ese SQL guardado: ejecutarla
contra el historial anterior no verifica el archivo revisado.

Para comprobar esta versión se necesita una instancia independiente sin esa
migración aplicada, que ejecute los archivos actuales en orden y después la suite
completa. Puede ser una base de pruebas nueva o el runner limpio de CI; no es
necesario resetear la instancia de desarrollo existente. La base anterior conserva
el nombre antiguo hasta que se acuerde cómo actualizarla de forma no destructiva.
No se modifica manualmente su historial para aparentar que ya aplicó el cambio.

Verificación ejecutada el 18 de noviembre de 2026 después del renombrado:

- `npm.cmd run check`: correcto (formato, lint, tipos y compilación).
- `npm.cmd run test:coverage`: 126 pruebas correctas; 100 % en las cuatro métricas
  del ámbito V8 configurado.
- `npm.cmd run test:db -- --workdir tmp/hu08-assessor-1ccd146a`: 392 aserciones
  correctas en 12 archivos, incluidas las 128 de HU-08. El directorio temporal,
  ignorado por Git, contiene copias de las migraciones y pruebas actuales y una
  configuración con otro identificador de proyecto y puertos 55320–55324.
  Supabase aplicó las cuatro migraciones sobre esa instancia nueva antes de probar.

No se ejecutó un reset ni se alteraron los datos, el esquema o el historial de la
instancia original. Queda pendiente acordar su actualización no destructiva si
se necesita usarla con el nuevo nombre. La verificación desde una base limpia ya
se realizó en la instancia independiente; CI y revisión independiente siguen
pendientes.
