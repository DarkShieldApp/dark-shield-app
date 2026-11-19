# HU-08/T2 — Confianza y permisos para emitir valoraciones

`web/src/server/assessment-authorization.ts` implementa la comprobación del actor
para validar o invalidar. Está protegido por `server-only` y no escribe datos.
No decide todavía si un reporte concreto puede recibir esa valoración.

## Dependencias comprobadas

Se ha revisado el código fusionado, no solo los títulos de las PR:

- HU-14/T3 (PR #24, commit `d6f9fd9`): `session.ts` verifica el Bearer con
  `auth.getUser(token)`; la RPC `my_permissions` obtiene el sujeto de `auth.uid()`
  y consulta perfil activo y asignaciones vigentes en PostgreSQL. Sus tipos se
  comparten desde `authorization.ts`. El wrapper HTTP administrativo de ese módulo
  exige `admin` para sus operaciones; no corresponde reutilizar esa restricción
  para emitir valoraciones. Se consume la RPC según su
  [contrato de integración](api/authorization.md#integración-por-historia).
- HU-10/T2–T3 (PR #28, `e06c21b`): `getMyProfile` consulta únicamente el perfil
  propio activo y su `trust_level`. No modifica la confianza ni establece mínimos.
- HU-08/T1 mantiene pendiente el umbral en el
  [diseño del dominio](domain-design.md#condiciones-para-realizar-una-valoración).
  HU-09/T1 (PR #29, `0c967a4`) lo confirma: el 65 de la página de perfil es un
  ejemplo y las nuevas cuentas tienen confianza inicial 1. **No existe un mínimo
  funcional aprobado en estas fuentes.**
- HU-08/T3 persiste `assessor_id` y mantiene `report_assessments` cerrada a la API.
  Esta tarea no cambia sus permisos, restricciones ni migraciones.

## Configuración exclusiva del servidor

Definir `ASSESSMENTS_MIN_TRUST_LEVEL` en el entorno del servidor Next.js o en su
archivo local `web/.env`, con el entero que se apruebe funcionalmente. La variable
no lleva el prefijo `NEXT_PUBLIC_` y no tiene valor predeterminado. No se modifica
ningún `.env` ni se incluye un valor provisional en el repositorio.

Se acepta solo la representación decimal canónica de un entero entre 1 y 100:
sin espacios, signo, ceros iniciales, decimales, notación exponencial ni sufijos.
Si falta, está vacía o es inválida, la comprobación devuelve
`{ allowed: false, reason: 'POLICY_UNAVAILABLE' }` sin consultar Supabase.
El valor se lee en cada llamada, no al importar el módulo. Los números usados en
tests son fixtures para comprobar límites, no decisiones de negocio.

El build y las pruebas no necesitan configurar un mínimo real. Aprobar y configurar
el valor final corresponde al PO en coordinación con HU-10; hacerlo operativo
requiere también completar las reglas y la escritura de T4.

## Contrato para HU-08/T4

```ts
import { checkAssessmentAuthorization } from '@/server/assessment-authorization';

const decision = await checkAssessmentAuthorization(
  request.headers.get('authorization'),
);
// Si !decision.allowed, detener la operación; T4/T6 decidirán la respuesta HTTP.
// Si decision.allowed, usar decision.assessorId como identidad comprobada.
// Aún hay que comprobar reporte, participación y autorización en la escritura.
```

La función no recibe `userId`, perfil, rol, confianza, acción ni umbral del cliente.
El mismo control de actor sirve para ambas acciones. Devuelve la unión discriminada
`AssessmentAuthorization`:

- Éxito: `{ allowed: true, assessorId, trustLevel, minimumTrustLevel }`.
- Denegación: `{ allowed: false, reason }`, sin detalles internos ni identidad.

| `reason`              | Significado                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`     | Cabecera Bearer ausente o mal formada.                                                                               |
| `POLICY_UNAVAILABLE`  | Mínimo del servidor ausente o inválido.                                                                              |
| `INVALID_SESSION`     | Auth no devuelve una identidad válida o rechaza el token.                                                            |
| `PROFILE_UNAVAILABLE` | Perfil inexistente, inactivo, incompleto o de otro sujeto. La consulta propia no distingue ausencia y desactivación. |
| `PERMISSION_DENIED`   | La respuesta de permisos no contiene una lista válida con `assessments.submit`.                                      |
| `INVALID_TRUST_LEVEL` | Confianza persistida ausente o no entera en el intervalo 1–100.                                                      |
| `INSUFFICIENT_TRUST`  | Confianza menor que el mínimo; la igualdad sí se admite.                                                             |
| `SERVICE_UNAVAILABLE` | Configuración Supabase inválida, Auth indisponible, errores de consulta o excepciones.                               |

Orden: validar Bearer y configuración, verificar identidad con Auth, consultar el
perfil mediante HU-10, consultar la RPC de permisos HU-14 y comparar confianza.
Todas las consultas usan un cliente nuevo con clave publicable y el mismo Bearer;
no se emplean credenciales privilegiadas. Los IDs o metadatos que envíe un cliente
no sustituyen a la identidad verificada ni a los valores de PostgreSQL.

No hay caché de decisiones, confianza ni permisos. Una comprobación posterior
consulta las asignaciones actuales y refleja su revocación, también para un
administrador. El nombre del rol no concede ni impide por sí solo la participación.

**Límite de concurrencia:** Auth, perfil y permisos se consultan en peticiones
distintas; el resultado no es una autorización atómica con una futura inserción.
T4 debe invocar la comprobación al ejecutar cada operación y resolver la protección
en la frontera de escritura frente a cambios concurrentes de cuenta, confianza o
permisos. No debe reutilizar una decisión anterior o recibida del navegador.
La tabla sigue cerrada; T2 por sí sola no habilita escrituras ni evita esas carreras.

## Decisiones pendientes del PO

La propuesta de [HU-09/T1](domain-design.md#pendiente-de-hu-08-mario-polaino)
describe opciones de integración, no aprueba las reglas de participación de HU-08:

| Decisión                       | Opciones o propuesta de HU-09/T1                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repetición y cambio de opinión | Unicidad `(report_id, assessor_id)` o historial; credibilidad propone contar solo la última valoración por persona. No se añade unicidad ni edición en T2. |
| Retirada                       | Acordar si se permite y si se representa por borrado o un campo como `withdrawn_at`; una retirada tendría que excluirse del cálculo.                       |
| Reportes propios               | HU-09 propone rechazarlos al registrar e ignorarlos en el cálculo. HU-08 debe confirmar la regla y las excepciones. T2 no consulta el reporte.             |
| Estado del reporte             | Acordar con HU-05 los estados que bloquean participación; no se inventa un estado ni una restricción.                                                      |
| Confianza y revocación         | Aprobar el mínimo y confirmar el efecto sobre valoraciones anteriores. T2 solo deniega nuevas comprobaciones sin permiso; no anula valoraciones previas.   |
| Credibilidad                   | La propuesta contempla notificar tras persistir y una lectura interna agregada. No se implementan recálculos, hooks ni acceso adicional en T2.             |

## HU-11 y pruebas

La verificación Bearer de servidor ya existe; no hacen falta pantallas de login,
cookies SSR ni renovación para probar T2. Vitest sustituye únicamente la E/S del
SDK y ejecuta las funciones reales de sesión, consulta de perfil y factoría de
servidor. Los tests cubren sesión ausente/inválida/caducada, fallos, perfil,
configuración estricta, límites, revocación, independencia de rol y suplantación.
El nuevo módulo entra automáticamente en el ámbito de cobertura por archivo (80 %).

El flujo final necesita que HU-11 gestione el acceso del usuario, obtención y envío
del token, renovación y sesiones/cookies según el canal. La página de perfil
todavía muestra datos de ejemplo; T2 no los consume. Las pruebas unitarias no
acreditan una sesión real de extremo a extremo ni sustituyen la RLS de PostgreSQL.

Comprobaciones desde la raíz: `npm.cmd run check`, `npm.cmd run test:coverage`
y `git diff --check`. No se requieren nuevas pruebas SQL porque no se cambia
la base de datos. CI y revisión independiente siguen pendientes de publicación.
