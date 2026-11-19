# API HTTP

Route Handlers de Next.js (`<recurso>/route.ts`) que exponen la API HTTP consumida por la plataforma web y la extensión de navegador.

Los handlers validan la entrada y la identidad del usuario y delegan las reglas de negocio en `src/server/`.

## Endpoints disponibles

| Método      | Ruta                                                       | Uso                                                                                                       |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET         | `/api/reports`                                             | Consulta pública por página o dominio                                                                     |
| POST        | `/api/reports`                                             | Creación con perfil activo y Bearer. La sesión del formulario y el permiso de inserción están pendientes. |
| POST        | `/api/reports/{reportId}/evidences/uploads`                | Perfil activo. Valida la declaración y firma la subida directa a Storage.                                 |
| POST        | `/api/reports/{reportId}/evidences`                        | Perfil activo. Confirma, recodifica la imagen y registra la evidencia.                                    |
| GET         | `/api/reports/{reportId}/evidences`                        | Sesión Bearer. Lista las evidencias legibles según RLS con URL firmadas.                                  |
| GET         | `/api/me/permissions`                                      | Rol y permisos base actuales                                                                              |
| GET         | `/api/admin/users`                                         | Página de perfiles                                                                                        |
| PATCH       | `/api/admin/users/{id}/role`                               | Rol de otra cuenta                                                                                        |
| GET         | `/api/admin/roles/permissions`                             | Catálogo y matriz                                                                                         |
| PUT, DELETE | `/api/admin/roles/{roleCode}/permissions/{permissionCode}` | Conceder o revocar una asignación                                                                         |

Los contratos detallan la autenticación, la validación y los errores de cada operación.
Véanse [reportes](../../../../docs/api/reports.md), [evidencias](../../../../docs/api/evidences.md) y [autorización](../../../../docs/api/authorization.md).
