# Especificación de la API de Evidencias (`/api/reports/{reportId}/evidences`)

Contrato HTTP para aportar y consultar evidencias de un reporte (HU-06/T4). Las decisiones de diseño están en [domain-design.md](../domain-design.md#contrato-de-persistencia-y-api-hu-06t4).

- **Route Handlers:** `web/src/app/api/reports/[reportId]/evidences/route.ts` y `.../evidences/uploads/route.ts`
- **Lógica y persistencia:** `web/src/server/evidences.ts`
- **Eliminación de metadatos:** `web/src/server/evidence-images.ts` (`sharp`)
- **Reglas compartidas:** `web/src/lib/evidences/rules.ts`
- **Cliente (navegador):** `web/src/lib/evidences/upload.ts`, usado por la interfaz de evidencias (HU-06/T3)
- **Datos:** tabla `public.report_evidences` y _bucket_ privado `report-evidences` de Supabase Storage

---

## 1. Resumen

| Método | Ruta                                        | Uso                                                         | Éxito |
| :----- | :------------------------------------------ | :---------------------------------------------------------- | :---: |
| `POST` | `/api/reports/{reportId}/evidences/uploads` | Paso 1: validar lo declarado y obtener URL de subida        | `201` |
| —      | URL firmada de Storage (`PUT`)              | Paso 2: subir el archivo directamente, sin pasar por la web | `200` |
| `POST` | `/api/reports/{reportId}/evidences`         | Paso 3: confirmar la subida y registrar la evidencia        | `201` |
| `GET`  | `/api/reports/{reportId}/evidences`         | Consultar las evidencias legibles con URL firmadas          | `200` |

**Autenticación:** obligatoria en los tres endpoints, con `Authorization: Bearer <access_token>` de Supabase Auth. El servidor valida el token con `supabase.auth.getUser(token)` y trabaja con un cliente sin privilegios: las consultas se ejecutan como `authenticated` bajo la RLS de la tabla y del _bucket_. No se usa `service_role` ni `@supabase/ssr` (mismo patrón que `POST /api/reports`).

**Perfil:** subir y confirmar exigen un perfil activo. Consultar solo exige sesión; la RLS decide qué se ve.

**Tipos y límites** (iguales en `rules.ts`, en el _bucket_ y en la tabla): solo `image/png`, `image/jpeg` e `image/webp`, sin PDF; hasta 10 MiB por archivo; como mucho 5 evidencias por colaborador y reporte, también las ocultas.

---

## 2. Paso 1 — `POST /api/reports/{reportId}/evidences/uploads`

```http
POST /api/reports/1a2b…/evidences/uploads HTTP/1.1
Content-Type: application/json
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>

{ "files": [{ "name": "captura.png", "type": "image/png", "size": 48211 }] }
```

- `files`: de 1 a 5 archivos con `name` (texto), `type` (MIME declarado) y `size` (bytes).
- Se valida lo declarado con `validateEvidenceDeclaration` (nombre, tamaño, tipo y coherencia entre extensión y MIME). La firma se comprueba en el paso 3 con los bytes reales.
- Se comprueba que el colaborador no supere 5 evidencias en el reporte; el _trigger_ de la base de datos es la garantía final.

Respuesta `201 Created`, en el mismo orden que `files`:

```json
{
  "uploads": [
    {
      "uploadId": "58d5430a-…",
      "path": "{user_id}/{reportId}/58d5430a-….png",
      "token": "…",
      "signedUrl": "https://…/storage/v1/object/upload/sign/report-evidences/…?token=…"
    }
  ]
}
```

## 3. Paso 2 — subida directa a Storage

El cliente sube cada archivo con `supabase.storage.from('report-evidences').uploadToSignedUrl(path, token, file, { contentType })` o con un `PUT` a `signedUrl`. Storage aplica los límites del _bucket_ (tamaño y MIME) y la URL no permite sobrescribir. Los bytes no pasan por la web, así que no les afecta el límite de cuerpo de Vercel (~4,5 MB).

## 4. Paso 3 — `POST /api/reports/{reportId}/evidences`

```json
{ "uploadId": "58d5430a-…", "originalName": "captura.png" }
```

Una evidencia por petición. El servidor:

1. Reconstruye la ruta del objeto a partir del usuario, el reporte, `uploadId` y la extensión canónica de `originalName` (`.jpg` para JPEG); nunca acepta una ruta del cliente.
2. Descarga el objeto y lo valida con `validateEvidenceFile` usando su tamaño real, el MIME guardado y sus primeros bytes (_magic bytes_).
3. **Recodifica la imagen con `sharp`** en el mismo formato: elimina EXIF, GPS, XMP, IPTC y comentarios, aplica la orientación y limita la decodificación a 40 megapíxeles. Vuelve a validar el resultado.
4. Guarda la copia limpia como `{user_id}/{reportId}/{evidenceId}.{ext}`, registra la fila (con su `sha256`) y borra el original.
5. Si algo falla, borra lo que haya guardado (compensación) y responde con el error.
6. Tras guardar, deja el punto de enganche de HU-06/T5 para recalcular la credibilidad; un fallo ahí se registra y no cambia el `201`. La función ya existe (HU-09/T2), pero el enganche no está conectado: corresponde a HU-06/T5. Debe hacerse así:

   ```ts
   import { recalculateReportCredibility } from '@/server/credibility';

   const options: EvidenceServiceOptions = {
     onEvidenceSaved: async (evidence) => {
       try {
         await recalculateReportCredibility(evidence.reportId, {
           cause: 'evidence_added',
           triggerId: evidence.id,
         });
       } catch {
         // Ya registrado; el 201 no cambia.
       }
     },
   };
   ```

   `onEvidenceSaved` ya se ejecuta dentro de un `try/catch`; el propio deja explícito que el fallo no se propaga. Errores y detalles en [la sección de HU-09](../domain-design.md#implementación-hu-09t2).

Respuesta `201 Created`:

```json
{
  "evidence": {
    "id": "d1b2c412-…",
    "reportId": "1a2b…",
    "originalName": "captura.png",
    "mimeType": "image/png",
    "sizeBytes": 40112,
    "moderationStatus": "visible",
    "createdAt": "2026-11-19T10:00:00.000Z"
  }
}
```

## 5. `GET /api/reports/{reportId}/evidences`

Parámetros opcionales: `limit` (1–50, por defecto 20) y `cursor` (opaco, el `nextCursor` anterior). Orden: `created_at` descendente con `id` como desempate.

```json
{
  "items": [
    {
      "id": "d1b2c412-…",
      "reportId": "1a2b…",
      "originalName": "captura.png",
      "mimeType": "image/png",
      "sizeBytes": 40112,
      "moderationStatus": "visible",
      "createdAt": "2026-11-19T10:00:00.000Z",
      "url": "https://…/storage/v1/object/sign/report-evidences/…?token=…",
      "urlExpiresAt": "2026-11-19T10:02:00.000Z"
    }
  ],
  "nextCursor": null
}
```

`url` es una URL firmada que caduca a los **120 s**. Solo se incluyen las evidencias que la RLS deja leer: las visibles de reportes legibles; además, el autor ve las suyas ocultas y un administrador activo ve todas. Sin evidencias, `200` con `items: []`.

---

## 6. Errores

Formato común de la API: `{ "error": { "code", "message", "details"? } }`.

| HTTP  | `error.code`                                    | Causa                                                                                                                                                                             |
| :---: | :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` | `INVALID_REQUEST`                               | JSON no válido, cuerpo que no es un objeto, campos ausentes o de otro tipo, `uploadId` que no es UUID, `limit` o `cursor` no válidos.                                             |
| `400` | `EVIDENCE_REJECTED`                             | Algún archivo no supera `rules.ts`. `details` es `[{ index, code }]` con los códigos de `EVIDENCE_ERROR_CODES`; el límite de archivos va con `index: null` y `EVIDENCE_TOO_MANY`. |
| `400` | `EVIDENCE_UPLOAD_MISSING`                       | Se confirma una subida que no existe.                                                                                                                                             |
| `401` | `UNAUTHENTICATED`                               | Token ausente, caducado o inválido. Mismo cuerpo siempre: «Sesión no válida o caducada.».                                                                                         |
| `403` | `FORBIDDEN_INACTIVE_PROFILE`                    | Perfil inexistente o inactivo al subir o confirmar.                                                                                                                               |
| `403` | `FORBIDDEN_ROLE`                                | El perfil activo no tiene el rol `collaborator`.                                                                                                                                  |
| `404` | `REPORT_NOT_FOUND`                              | `reportId` mal formado, inexistente u oculto por la RLS: no se distingue «no existe» de «no es visible».                                                                          |
| `409` | `EVIDENCE_DUPLICATE`                            | La misma imagen ya está asociada al reporte.                                                                                                                                      |
| `500` | `EVIDENCE_STORAGE_FAILED`                       | Fallo de Storage (firmar, descargar, guardar), tras la compensación.                                                                                                              |
| `500` | `EVIDENCE_PERSISTENCE_FAILED`                   | Fallo de la base de datos, tras la compensación.                                                                                                                                  |
| `500` | `PROFILE_LOOKUP_FAILED`, `REPORT_LOOKUP_FAILED` | No se pudo comprobar el perfil o el reporte.                                                                                                                                      |
| `500` | `INTERNAL_ERROR`                                | Error no previsto.                                                                                                                                                                |
| `503` | `SERVICE_UNAVAILABLE`                           | Supabase no está configurado en el servidor.                                                                                                                                      |

Ejemplo (`400 Bad Request`, _magic bytes_ falsos):

```json
{
  "error": {
    "code": "EVIDENCE_REJECTED",
    "message": "Alguno de los archivos no se puede aceptar como evidencia.",
    "details": [{ "index": 0, "code": "EVIDENCE_CONTENT_MISMATCH" }]
  }
}
```

---

## 7. Pendiente

- Limpieza periódica de subidas nunca confirmadas (objetos sin fila con más de 24 h): requiere un proceso con privilegios fuera de los handlers.
- Conectar el recálculo de credibilidad (HU-06/T5): `recalculateReportCredibility` ya está disponible (HU-09/T2); véase el paso 6.
- Moderación por administradores desde la aplicación: la RLS ya la permite, pero no hay endpoint.
- `POST /api/reports` usa todavía `INVALID_SESSION` para el token inválido; conviene alinearlo con el `401` único de esta API.
