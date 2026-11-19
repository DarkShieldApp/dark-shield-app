# Código del servidor

Ubicación para las reglas de negocio, autorización e integraciones. `supabase.ts`
ofrece una factoría sin estado con clave publicable, protegida con `server-only`.
Añadir módulos por funcionalidad cuando lo requiera cada HU; no
concentrar toda la lógica en los Route Handlers.

Este código no debe importarse desde componentes con `"use client"` ni desde la
extensión. Al crear módulos con acceso a datos o secretos, usar `import 'server-only'`
y mantener esa frontera, comprobada por Next.js (la dependencia ya está instalada).

`profiles.ts` exporta los tipos `Profile`, `Role` y `RoleCode` de HU-14/T1–T2.
`Profile.role_code` es obligatorio; la unión `RoleCode` contiene `collaborator`,
`developer` y `admin`. Un rol no concede capacidades por sí solo. Usar
`import type { Profile } from '@/server/profiles'` en los futuros módulos del
servidor. Refleja la fila SQL, con UUID y fechas como cadenas JSON; no valida
entradas ni crea un cliente, servicio CRUD o sesión. Mantenerlo alineado con las
migraciones. La integridad y la autorización inicial se verifican en PostgreSQL.

`evidences.ts` implementa la API de evidencias de HU-06/T4 (subida directa en dos
pasos, confirmación y lectura) con el token Bearer del usuario y la RLS como
autoridad; `evidence-images.ts` recodifica las imágenes con `sharp` para eliminar
metadatos. Contrato en [docs/api/evidences.md](../../../docs/api/evidences.md).

Todavía no hay sesiones con cookies en Next.js. Uso y límites de
la factoría en [la guía de desarrollo](../../../docs/development.md#clientes-supabase).
