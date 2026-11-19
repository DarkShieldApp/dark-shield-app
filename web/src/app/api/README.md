# API HTTP

Route Handlers de Next.js (`<recurso>/route.ts`) que exponen la API HTTP consumida por la plataforma web y la extensión de navegador.

Los handlers validan la entrada y la identidad del usuario y delegan las reglas de negocio en `src/server/`.

## Endpoints disponibles

| Método | Ruta           | Descripción                                                                                                  | Especificación                                         |
| :----- | :------------- | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| `POST` | `/api/reports` | Crea y persiste un nuevo reporte de _dark pattern_ asociado a un colaborador autenticado y activo (`HU-05`). | [docs/api/reports.md](../../../../docs/api/reports.md) |
