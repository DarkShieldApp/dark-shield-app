# ADR-004 — Persistencia con Supabase

- **Fecha:** 9 de noviembre de 2026.
- **Estado:** Supabase y Supabase Auth adoptados; SDK, CLI y perfil de usuario HU-14/T1 implementados el 10 de noviembre de 2026. T2 añade catálogo y rol principal el 11 de noviembre de 2026. T3 añade permisos efectivos y administración auditada. El repositorio también contiene reportes, valoraciones y evidencias. HU-11/T1–T2 incorpora cliente y acceso por enlace de correo; persistencia, renovación y autorización de rutas siguen pendientes.

## Contexto

El ConOps requiere conservar usuarios, reportes, evidencias, validaciones y otros datos del sistema. La elección de Supabase como base de datos es una decisión del equipo previa al esqueleto.

## Decisión

Usar **Supabase / PostgreSQL** para la persistencia y reservar `supabase/migrations/` para cambios SQL versionados. **Supabase Auth** es el sistema elegido para HU-11; sus flujos todavía no están implementados. HU-06/T4 almacena evidencias en un bucket privado en **Supabase Storage**.

La lógica de negocio se centralizará en el servidor web. Al crear tablas expuestas se deberán diseñar las políticas RLS correspondientes, además de autorizar operaciones en los puntos adecuados. Las credenciales con privilegios y los secretos no estarán accesibles desde la extensión o el frontend.

HU-14/T1 separa `auth.users` (identidad) y `public.profiles` (dominio) mediante el
mismo UUID. Un trigger privado crea el perfil; la migración cubre identidades
preexistentes. `ON DELETE RESTRICT` protege frente a borrados accidentales en
cascada; la desactivación es lógica mediante `is_active`. Una eventual eliminación
legal o anonimización exige un procedimiento específico que considere todas las
referencias y los datos de Auth, fuera del alcance de T1.

La API solo concede lectura del perfil propio activo mediante grants explícitos
y RLS. T1 revoca la escritura directa. La función del
trigger de Auth usa privilegios del propietario porque Auth no puede insertar
perfiles directamente: esquema `private` no expuesto, `search_path` vacío,
referencias cualificadas y ejecución pública revocada. Las pruebas pgTAP verifican
permisos y políticas con roles reales, en PostgreSQL local y en un job de CI
independiente. No se despliega automáticamente al proyecto compartido.

## Catálogo y rol principal (HU-14/T2)

Se persisten exactamente tres códigos de dominio en `public.roles`: `collaborator`,
`developer` y `admin`, con nombres legibles y descripción opcional. Cada perfil
referencia un código mediante `role_code NOT NULL`, default `collaborator` y FK
con `RESTRICT` en actualización y borrado. La migración nueva aplica el default
a perfiles anteriores y conserva los triggers de T1, ampliando solo la comparación
de fechas para incluir el rol. Los metadatos Auth no intervienen en la asignación.

El catálogo tiene RLS y solo lectura autenticada; se revocan los grants por defecto.
El perfil conserva un solo rol. La matriz de T3 asocia roles y capacidades de forma explícita.

## Autorización por operación (HU-14/T3)

Next.js verifica el Bearer con Auth y consulta las capacidades actuales usando el
mismo cliente publicable. PostgreSQL acepta cinco RPC públicas `SECURITY INVOKER`.
Delegan en funciones específicas de `authorization_internal`, fuera de la Data API,
con SQL estático, `search_path` vacío y permisos de ejecución explícitos. El esquema
`private` sigue cerrado. Las comprobaciones parten de `auth.uid()`; solo el listado
administrativo puede proyectar perfiles ajenos. Así se evita la recursión de RLS y
se conservan las políticas existentes de perfiles y evidencias.

El coste de serializar escrituras administrativas es aceptable para estas operaciones
poco frecuentes. Todas adquieren el bloqueo de la fila del rol admin en el mismo
orden y revalidan al actor bajo bloqueo de perfil. Un cambio de rol conserva al actor
como administrador activo porque el destino debe ser distinto. La auditoría comparte
la transacción y los no-op conservan las fechas. El propietario SQL sigue siendo una
frontera de confianza para migraciones y bootstrap. Véase la [guía operativa](../../supabase/README.md).

## Consecuencias y asuntos abiertos

- El perfil tiene su esquema, migración y política inicial. Acordar las restantes entidades, relaciones y políticas al desarrollar sus HU.
- Completar las sesiones de HU-11 e integrar el permiso base de aportación de evidencias con HU-06.
- Las claves publicables **no** sustituyen RLS; las claves secretas o de `service_role` tienen privilegios especiales y deben permanecer bajo control del servidor.
- El plan Free puede facilitar el arranque, pero sus límites de capacidad, transferencia, almacenamiento o inactividad deberán revisarse antes de dimensionar. El proyecto remoto se crea manualmente y su configuración pública se mantiene en `web/.env`, fuera de Git; esta preparación no modifica su esquema.
- La confianza y credibilidad son reglas propias de DarkShield; PostgreSQL no las calcula automáticamente.
- `trust_level` almacena un entero 1–100, inicialmente 1. Los futuros puntos de escritura deben rechazar decimales antes de convertir a `SMALLINT`, ya que PostgreSQL puede redondear expresiones numéricas antes del CHECK.
- `is_active` no revoca sesiones ni extiende automáticamente la protección a otras tablas. HU-11 y permisos deberán integrar esas comprobaciones en cada operación.

No se ha decidido incorporar ORM ni un servicio de almacenamiento diferente. Se reconsiderarán alternativas si el desarrollo aporta una necesidad concreta.

**Referencias:** [arquitectura general](../architecture.md), [diseño del dominio](../domain-design.md), [guía de Supabase del repositorio](../../supabase/README.md) y [precios oficiales](https://supabase.com/pricing).
