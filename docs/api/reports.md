# Especificación de la API de Reportes (`/api/reports`)

Este documento define el contrato HTTP, el formato de datos de entrada y salida, las reglas de validación y los códigos de respuesta de los endpoints de reportes de _dark patterns_: creación (`POST`, `HU-05`, secciones 1–5) y consulta por página o dominio (`GET`, `HU-01/T3`, [sección 6](#6-get-apireports--consulta-por-página-o-dominio)).

- **Implementación del Route Handler:** `web/src/app/api/reports/route.ts`
- **Lógica de dominio y persistencia:** `web/src/server/reports.ts`
- **Reglas de validación compartidas:** `web/src/lib/reports/validation.ts`
- **Códigos y estados de la consulta:** `web/src/lib/reports/query.ts`
- **Tabla destino en PostgreSQL / Supabase:** `public.reports`

La consulta pública `GET /api/reports` por página o dominio ya está implementada.
La creación dispone de handler y modelo. El formulario todavía envía la petición sin
Bearer y la BD de esta rama mantiene cerradas las inserciones de `reports`.
HU-05 integrará `reports.create` junto con las reglas de la operación. Véanse
el [contrato de consulta](../domain-design.md) y la [API de autorización](authorization.md).

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
  "targetUrl": "https://shop.example.co.uk/pricing?utm_source=campaign#plans",
  "category": "hidden_costs",
  "title": "Gastos de gestión obligatorios ocultos hasta el último paso",
  "description": "El precio mostrado en el catálogo no incluye una comisión fija del 15% que aparece únicamente al confirmar el pago.",
  "stepsToReproduce": "1. Seleccionar cualquier producto.\\n2. Avanzar al resumen de compra.\\n3. Observar el recargo añadido automáticamente."
}
```

---

## 4. Normalización y datos persistidos (`201 Created`)

Antes de insertar el registro en `public.reports`, el servidor deriva y normaliza automáticamente los campos de indexación definidos por el modelo de datos y por el contrato de consulta (`HU-01/T2`):

- **`page_key`:** URL normalizada según el [estándar URL de WHATWG](https://url.spec.whatwg.org/) conservando protocolo, host y ruta (`protocol//hostpathname`), eliminando parámetros de consulta (`?`) y fragmentos (`#`). El host pasa a minúsculas, los IDN a _punycode_ y se elimina el puerto por defecto; la ruta conserva mayúsculas y barra final.
- **`target_host`:** Nombre de host en minúsculas (por ejemplo, `shop.example.co.uk`).
- **`registrable_domain`:** Dominio registrable según la [Public Suffix List](https://publicsuffix.org/list/), incluida su sección privada (por ejemplo, `example.co.uk`, `example.com` o `ana.github.io`). Si el host no tiene dominio registrable (una IP), se guarda el host. Es la misma función que usa la consulta por dominio, por lo que la clave coincide en ambos lados.
- **`target_url`:** URL completa tal como se envió, query y fragmento incluidos. Solo la leen usuarios autenticados; la consulta pública no la expone (véase la [sección 6](#6-get-apireports--consulta-por-página-o-dominio)).
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
    "target_url": "https://shop.example.co.uk/pricing?utm_source=campaign#plans",
    "page_key": "https://shop.example.co.uk/pricing",
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

---

## 6. `GET /api/reports` — Consulta por página o dominio

Consulta de solo lectura (`HU01-FL-01`) de los reportes asociados a una página o a un dominio, según el [contrato HU-01/T2](../domain-design.md#hu-01t2--diseño-de-consulta-por-página-o-dominio). Busca en los datos guardados en Dark-Shield: no visita ni analiza la página externa.

| Propiedad                | Valor                                                                                                  |
| :----------------------- | :----------------------------------------------------------------------------------------------------- |
| **Método HTTP**          | `GET`                                                                                                  |
| **Ruta**                 | `/api/reports`                                                                                         |
| **Autenticación**        | No requerida (`HU01-FL-07`). El servidor consulta con la clave publicable, es decir, con el rol `anon` |
| **Formato de respuesta** | `application/json`                                                                                     |
| **Orden**                | `created_at` descendente, con `id` descendente como desempate estable                                  |

### Parámetros

| Parámetro | Obligatorio | Contrato                                                                                          |
| :-------- | :---------: | :------------------------------------------------------------------------------------------------ |
| `scope`   |     Sí      | `page` o `domain` (no distingue mayúsculas). No se infiere.                                       |
| `target`  |     Sí      | `scope=page`: URL absoluta `http`/`https`. `scope=domain`: dominio, subdominio o URL HTTP(S).     |
| `limit`   |     No      | Entero de 1 a 100. Valor predeterminado: 20.                                                      |
| `cursor`  |     No      | Valor `nextCursor` de la respuesta anterior, sin modificar. Es opaco: no debe construirse a mano. |

`target` admite como máximo 2048 caracteres y ningún carácter de control. El servidor repite la normalización y la validación aunque el cliente ya haya quitado query y fragmento.

### Normalización y correspondencia

Las URLs se interpretan con el [estándar URL de WHATWG](https://url.spec.whatwg.org/) (`new URL`), sin expresiones regulares propias.

- **`scope=page`:** la clave es `protocol//host` + ruta y se compara con `page_key`. El host pasa a minúsculas, los IDN a _punycode_ y se elimina el puerto por defecto (`:443` en `https`, `:80` en `http`); los demás puertos se conservan. La ruta conserva mayúsculas y barra final, y el esquema distingue `http` de `https`. Query (`?`) y fragmento (`#`) se excluyen. Se admiten IP, que se comparan como host exacto. Se rechazan otros esquemas y URLs con credenciales.
- **`scope=domain`:** se obtiene el host con el mismo parser (un dominio sin esquema se interpreta como `http://<target>`; puerto y ruta se ignoran) y se calcula su dominio registrable con la [Public Suffix List](https://publicsuffix.org/list/), incluida la sección privada. Se compara con `registrable_domain`, de modo que se incluyen el dominio y todos sus subdominios respetando el límite de etiqueta. Se rechazan IP, nombres que son solo un sufijo público (`co.uk`, `github.io`, `localhost`), credenciales y esquemas distintos de `http`/`https`.

| Solicitud                                                    | Clave                                   | Coincide con                                    | No coincide con                               |
| :----------------------------------------------------------- | :-------------------------------------- | :---------------------------------------------- | :-------------------------------------------- |
| `scope=page`, `https://Shop.Example.com:443/pricing?c=x#top` | `https://shop.example.com/pricing`      | Reportes de esa ruta con cualquier query        | `http://…/pricing`, `…/pricing/`, `…/Pricing` |
| `scope=page`, `https://Bücher.example/Ofertas`               | `https://xn--bcher-kva.example/Ofertas` | La misma URL escrita en Unicode o en _punycode_ | —                                             |
| `scope=domain`, `blog.shop.example.co.uk`                    | `example.co.uk`                         | `example.co.uk`, `shop.example.co.uk`           | `other.co.uk`                                 |
| `scope=domain`, `example.com`                                | `example.com`                           | `example.com`, `shop.example.com`               | `notexample.com`, `example.com.attacker.test` |
| `scope=domain`, `docs.ana.github.io`                         | `ana.github.io` (sección privada)       | `ana.github.io`, `docs.ana.github.io`           | `luis.github.io`                              |

### Ejemplos de petición

```http
GET /api/reports?scope=page&target=https%3A%2F%2Fshop.example.com%2Fpricing HTTP/1.1
```

```http
GET /api/reports?scope=domain&target=example.co.uk&limit=10 HTTP/1.1
```

```http
GET /api/reports?scope=domain&target=example.co.uk&limit=10&cursor=<nextCursor> HTTP/1.1
```

### Respuesta correcta (`200 OK`)

```json
{
  "items": [
    {
      "id": "aaaaaaaa-1111-2222-3333-444444444444",
      "title": "Suscripción oculta en checkout",
      "description": "Se marca automáticamente una casilla de suscripción recurrente.",
      "pattern_type": "sneaking",
      "target_url": "https://tienda.example.com/checkout",
      "page_key": "https://tienda.example.com/checkout",
      "created_at": "2026-11-18T10:00:00.000Z",
      "credibility": {
        "level": "medium",
        "score": 50,
        "sufficientData": false,
        "updatedAt": "2026-11-18T10:00:00.000Z",
        "factors": {
          "visibleEvidences": 0,
          "validations": 0,
          "invalidations": 0,
          "assessors": 0,
          "supportWeight": 0,
          "againstWeight": 0
        }
      }
    }
  ],
  "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTExLTE4VDEwOjAwOjAwLjAwMFoiLCJpZCI6ImFhYWFhYWFhLTExMTEtMjIyMi0zMzMzLTQ0NDQ0NDQ0NDQ0NCJ9"
}
```

| Campo                  | Descripción                                                                                                       |
| :--------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `items[].id`           | UUID del reporte.                                                                                                 |
| `items[].title`        | Título del reporte.                                                                                               |
| `items[].description`  | Descripción guardada (incluye los pasos para reproducir).                                                         |
| `items[].pattern_type` | Categoría (`ReportCategory`) o `null`.                                                                            |
| `items[].target_url`   | URL de la página **sin query ni fragmento**; es igual a `page_key` (véase «Privacidad de la proyección pública»). |
| `items[].page_key`     | Clave de página normalizada.                                                                                      |
| `items[].created_at`   | Fecha de creación (ISO 8601).                                                                                     |
| `items[].credibility`  | Estado de credibilidad (HU-01/T7 y HU-09) o `null` si no está disponible; véase «Credibilidad en el listado».     |
| `nextCursor`           | Cursor para pedir la página siguiente, o `null` si no hay más resultados.                                         |

Si no hay coincidencias, la respuesta es `200 OK` con `{ "items": [], "nextCursor": null }`: es una búsqueda completada sin resultados, no un error (`HU01-FL-03`). La respuesta no incluye `author_id`.

### Credibilidad en el listado

Desde HU-01/T7 cada item lleva el campo **aditivo** `credibility`. Los clientes anteriores pueden ignorarlo y los nuevos deben aceptar que falte. El servidor lo obtiene con una sola llamada a `getReportsCredibility` por página (la RPC `report_credibility_inputs`), usando el mismo cliente sin sesión que la consulta, y no la hace si la página está vacía. Diseño y fórmula en [`docs/domain-design.md`](../domain-design.md#credibilidad-de-reportes-hu-09).

| Campo                        | Descripción                                                                                                       |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| `credibility.level`          | `low`, `medium` o `high`. Solo tiene significado si `sufficientData` es `true`.                                   |
| `credibility.score`          | Puntuación de 0 a 100. Es un dato del cálculo y el listado no la muestra como veredicto.                          |
| `credibility.sufficientData` | `false` si aún no hay valoraciones suficientes. En ese caso `level` es `medium` en el sentido de «indeterminado». |
| `credibility.updatedAt`      | Fecha de la entrada contada más reciente o, si no hay ninguna, la de creación del reporte (ISO 8601).             |
| `credibility.factors`        | Recuentos y pesos del cálculo. Su explicación corresponde a HU-09/T3.                                             |

Semántica:

- **`null`:** la credibilidad no está disponible para ese reporte (el cálculo no devolvió resultado para él o falló). El cliente muestra «Credibilidad no disponible» y no la infiere.
- **Datos insuficientes:** con `sufficientData` distinto de `true`, el cliente muestra «Datos insuficientes», nunca «Media», aunque `level` traiga otro valor.
- **Valoración dinámica:** la credibilidad se calcula al consultar y cambia con nuevas evidencias y valoraciones (HU01-FL-06). No es una garantía de que el patrón exista.
- **Fallo de credibilidad:** si la RPC falla o devuelve agregados incoherentes, el error se registra en el servidor y la respuesta sigue siendo `200 OK` con los reportes y `credibility: null` en cada uno. Nunca se convierte en error ni en lista vacía.
- **Cliente:** `parseReportsResponse` acepta `credibility` ausente, `null` o bien formado. Si un item lo trae mal formado, ese item pasa a `credibility: null` y el resto de la respuesta se conserva.

### Privacidad de la proyección pública

`target_url` guarda la URL tal como se reportó y puede conservar la query (identificadores de seguimiento o de sesión). Por eso:

- `GET /api/reports` no lee la columna `target_url` y devuelve en el campo `target_url` el valor de `page_key`, que ya excluye query y fragmento. Se mantiene el nombre del campo para no romper a los clientes de HU-01/T4 y T6.
- La migración `20261119130000_reports_hide_target_url_from_anon.sql` retira a `anon` el permiso de lectura de `target_url`, para que la clave publicable tampoco pueda leerla directamente desde PostgREST. Los usuarios autenticados la siguen leyendo.
- Los datos guardados no se modifican.

### Respuestas de error

Todas las respuestas de error tienen la forma `{ "error": { "code", "message" } }`. Los códigos `400` son estables (`QUERY_ERROR_CODES` en `web/src/lib/reports/query.ts`); el mensaje puede cambiar. Se comprueban en este orden y se devuelve el primero que falla: `scope`, presencia de `target`, longitud y caracteres de `target`, formato de `target`, `limit` y `cursor`.

| Código HTTP | `error.code`            | Causa                                                                                                     |
| :---------: | :---------------------- | :-------------------------------------------------------------------------------------------------------- |
|    `400`    | `INVALID_QUERY_SCOPE`   | Falta `scope` o no es `page` ni `domain`.                                                                 |
|    `400`    | `MISSING_QUERY_TARGET`  | Falta `target` o está vacío.                                                                              |
|    `400`    | `INVALID_QUERY_TARGET`  | `target` supera 2048 caracteres o contiene caracteres de control.                                         |
|    `400`    | `INVALID_TARGET_URL`    | `scope=page` con una URL que no es absoluta, no usa `http`/`https`, no tiene host o incluye credenciales. |
|    `400`    | `INVALID_TARGET_DOMAIN` | `scope=domain` con un dominio mal formado, una IP, un sufijo público, credenciales u otro esquema.        |
|    `400`    | `INVALID_QUERY_LIMIT`   | `limit` no es un entero entre 1 y 100.                                                                    |
|    `400`    | `INVALID_QUERY_CURSOR`  | `cursor` no procede de una respuesta anterior (no decodifica o no contiene una fecha ISO 8601 y un UUID). |
|    `400`    | `INVALID_QUERY`         | La URL de la propia petición no se puede interpretar (no ocurre con peticiones HTTP normales).            |
|    `500`    | `QUERY_FAILED`          | La base de datos devolvió un error. Se puede reintentar; nunca se presenta como lista vacía.              |
|    `500`    | `INTERNAL_ERROR`        | Error inesperado en el servidor.                                                                          |
|    `503`    | `SERVICE_UNAVAILABLE`   | Faltan las variables de entorno de conexión con Supabase en el servidor. Se puede reintentar más tarde.   |

```json
{
  "error": {
    "code": "INVALID_TARGET_DOMAIN",
    "message": "El objetivo de búsqueda no puede ser únicamente un sufijo público."
  }
}
```

### Public Suffix List: implementación y actualización

- Se usa [`tldts`](https://github.com/remusao/tldts) (licencia MIT) con versión exacta en `web/package.json`. Incluye una copia de la PSL con las secciones ICANN y privada, y se usa con `allowPrivateDomains: true`.
- La misma función (`extractRegistrableDomain` en `web/src/server/reports.ts`) calcula `registrable_domain` al crear y la clave al consultar.
- La PSL cambia con frecuencia y `tldts` publica una versión con cada actualización. Política: revisar y subir `tldts` (y su `tldts-core`) al menos una vez por sprint, con versiones de al menos dos semanas de antigüedad, y ejecutar `reports-query.test.ts` y `reports-api.test.ts`.
- **Limitación conocida:** los reportes creados antes de HU-01/T3 calcularon `registrable_domain` con una heurística de sufijos fija. Para hosts bajo sufijos privados (`*.github.io`) u otros sufijos que no estaban en esa lista, el valor guardado puede diferir del actual y esos reportes no aparecerán en la consulta por dominio hasta que se recalcule la columna. Esta tarea no modifica datos guardados.

### Fuera de alcance

Explicación de los factores de la credibilidad (HU-09/T3), interfaz de consulta (HU-01/T4 y T6) y limitación de uso frente a extracción masiva (HU-23).
