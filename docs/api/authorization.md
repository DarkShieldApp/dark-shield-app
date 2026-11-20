# API de autorización · HU-14/T3

Las seis operaciones requieren `Authorization: Bearer <access_token>`. El servidor
verifica la identidad con Supabase Auth y usa la clave publicable y ese mismo token
en PostgreSQL. Un perfil activo puede consultar sus permisos. Las otras operaciones
requieren además el rol `admin` y el permiso de la tabla. Todas las respuestas
llevan `Cache-Control: private, no-store`.

| Método y ruta                                                     | Permiso                    | Entrada                                                       | Éxito                                       |
| ----------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| GET `/api/me/permissions`                                         | Perfil activo              | Sin parámetros                                                | 200 con `{roleCode, permissions: string[]}` |
| GET `/api/admin/users`                                            | `users.read`               | `limit` entero 1–100 (20 por defecto), `cursor` UUID opcional | 200 con `{items, nextCursor}`               |
| PATCH `/api/admin/users/{id}/role`                                | `users.change_role`        | UUID y JSON `{"roleCode":"developer"}`                        | 204, cuerpo vacío                           |
| GET `/api/admin/roles/permissions`                                | `roles.manage_permissions` | Sin parámetros                                                | 200 con `{permissions, roles}`              |
| PUT `/api/admin/roles/{roleCode}/permissions/{permissionCode}`    | `roles.manage_permissions` | Códigos en la ruta                                            | 204, cuerpo vacío                           |
| DELETE `/api/admin/roles/{roleCode}/permissions/{permissionCode}` | `roles.manage_permissions` | Códigos en la ruta                                            | 204, cuerpo vacío                           |

El PATCH espera `Content-Type: application/json` y acepta exactamente un campo.
Los roles válidos son `collaborator`, `developer` y `admin`. La [matriz inicial](../domain-design.md#permisos-base-y-administración-hu-14t3)
enumera los seis códigos. Las tres asignaciones administrativas son fijas.
Solicitar una modificación de cualquiera de ellas o del rol propio devuelve 409.
Repetir un cambio permitido que ya surtió efecto devuelve 204 y conserva la auditoría.

**Ejemplo de permisos propios**

```json
{
  "roleCode": "developer",
  "permissions": ["assessments.submit", "evidences.add", "reports.create"]
}
```

**Ejemplo de página final**

```json
{
  "items": [
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "displayName": null,
      "roleCode": "developer",
      "isActive": true
    }
  ],
  "nextCursor": null
}
```

La lista incluye perfiles activos e inactivos ordenados por UUID ascendente. Cuando
hay otra página, `nextCursor` es el último UUID devuelto. La petición siguiente
usa `?cursor=<nextCursor>` y empieza después de ese UUID. Cada petición ve la BD actual.

La matriz contiene `permissions: {code, name, description: string | null}[]` y
`roles: {collaborator: string[], developer: string[], admin: string[]}`.
Los arrays de permisos se ordenan por código e incluyen solo asignaciones vigentes.

## Errores

Ejemplo de respuesta a un token ausente o mal formado:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Se requiere un token Bearer válido."
  }
}
```

| HTTP | Código                               | Condición                                                         |
| ---- | ------------------------------------ | ----------------------------------------------------------------- |
| 400  | `INVALID_INPUT`                      | UUID, JSON, rol, permiso o paginación inválidos                   |
| 401  | `UNAUTHENTICATED`, `INVALID_SESSION` | Falta Bearer válido, caducó el token o Auth no reconoce la sesión |
| 403  | `FORBIDDEN`                          | Perfil ausente, inactivo o sin facultad requerida                 |
| 404  | `USER_NOT_FOUND`                     | El actor autorizado intenta cambiar un perfil inexistente         |
| 409  | `AUTHORIZATION_CONFLICT`             | Cambio propio, asignación crítica o conflicto de serialización    |
| 500  | `INTERNAL_ERROR`                     | Fallo inesperado durante la operación                             |
| 503  | `SERVICE_UNAVAILABLE`                | Configuración de Supabase ausente o inválida                      |

## Integración por historia

Los módulos TypeScript pueden importar los tipos `EffectivePermissions`,
`PermissionCode`, `UserPage` y `PermissionMatrix` con `import type` desde
`@/server/authorization`. Un consumidor que ya trabaja en el servidor con un
cliente Bearer verificado puede consultar `rpc('my_permissions')`: devuelve
el mismo objeto que la ruta o `null` para un sujeto sin perfil activo.

- **HU-05** comprobará `reports.create`, identidad, actividad y reglas de creación antes de habilitar la escritura. La consulta pública funciona con su política de lectura.
- **HU-06** incorporará `evidences.add` al flujo de metadatos y Storage. Los [endpoints de evidencias](evidences.md) ya aplican Bearer, RLS y las políticas del bucket privado. Desde HU-06/CA1, los dos `POST` de evidencias comprueban `evidences.add` con `rpc('my_permissions')`: revocar este permiso ya bloquea nuevas subidas y confirmaciones (`403 FORBIDDEN_MISSING_PERMISSION`). La RLS y las políticas de Storage no lo consultan. Su moderación comprueba un administrador activo por `role_code`; la armonización requiere una decisión de permisos.
- **HU-08/T2** combina sesión, perfil activo, `assessments.submit` y un mínimo de confianza configurable mediante `checkAssessmentAuthorization`. Sin un mínimo válido deniega el acceso. Véase el [contrato para T4 y las decisiones pendientes](../hu08-t2-authorization.md). La tabla de valoraciones sigue cerrada a la API; elegibilidad del reporte y reglas de participación quedan para T4 tras su acuerdo funcional.
- **HU-10** podrá consumir los permisos propios al conectar el perfil de ejemplo con una sesión real. **HU-11** aportará registro, login, cookies y renovación.
- **HU-15 y HU-18** incorporarán capacidades específicas por decisión del equipo y nueva migración.

El consumidor puede usar la respuesta para mostrar acciones. La autorización
de cada escritura se comprueba al ejecutarla, con los datos actuales de PostgreSQL.
