# API HTTP

Route Handlers de Next.js (`<recurso>/route.ts`) que exponen la API HTTP consumida por la plataforma web y la extensión de navegador.

Los handlers validan la entrada y la identidad del usuario y delegan las reglas de negocio en `src/server/`.

## Endpoints disponibles

| Método      | Ruta                                                       | Uso                                                                                             |
| ----------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET, POST   | `/api/reports`                                             | Consulta pública y contrato de creación con Bearer. [Reportes](../../../../docs/api/reports.md) |
| GET         | `/api/me/permissions`                                      | Rol y permisos base actuales                                                                    |
| GET         | `/api/admin/users`                                         | Página de perfiles                                                                              |
| PATCH       | `/api/admin/users/{id}/role`                               | Rol de otra cuenta                                                                              |
| GET         | `/api/admin/roles/permissions`                             | Catálogo y matriz                                                                               |
| PUT, DELETE | `/api/admin/roles/{roleCode}/permissions/{permissionCode}` | Conceder o revocar una asignación                                                               |

Los formatos, la autenticación y los errores se detallan en el [contrato de autorización](../../../../docs/api/authorization.md).
