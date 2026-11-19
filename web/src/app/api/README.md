# API HTTP

Route Handlers de Next.js (`<recurso>/route.ts`) que exponen la API HTTP consumida por la plataforma web y la extensión de navegador.

Los handlers validan la entrada y la identidad del usuario y delegan las reglas de negocio en `src/server/`.

## Endpoints disponibles

| Método | Ruta                                        | Descripción                                                                                                  | Especificación                                             |
| :----- | :------------------------------------------ | :----------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| `POST` | `/api/reports`                              | Crea y persiste un nuevo reporte de _dark pattern_ asociado a un colaborador autenticado y activo (`HU-05`). | [docs/api/reports.md](../../../../docs/api/reports.md)     |
| `POST` | `/api/reports/{reportId}/evidences/uploads` | Paso 1 de la subida de evidencias: valida lo declarado y devuelve URL firmadas de Storage (`HU-06`).         | [docs/api/evidences.md](../../../../docs/api/evidences.md) |
| `POST` | `/api/reports/{reportId}/evidences`         | Paso 3: confirma la subida, elimina los metadatos y registra la evidencia (`HU-06`).                         | [docs/api/evidences.md](../../../../docs/api/evidences.md) |
| `GET`  | `/api/reports/{reportId}/evidences`         | Evidencias legibles de un reporte con URL firmadas de lectura (`HU-06`).                                     | [docs/api/evidences.md](../../../../docs/api/evidences.md) |
