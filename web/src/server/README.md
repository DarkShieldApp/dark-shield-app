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

La factoría de servidor recibe opcionalmente un Bearer. `session.ts` verifica su identidad
con `getUser(token)`. Reportes y autorización comparten esa comprobación. Las rutas
de permisos delegan en `authorization.ts`, que valida la entrada, comprueba el permiso
base y llama a PostgreSQL con el mismo cliente. Las RPC administrativas vuelven a
comprobar al actor. Véase el [contrato de autorización](../../../docs/api/authorization.md).

`reports.ts` crea y consulta reportes. Reexporta la factoría Bearer y conserva los cursores que utiliza HU-06. Véase el [contrato de reportes](../../../docs/api/reports.md).

`evidences.ts` implementa la API de evidencias de HU-06/T4 (subida directa en dos
pasos, confirmación y lectura) con el token Bearer del usuario y la RLS como
autoridad. Si falla la confirmación, el servidor intenta retirar los objetos escritos como compensación. El módulo `evidence-images.ts` recodifica las imágenes con `sharp` para eliminar
metadatos. Tras confirmar, recalcula la credibilidad del reporte (HU-06/T5) sin que un
fallo cambie la respuesta. Contrato en [docs/api/evidences.md](../../../docs/api/evidences.md).

`credibility.ts` calcula la credibilidad de los reportes (HU-09/T2) a partir de los
agregados de la RPC `report_credibility_inputs`; no escribe nada y lanza
`CredibilityError` si no puede calcularla. Diseño, errores y forma de invocarlo
tras guardar en [la sección de HU-09](../../../docs/domain-design.md#implementación-hu-09t2).

Todavía no hay sesiones con cookies en Next.js. Uso y límites de
la factoría en [la guía de desarrollo](../../../docs/development.md#clientes-supabase).
