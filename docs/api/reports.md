# Especificación de la API de Reportes (`POST /api/reports`)

Este documento define el contrato HTTP, el formato de datos de entrada y salida, las reglas de validación y los códigos de respuesta del endpoint de creación de reportes de _dark patterns_ (`HU-05`).

- **Implementación del Route Handler:** `web/src/app/api/reports/route.ts`
- **Lógica de dominio y persistencia:** `web/src/server/reports.ts`
- **Reglas de validación compartidas:** `web/src/lib/reports/validation.ts`
- **Tabla destino en PostgreSQL / Supabase:** `public.reports`

---

## 1. Resumen del endpoint

| Propiedad                | Valor                                                                                                      |
| :----------------------- | :--------------------------------------------------------------------------------------------------------- |
| **Método HTTP**          | `POST`                                                                                                     |
| **Ruta**                 | `/api/reports`                                                                                             |
| **Autenticación**        | Obligatoria mediante cabecera `Authorization: Bearer <access_token>` (token JWT emitido por Supabase Auth) |
| **Perfil requerido**     | Usuario autenticado con fila activa (`is_active = true`) en `public.profiles`                              |
| **Formato de petición**  | `application/json`                                                                                         |
| **Formato de respuesta** | `application/json`                                                                                         |

---

## 2. Cabeceras HTTP esperadas

```http
POST /api/reports HTTP/1.1
Content-Type: application/json
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

---

## 3. Formato de datos de entrada (Request Body)

El cuerpo de la petición debe ser un objeto JSON con los siguientes campos obligatorios. El servidor acepta tanto nomenclatura `camelCase` (principal) como alias en `snake_case`:

| Campo (`camelCase`) | Alias (`snake_case`) | Tipo     | Obligatorio | Restricciones y formato esperado                                                                                                                                                                 |
| :------------------ | :------------------- | :------- | :---------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetUrl`         | `target_url`         | `string` |     Sí      | URL absoluta con protocolo `http://` o `https://`, dominio válido (con al menos un punto), sin credenciales incrustadas (`user:pass@`) y longitud máxima de **2048 caracteres** tras normalizar. |
| `category`          | `pattern_type`       | `string` |     Sí      | Debe coincidir exactamente con uno de los valores del catálogo `ReportCategory` detallado abajo.                                                                                                 |
| `title`             | —                    | `string` |     Sí      | Texto no vacío (tras recortar espacios), entre **5 y 120 caracteres**, sin caracteres de control (`U+0000`–`U+001F`, `U+007F`).                                                                  |
| `description`       | —                    | `string` |     Sí      | Texto no vacío (tras recortar espacios), entre **15 y 2000 caracteres**.                                                                                                                         |
| `stepsToReproduce`  | `steps_to_reproduce` | `string` |     Sí      | Texto no vacío (tras recortar espacios) describiendo los pasos para reproducir el patrón, entre **10 y 2000 caracteres**.                                                                        |

### Valores permitidos para `category`

| Valor             | Significado                                                                   |
| :---------------- | :---------------------------------------------------------------------------- |
| `roach_motel`     | Suscripción o servicio fácil de contratar pero difícil de cancelar            |
| `hidden_costs`    | Costes ocultos o recargos sorpresa añadidos al final del proceso              |
| `false_urgency`   | Cuenta atrás o indicadores de escasez falsos para presionar la compra         |
| `sneaking`        | Elementos añadidos al carrito o casillas preseleccionadas sin consentimiento  |
| `confirmshaming`  | Redacción manipuladora o culpabilizadora para disuadir de rechazar una opción |
| `trick_questions` | Preguntas o controles redactados de forma confusa para inducir a error        |
| `other`           | Otro patrón oscuro no incluido en las categorías anteriores                   |

### Ejemplo de petición válida

```json
{
  "targetUrl": "[https://shop.example.co.uk/pricing?utm_source=campaign#plans](https://shop.example.co.uk/pricing?utm_source=campaign#plans)",
  "category": "hidden_costs",
  "title": "Gastos de gestión obligatorios ocultos hasta el último paso",
  "description": "El precio mostrado en el catálogo no incluye una comisión fija del 15% que aparece únicamente al confirmar el pago.",
  "stepsToReproduce": "1. Seleccionar cualquier producto.\\n2. Avanzar al resumen de compra.\\n3. Observar el recargo añadido automáticamente."
}
```

---

## 4. Normalización y datos persistidos (`201 Created`)

Antes de insertar el registro en `public.reports`, el servidor deriva y normaliza automáticamente los campos de indexación definidos por el modelo de datos y por el contrato de consulta (`HU-01/T2`):

- **`page_key`:** URL normalizada conservando protocolo, host y ruta (`protocol//hostpathname`), eliminando parámetros de consulta (`?`) y fragmentos (`#`).
- **`target_host`:** Nombre de host en minúsculas (por ejemplo, `shop.example.co.uk`).
- **`registrable_domain`:** Dominio registrable raíz (por ejemplo, `example.co.uk` o `example.com`).
- **`author_id`:** UUID extraído directamente de la sesión autenticada validada contra Supabase Auth (nunca aceptado desde el cuerpo de la petición).

### Ejemplo de respuesta exitosa (`201 Created`)

```json
{
  "report": {
    "id": "11111111-2222-3333-4444-555555555555",
    "author_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "title": "Gastos de gestión obligatorios ocultos hasta el último paso",
    "description": "El precio mostrado en el catálogo no incluye una comisión fija del 15% que aparece únicamente al confirmar el pago.\\n\\nPasos para reproducir:\\n1. Seleccionar cualquier producto.\\n2. Avanzar al resumen de compra.\\n3. Observar el recargo añadido automáticamente.",
    "pattern_type": "hidden_costs",
    "target_url": "[https://shop.example.co.uk/pricing?utm_source=campaign#plans](https://shop.example.co.uk/pricing?utm_source=campaign#plans)",
    "page_key": "[https://shop.example.co.uk/pricing](https://shop.example.co.uk/pricing)",
    "target_host": "shop.example.co.uk",
    "registrable_domain": "example.co.uk",
    "created_at": "2026-11-18T19:00:00.000Z"
  }
}
```

---

## 5. Respuestas de error y códigos HTTP

Todas las respuestas de error siguen una estructura uniforme con un código estable (`error.code`), un mensaje descriptivo (`error.message`) y, cuando procede, un mapa de errores por campo (`error.details`):

| Código HTTP | `error.code`                 | Causa                                                                                                        |
| :---------: | :--------------------------- | :----------------------------------------------------------------------------------------------------------- |
|    `400`    | `INVALID_JSON`               | El cuerpo de la petición no es un JSON sintácticamente válido.                                               |
|    `400`    | `INVALID_PAYLOAD`            | El JSON recibido no es un objeto (`null`, array o tipo primitivo).                                           |
|    `400`    | `INVALID_FIELD_TYPE`         | Alguno de los campos esperados no es una cadena de texto (`string`).                                         |
|    `400`    | `VALIDATION_ERROR`           | Faltan campos obligatorios o algún valor incumple las reglas de formato o longitud. Incluye `error.details`. |
|    `401`    | `UNAUTHENTICATED`            | No se proporcionó la cabecera `Authorization: Bearer <token>`.                                               |
|    `401`    | `INVALID_SESSION`            | El token proporcionado es inválido o ha expirado.                                                            |
|    `403`    | `FORBIDDEN_INACTIVE_PROFILE` | El usuario autenticado no tiene perfil activo (`is_active = false`).                                         |
|    `500`    | `PROFILE_LOOKUP_FAILED`      | Error interno al consultar el perfil del colaborador en Supabase.                                            |
|    `500`    | `REPORT_PERSISTENCE_FAILED`  | Error interno al insertar el reporte en `public.reports`.                                                    |
|    `503`    | `SERVICE_UNAVAILABLE`        | Faltan las variables de entorno de conexión con Supabase en el servidor.                                     |

### Ejemplo de respuesta de validación (`400 Bad Request`)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos del reporte contienen errores de validación.",
    "details": {
      "targetUrl": "Introduce una URL válida (por ejemplo, [https://ejemplo.com/ruta](https://ejemplo.com/ruta)).",
      "title": "El título breve del reporte es obligatorio."
    }
  }
}
```
