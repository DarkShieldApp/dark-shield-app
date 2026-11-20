# Supabase

Supabase/PostgreSQL y Supabase Auth son las tecnologías adoptadas. HU-14/T1
incorpora `public.profiles`, su primera migración, triggers, RLS y pruebas reales.
T2 añade `public.roles` y un rol principal obligatorio por perfil. T3 añade permisos base y administración auditada. HU-11/T1–T2 añade el cliente
web y acceso por enlace de correo con confirmación. La sesión persistente,
renovación, cierre de sesión y autorización de rutas siguen pendientes de T3–T4.

## Proyecto remoto y diagnóstico

La URL y clave publicable del proyecto compartido se guardan en `web/.env`,
partiendo de `web/.env.example` sin sobrescribir un archivo existente. No se usan
claves administrativas ni contraseñas remotas en código o Git.

`npm run supabase:check` carga explícitamente `web/.env` y consulta solo
`/auth/v1/health`. Su resultado demuestra disponibilidad de Auth, no el modelo ni
RLS. No crea usuarios ni sesiones y no se ejecuta en CI o build.

Para el proyecto remoto, habilitar el registro por correo y la confirmación de
correo en Authentication. Añadir la URL de la aplicación con la ruta
`/login?emailConfirmed=1` a las URLs de redirección permitidas; la URL enviada
en el enlace de acceso debe coincidir con una de ellas. No se necesitan credenciales
de Google ni claves de servidor en el navegador.

Las migraciones del dominio están versionadas para validación local. Esta tarea no
las aplica al proyecto remoto compartido; su estado debe comprobarse antes del despliegue. El remoto utiliza PostgreSQL 17.

## Instancia local y migraciones

Supabase CLI 3.1.0 es una dependencia fijada en el lockfile. La configuración
local usa PostgreSQL 17, API, Auth, Studio, correo local y Storage (HU-06/T4:
_bucket_ privado `report-evidences`, creado por migración, y sus políticas de
`storage.objects`, que prueba `report_evidences_storage.test.sql`). Realtime,
Edge Functions y Analytics están desactivados. El registro por correo requiere
confirmación; los enlaces de prueba se reciben en el servidor SMTP local.
No hay archivos seed; T2 siembra los roles y T3 los seis permisos y sus doce asignaciones iniciales. La CLI v3 usa el entorno local por defecto; los comandos de esta
sección no llevan `--remote` y no necesitan login ni enlazar el proyecto remoto.

Requisitos: Node.js 24, npm 11 o 12, Docker con motor Linux y puertos 54320–54324
libres. Ejecutar desde la raíz:

```sh
npm ci
npm run supabase:start
npm exec -- supabase migration up
npm exec -- supabase migration list
npm run test:db
npm run supabase:stop
```

En una instancia nueva, `start` inicializa el esquema de Supabase y aplica las
migraciones del repositorio. Si ya existe una instancia con datos, `migration up`
aplica únicamente las pendientes. No utilizar `db reset` sobre datos que deban
conservarse. `stop` conserva los volúmenes; no usar `--no-backup` ni `--all` para
el trabajo ordinario.

La CLI descarga imágenes la primera vez. La API local está en
`http://127.0.0.1:54321`, PostgreSQL en 54322 y Studio en 54323. `start` y `status`
pueden imprimir claves locales: no copiar su salida a Git, incidencias ni logs
compartidos. Tampoco exportar claves privilegiadas a `NEXT_PUBLIC_`.

Para reproducir el job de CI sin servicios visuales ni correo:

```sh
npm exec -- supabase start --exclude studio,postgres-meta,mailpit
npm run test:db
npm exec -- supabase stop
```

## Migración de perfiles

`migrations/20261110154948_create_profiles.sql`, creada con `supabase migration
new create_profiles`, define:

- `public.profiles`, seis atributos originales (siete después de T2) y sus restricciones, con UUID compartido y FK
  `ON DELETE RESTRICT` a `auth.users`.
- `private.create_profile_for_auth_user()`, invocada después de insertar en Auth,
  que crea un perfil con valores predeterminados sin copiar metadatos.
- Backfill de las identidades existentes. El trigger se instala antes del backfill;
  la PK y `ON CONFLICT (id) DO NOTHING` impiden duplicar perfiles.
- `private.set_profile_updated_at()`, que preserva `created_at` y actualiza
  `updated_at` solo cuando cambian los datos del perfil.
- RLS explícita y permiso `SELECT` a `authenticated` limitado al perfil propio
  activo. Sin escritura pública ni acceso anónimo o administrativo por API.

La función de creación es `SECURITY DEFINER` para permitir que Auth cree el perfil
sin concederle acceso general a la tabla. Ambas funciones tienen `search_path`
vacío y ejecución pública revocada; `private` no figura en `api.schemas`. La
función de fechas es `SECURITY INVOKER`. El trigger de Auth propaga errores y
revierte la inserción de identidad si no puede crear su perfil.

La migración revoca explícitamente los posibles grants por defecto, incluidos
los de `service_role`, y concede solo lo necesario. No depende de que la exposición
automática de tablas esté habilitada. Futuras migraciones deben conceder permisos
y políticas de manera explícita y probarlos conjuntamente, sin habilitar RPC
privilegiadas como atajo. Si se amplía `profiles`, revisar también qué cambios
requieren actualizar la fecha y el tipo TypeScript.

El [diseño de dominio](../docs/domain-design.md) describe atributos, límite de
conversión de decimales a `SMALLINT`, desactivación, preservación de identidades y
consecuencias de la FK ante necesidades excepcionales de eliminación. La política
sobre perfiles no revoca sesiones ni protege futuras tablas y endpoints.

## Migración de roles

`migrations/20261111113011_create_roles.sql`, generada mediante `supabase migration
new create_roles`, añade el catálogo con PK textual y CHECK de los tres códigos:
`collaborator` (Colaborador), `developer` (Desarrollador), `admin` (Administrador).
El nombre es obligatorio, de 1–80 caracteres, sin controles y no solo espacios;
la descripción es texto opcional. No crea identidades ni cuentas administrativas.

Primero siembra el catálogo y después añade `profiles.role_code TEXT NOT NULL
DEFAULT 'collaborator'` con FK `ON UPDATE RESTRICT ON DELETE RESTRICT`. PostgreSQL
17 aplica el default constante también a filas anteriores, sin reescribir sus
atributos o disparar UPDATE. La función de fechas se reemplaza para comparar
además `role_code`, manteniendo invocador, search_path vacío y ACL privadas.
El trigger de alta Auth permanece intacto y no lee roles de metadatos.

El catálogo tiene RLS explícita; se revocan los grants de `PUBLIC`, `anon`,
`authenticated` y `service_role`, concediendo solo SELECT a `authenticated`
con política explícita. La política del perfil propio activo no cambia y no hay
escrituras públicas, ni de tabla ni de columna. Leer roles no concede capacidades.

## Autorización administrativa (HU-14/T3)

La [migración T3](migrations/20261119104009_role_permissions.sql) ocupa el séptimo lugar de las ocho migraciones.
La octava, [bucket de evidencias](migrations/20261119120000_create_report_evidences_bucket.sql), crea el bucket privado y sus tres políticas de Storage. La PK compuesta de `role_permissions` cubre la búsqueda por rol y
evita duplicados. Las FK restringen cambios en los catálogos. Son seis códigos y un máximo
de doce asignaciones iniciales, por lo que el índice de la PK basta para estas consultas.

RLS está habilitada sin políticas de acceso directo sobre `permissions`,
`role_permissions` y `private.authorization_audit`. Los clientes carecen de grants
sobre ellas, también `service_role`. Solo `authenticated` recibe EXECUTE en las cinco RPC
públicas y sus implementaciones de `authorization_internal`. Este esquema tiene USAGE
limitado y queda fuera de `api.schemas`. Los dos helpers de comprobación son internos
al propietario. Mantener también `private` fuera de los esquemas expuestos.

El cambio de rol y la modificación de asignaciones toman un bloqueo sobre la fila del
rol admin, revalidan el perfil del actor con `FOR SHARE` y rechazan cambios del rol propio.
Un segundo administrador que haya perdido el rol durante la espera ya no puede completar
la operación. La ruta no cambia actividad ni confianza. La mutación y su auditoría forman
una única transacción. El registro conserva los UUID históricos, las transiciones y la hora
de PostgreSQL. Los códigos y asignaciones iniciales cambian mediante migraciones deliberadas.
El contrato de [autorización](../docs/api/authorization.md) describe las asignaciones editables.

### Primera cuenta administradora (operación posterior pendiente)

Una instalación nueva admite cero administradores. Tras el alta real de Auth, el operador SQL
autorizado verificará el proyecto, la identidad y el perfil activo por UUID. En una transacción,
bloqueará la fila del rol admin y el perfil elegido, comprobará que sigue sin existir un
administrador activo y actualizará únicamente el rol de esa fila. Verificará que cambió
exactamente una cuenta y que existe un administrador activo antes de confirmar. Ante cualquier
discrepancia revertirá la transacción. Registrar responsable, autorización y fecha en el
registro operativo del equipo. Este bootstrap de propietario es independiente de la auditoría
de operaciones JWT. La migración y el arranque nunca seleccionan una cuenta para promoverla.

Las suites `permissions_model`, `permissions_admin` y `permissions_migration` verifican
ACL, RPC, auditoría, bloqueos reales con `pgrowlocks` y conservación de datos al reproducir
la migración del historial. La extensión de inspección se crea dentro de la transacción de prueba.

## Pruebas PostgreSQL y RLS

`npm run test:db` ejecuta `supabase test db` con pgTAP sobre la instancia local.
La CLI prepara pgTAP; no se añaden dependencias al esquema de aplicación.

- `profiles_model.test.sql`: columnas, restricciones, creación automática,
  metadatos ignorados, valores límite, fechas, FK conservadora y rollback ante
  un fallo de creación.
- `profiles_rls.test.sql`: ACL de tabla/columnas, funciones privadas y consultas
  como `anon` y `authenticated` con `SET LOCAL ROLE` y `request.jwt.claims`.
  Comprueba identidad propia/ajena/ausente, cuenta inactiva y escrituras denegadas.
  Con grants temporales comprueba además la protección independiente de RLS.
- `profiles_backfill.test.sql`: reconstruye transaccionalmente el estado previo
  a perfiles y reproduce el SQL exacto guardado por la CLI en
  `supabase_migrations.schema_migrations`; prueba identidades preexistentes y
  posteriores. No mantiene una copia paralela de la migración.

- `roles_model.test.sql`: catálogo exacto, integridad, defaults, metadatos ignorados,
  FK conservadora y fechas ante cambio de rol, no-op e intento de falsificación.
- `roles_rls.test.sql`: lectura autenticada, denegación anónima, ACL de tabla y
  columna, escrituras y autopromoción denegadas; grants temporales aíslan RLS.
- `roles_backfill.test.sql`: restaura transaccionalmente el esquema T1 y reproduce
  T2 desde el historial real; verifica preservación de atributos y fechas y el
  default para perfiles existentes. La prueba histórica de T1 sigue funcionando:
  al eliminar profiles desaparece su FK saliente y roles permanece sin conflicto.

Cada archivo usa `BEGIN`/`ROLLBACK`, UUID propios y un plan pgTAP; datos, DDL y
grants temporales desaparecen al finalizar o abortar la conexión. Estas pruebas
son exclusivamente para instancias locales aisladas: la prueba de backfill toma
bloqueos DDL y no debe ejecutarse en un entorno compartido. Al introducir futuras
relaciones, mantener esta prueba de transición o adaptarla para cubrir la nueva
secuencia de migraciones. Los resultados SQL son independientes de la cobertura
V8 de TypeScript.

Comprobaciones adicionales locales:

```sh
npm exec -- supabase db lint --schema public,private,authorization_internal --fail-on warning
npm exec -- supabase db advisors --type security --fail-on error
```

Consultar `--help` al actualizar la CLI. La CLI 3 ya no necesita `--local` para
estos comandos. No confundir un asesor del remoto sin migrar con la revisión del
esquema local.

## Integración continua y despliegue posterior

El job `database` de `.github/workflows/ci.yml` usa Node 24, npm 12.2.1 y la CLI del
lockfile. Verifica que existen migraciones y pruebas, inicia Supabase en el Docker
del runner con una base nueva, aplica las migraciones mediante `start` y ejecuta
pgTAP. Un error de arranque, SQL o pruebas falla el job. `always()` detiene los
servicios incluso tras fallos. La salida del arranque se guarda en un archivo
temporal del runner para no publicar claves locales. No se conecta al remoto,
no utiliza secretos ni oculta fallos con `continue-on-error`.

El despliegue remoto se realizará posteriormente por el procedimiento acordado
por el equipo: revisar SQL y diff, superar CI y revisión humana, confirmar el
proyecto y su historial, comprobar identidades preexistentes y respaldo, y aplicar
las migraciones versionadas en orden con una identidad autorizada. Verificar después historial,
triggers, RLS y asesores. No sustituirlo por cambios manuales en el SQL Editor;
los cambios posteriores deben quedar en nuevas migraciones. T1, T2 y T3 no incluyen ese
despliegue ni modificaciones administrativas de Auth remoto.

Referencias oficiales: [datos de usuario y triggers](https://supabase.com/docs/guides/auth/managing-user-data),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[pgTAP](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) y
[cambios de CLI v3](https://supabase.com/changelog/supabase-cli-v3).
