# Diseño del dominio

HU-14/T1 implementa el perfil, T2 su rol principal y T3 los permisos base y las operaciones administrativas auditadas.

## Identidad y perfil

Supabase Auth gestiona la identidad en `auth.users`. `public.profiles` representa
al usuario de Dark-Shield mediante una relación 1:1 con el mismo UUID. No duplica
correo, contraseña, sesión ni metadatos internos de Auth.

| Atributo       | Tipo PostgreSQL | Contrato                                                                                                |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `id`           | `UUID`          | PK, FK a `auth.users(id)`, sin generador propio                                                         |
| `display_name` | `TEXT`          | Opcional; 1–80 caracteres si está presente, al menos uno que no sea espacio y sin caracteres de control |
| `trust_level`  | `SMALLINT`      | Obligatorio, inicial 1, intervalo inclusivo 1–100                                                       |
| `is_active`    | `BOOLEAN`       | Obligatorio, inicialmente `TRUE`                                                                        |
| `created_at`   | `TIMESTAMPTZ`   | Obligatorio, `now()` al insertar, preservado al actualizar                                              |
| `updated_at`   | `TIMESTAMPTZ`   | Obligatorio, `now()` al insertar; reloj real al cambiar datos del perfil                                |
| `role_code`    | `TEXT`          | Obligatorio, default `collaborator`, FK a `roles(code)` con actualización y borrado restringidos        |

Un `AFTER INSERT` en `auth.users` crea exactamente un perfil usando solo el UUID.
La migración también incorpora perfiles para las identidades existentes. La PK
impide duplicados y la FK impide perfiles huérfanos. Un fallo del trigger aborta
la inserción de identidad dentro de la misma transacción; no se oculta ni se deja
una cuenta sin perfil. No depende de pantallas de registro ni copia metadatos
aportados por el usuario. El registro público local sigue desactivado hasta HU-11.

El trigger de fechas compara los campos del perfil con `IS DISTINCT FROM`, por
lo que detecta también cambios desde/hacia `NULL`. Un `UPDATE` sin cambios reales
mantiene `updated_at`; una modificación solo de fechas tampoco altera las fechas.
Se usa `clock_timestamp()` al cambiar datos para reflejar cambios sucesivos dentro
de una misma transacción, donde `now()` permanece constante.

## Roles de aplicación (HU-14/T2)

`public.roles` es un catálogo de dominio: `code TEXT PRIMARY KEY`, `name TEXT
NOT NULL` y `description TEXT` opcional. El código admite exactamente
`collaborator`, `developer` y `admin`. Los nombres son Colaborador, Desarrollador
y Administrador; no admiten cadenas vacías, solo espacios ni controles.

`profiles.role_code TEXT NOT NULL DEFAULT 'collaborator'` es el séptimo atributo,
con FK a `roles(code)` y `ON UPDATE RESTRICT ON DELETE RESTRICT`. La relación
roles–perfiles es uno a muchos: cada perfil tiene un único rol principal.
La segunda migración siembra el catálogo antes de añadir la columna; los perfiles
anteriores reciben el default sin modificar sus datos ni fechas. El trigger de
Auth sigue insertando solo el UUID: los metadatos no conceden roles. La función
de fechas incluye `role_code` entre los cambios efectivos.

Son roles de aplicación, distintos de los roles PostgreSQL/Supabase o permisos
de GitHub. El consumidor sin cuenta del ConOps no es un cuarto rol persistente.

## Permisos base y administración (HU-14/T3)

| Permiso                    | collaborator | developer | admin |
| -------------------------- | ------------ | --------- | ----- |
| `reports.create`           | Sí           | Sí        | Sí    |
| `evidences.add`            | Sí           | Sí        | Sí    |
| `assessments.submit`       | Sí           | Sí        | Sí    |
| `users.read`               | —            | —         | Sí    |
| `users.change_role`        | —            | —         | Sí    |
| `roles.manage_permissions` | —            | —         | Sí    |

Cada fila representa una asignación explícita de la matriz inicial. El alta conserva
el rol `collaborator`. Una operación consulta el perfil activo y las asignaciones
vigentes en PostgreSQL. Las tres capacidades administrativas son fijas.
Un administrador activo puede cambiar el rol de otro perfil o las asignaciones de
colaboración. Cada cambio efectivo registra el actor, objetivo y transición
en la misma transacción. Véanse los [contratos HTTP y por HU](api/authorization.md)
y la [decisión de persistencia](adr/0004-supabase-persistence.md).

## Confianza y estado de cuenta

`trust_level` representa confianza persistida, sin algoritmo de cálculo ni reglas
de permisos. SQL rechaza 0, negativos, valores mayores que 100 y `NULL`. El tipo
almacena enteros; una entrada textual como `'1.5'` se rechaza. PostgreSQL puede
redondear una expresión `numeric` antes de convertirla a `SMALLINT` (por ejemplo,
`1.5::smallint` resulta 2), antes de ejecutar checks o triggers. Las futuras
operaciones controladas deben validar que su entrada sea entera **antes** de la
conversión. T1 no habilita ninguna escritura pública, decimal o entera.

`is_active = FALSE` indica desactivación lógica: mantiene identidad, perfil y
futuras relaciones para trazabilidad. La FK usa `ON DELETE RESTRICT`; borrar
físicamente una identidad que tenga perfil falla, incluso desde operaciones
administrativas de Auth. No se incorpora ninguna operación de eliminación.
Una eventual anonimización o eliminación legal exige un procedimiento separado,
revisado y autorizado, que considere las futuras referencias, la retención y los
datos de Auth. No se debe cambiar a cascada ni deshabilitar restricciones como
atajo para ese procedimiento.

Desactivar el perfil **no revoca sesiones de Supabase Auth**. HU-11 y la gestión
de permisos deberán coordinar revocación y autorización. Todas las futuras
tablas y endpoints deben comprobar `is_active` según sus requisitos: la política
de perfiles no protege automáticamente el resto del sistema.

## Acceso inicial

RLS está habilitada explícitamente. Solo `authenticated` recibe `SELECT`, y su
única política exige `(select auth.uid()) = id AND is_active`. Un usuario activo
solo ve su perfil; otro usuario, una identidad sin `sub` o una cuenta desactivada
no ven esa fila. `anon` carece de permiso de lectura.

Los roles públicos no tienen escritura, eliminación ni truncado. Se revocan
los posibles permisos predeterminados de `PUBLIC`, `anon`, `authenticated` y
`service_role`; no se habilitan operaciones administrativas por API en T1.
La función de creación necesita `SECURITY DEFINER` porque el rol interno de Auth
no puede insertar perfiles. Está en `private`, fuera de los esquemas de la API,
con `search_path` vacío, referencias cualificadas, sin argumentos ni SQL dinámico
y sin permisos públicos de ejecución. El trigger de fechas usa `SECURITY INVOKER`.
El propietario SQL conserva las capacidades necesarias para migraciones; RLS no
es una barrera contra el propietario ni contra superusuarios.

## Representación TypeScript y dependencias

`web/src/server/profiles.ts` exporta `Profile`, `Role` y `RoleCode`. `Profile` refleja la fila persistida:
UUID y fechas son cadenas JSON, confianza es `number` y el nombre es `string | null`.
Son tipos estáticos alineados con las migraciones, no tipos generados ni
validadores de entradas. PostgreSQL es la autoridad de las restricciones.

- **HU-14/T2:** catálogo y rol principal implementados, con integridad y seguridad inicial.
- **HU-14/T3:** permisos y operaciones administrativas controladas.
- **HU-11:** registro, confirmación, acceso, cookies, sesiones y autenticación en Next.js.
- **HU-10:** consulta de confianza y permisos efectivos; cálculo y reglas en las HU relacionadas.
- **HU-05, HU-06, HU-08 y HU-09:** reportes, evidencias, validaciones y credibilidad; futuras relaciones podrán referenciar `profiles.id` sin otra identidad de dominio.

Consultar [arquitectura](architecture.md), [desarrollo](development.md) y
[migraciones y pruebas](../supabase/README.md).

## Consulta de reportes asociados a una página (HU-01)

**Requisito relacionado:** HU-01 — Consultar una página.
**Origen de esta definición:** HU-01, T1 — Definir el flujo de consulta de una página web; ConOps, secciones 4, 5 y 6.
**Estado:** Flujo funcional y criterio de búsqueda definidos para HU-01/T1–T2. La consulta del servidor está implementada (HU-01/T3, T5); la interfaz corresponde a HU-01/T4 y T6.

### Propósito y alcance

Permitir que el Usuario Consumidor consulte información sobre posibles _dark patterns_ reportados para una página, y que el Usuario Desarrollador Web consulte reportes relacionados con sus páginas o aplicaciones. La consulta es de solo lectura: no crea ni modifica reportes. Los resultados representan reportes comunitarios sobre posibles patrones, no una confirmación definitiva de que estén presentes.

El ConOps contempla dos puntos de entrada: la Plataforma Web, donde se solicita la consulta, y la Extensión Web, que puede identificar la URL o el dominio visitado, consultar la información y mostrar una alerta o resumen breve con acceso a la plataforma para ampliar información. Para el Sprint 1, HU-01 cubre la consulta desde la web; la integración de la extensión queda fuera del alcance actual (HU-17 permanece en el Backlog). El flujo cubre la presentación del listado resumido; el detalle completo de un reporte queda fuera del Sprint 1 (HU-02).

### Flujo funcional principal

1. El Usuario Consumidor o el Usuario Desarrollador Web accede a la consulta desde la Plataforma Web y proporciona la página que quiere consultar. En el flujo previsto para la Extensión Web, esta obtiene del navegador la URL o el dominio actual y solicita la misma información.
2. El sistema comprueba que la solicitud pueda procesarse y consulta al servidor por los reportes asociados.
3. El servidor recupera la información disponible para esa página y devuelve los resultados que el usuario está autorizado a consultar.
4. Si hay resultados, la Plataforma Web presenta el listado con el resumen acordado para HU-01 y, cuando esté disponible, el estado de credibilidad. La Extensión Web, cuando se implemente, presenta un aviso o resumen breve y ofrece abrir la Plataforma Web para consultar más información.
5. La persona interpreta los resultados como posibles patrones reportados, no como detecciones o validaciones concluyentes. Puede volver al listado o iniciar otra consulta.

El criterio de búsqueda por página o dominio se especifica en HU-01/T2 a continuación. La extensión no debe modificar el contenido ni el funcionamiento de la página visitada.

### Flujos alternativos

| Situación                                                 | Comportamiento esperado                                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La consulta no encuentra reportes                         | Informar que no hay reportes asociados a la página consultada y permitir corregir la entrada o realizar otra búsqueda. No mostrarlo como un error del sistema. |
| La entrada no se puede procesar                           | Explicar que no se pudo consultar esa página y permitir corregir la entrada. La regla concreta de validación se definirá en HU-01/T2.                          |
| La consulta falla o el servidor no responde               | Informar que no se pudo completar la consulta y permitir reintentar. No presentar el fallo como una búsqueda completada sin resultados.                        |
| Hay reportes, pero la credibilidad aún no está disponible | Mostrar la información resumida disponible sin inventar ni inferir un estado de credibilidad.                                                                  |

### Reglas del flujo

- **HU01-FL-01 — Consulta de solo lectura.** La búsqueda no registra, edita ni elimina reportes.
- **HU01-FL-02 — Correspondencia del resultado.** El listado contiene únicamente reportes que correspondan a la página o dominio conforme al criterio de HU-01/T2 y al dato de página afectada que proporcione HU-05.
- **HU01-FL-03 — Diferenciar vacío de error.** Una consulta completada sin coincidencias se distingue de una consulta que no pudo completarse.
- **HU01-FL-04 — Reportes, no detecciones concluyentes.** Los resultados describen posibles _dark patterns_ comunicados mediante reportes. Una consulta, una alerta o la intervención de la IA no confirma por sí sola que el patrón exista.
- **HU01-FL-05 — Resumen en el listado.** La Plataforma Web presenta el resumen previsto para HU-01/T6. La Extensión Web ofrece una alerta o resumen breve con acceso a la Plataforma Web para ampliar información; este canal pertenece a HU-17 y no se implementa en el Sprint 1. El detalle completo no forma parte del alcance del Sprint 1.
- **HU01-FL-06 — Credibilidad dinámica.** Se muestra el estado de credibilidad cuando esté disponible conforme a HU-09. La credibilidad puede cambiar con nuevas evidencias, valoraciones u otra información y no equivale a una decisión definitiva sobre la página.
- **HU01-FL-07 — Acceso y protección.** La consulta sirve al Usuario Consumidor y al Usuario Desarrollador Web, de acuerdo con la información disponible y las reglas de privacidad y acceso. No requiere permisos de colaborador para consultar información pública; los campos que se exponen públicamente y cualquier restricción adicional deben acordarse antes de implementar el acceso.
- **HU01-FL-08 — Uso legítimo y abuso.** La consulta debe seguir disponible para el uso ordinario, con controles proporcionales frente a extracción masiva o abusiva. Los mecanismos concretos no se definen en T1.

### Dependencias y decisiones pendientes

- **HU-05:** proporciona el modelo, el contrato y la visibilidad de los reportes que se consultarán.
- **HU-01/T2:** define los criterios de búsqueda y el contrato de consulta en la sección siguiente.
- **HU-01/T3 y T4:** implementan la consulta del servidor y su interfaz según este flujo.
- **HU-01/T5:** concreta la gestión de páginas sin reportes y de errores de consulta.
- **HU-01/T6 y T7, HU-09:** concretan el resumen y la presentación del estado de credibilidad.
- **ConOps:** identifica al Usuario Consumidor como persona que consulta información y a los Usuarios Desarrolladores Web como consumidores de reportes; la Plataforma Web ofrece la consulta principal y la Extensión Web el acceso contextual durante la navegación.
- **HU-17:** implementará el punto de entrada de la extensión, su resumen/alerta y el enlace a la plataforma. Está fuera del Sprint 1; en esta definición se documenta solo el flujo futuro de interacción.
- **Acceso a la consulta:** concretar qué información del reporte es pública y qué campos requieren protección. La consulta de información pública no debe depender de permisos de colaborador; la autenticación y autorización aplicables a datos restringidos se definirán con HU-11 y las reglas de seguridad.

La documentación de planificación señala que los criterios originales de HU-01 mencionan entrar al detalle de un reporte, mientras que la planificación del Sprint define T6 como mostrar un resumen desde el listado y deja HU-02 fuera del Sprint. Este flujo sigue el alcance planificado para el Sprint; el criterio formal de aceptación debe confirmarse antes de cerrar HU-01.

### HU-01/T2 — Diseño de consulta por página o dominio

**Objetivo:** recuperar de forma explícita y de solo lectura los reportes que correspondan a una página concreta o a un dominio. La búsqueda consulta los datos almacenados en Dark-Shield; no visita ni analiza la página externa.

#### Contrato de solicitud

La propuesta para HU-01/T3 es un `GET /api/reports` con estos parámetros:

| Parámetro | Obligatorio | Contrato                                                                |
| --------- | ----------- | ----------------------------------------------------------------------- |
| `target`  | Sí          | URL de página para `scope=page`; URL o dominio para `scope=domain`.     |
| `scope`   | Sí          | `page` o `domain`. No se infiere para evitar resultados ambiguos.       |
| `limit`   | No          | Entero de 1 a 100; valor predeterminado 20.                             |
| `cursor`  | No          | Cursor opaco devuelto por la página anterior para continuar el listado. |

Ejemplos:

```text
GET /api/reports?scope=page&target=https%3A%2F%2Fshop.example.com%2Fpricing
GET /api/reports?scope=domain&target=example.co.uk
```

`scope=page` requiere una URL absoluta `http` o `https`, con host válido y sin credenciales incrustadas. `scope=domain` acepta un dominio o subdominio DNS, o una URL `http`/`https` de la que se extrae el host y se obtiene el dominio registrable; también en este modo se rechazan URLs con credenciales. Otros esquemas, entradas mal formadas, direcciones IP en modo dominio y nombres que sean únicamente un sufijo público se rechazan como entrada inválida. El cliente elimina query y fragmento antes de enviar `target`; el servidor repite la normalización y validación, sin confiar en el cliente. La interpretación de URLs debe seguir el [estándar URL de WHATWG](https://url.spec.whatwg.org/), no expresiones regulares propias.

#### Criterios de correspondencia

- **Búsqueda por página:** se compara esquema, host, puerto efectivo y ruta. La normalización de URL hace equivalentes las mayúsculas/minúsculas del host, los nombres IDN equivalentes y los puertos por defecto. Se conserva la distinción de mayúsculas y la barra final en la ruta.
- Los parámetros de consulta (`?`) y el fragmento (`#`) se excluyen de la clave de búsqueda y se eliminan antes de enviar la solicitud. Así, los identificadores de seguimiento o sesión no fragmentan la consulta ni se transmiten al servidor; rutas cuyo contenido dependa solo de parámetros de consulta no se distinguen en esta versión.
- **Búsqueda por dominio:** se obtiene el dominio registrable usando la [Public Suffix List](https://publicsuffix.org/list/), incluida su sección privada, y se incluyen ese dominio y sus subdominios. La coincidencia debe respetar el límite de etiqueta: `example.com` incluye `shop.example.com`, pero no `notexample.com` ni `example.com.attacker.test`. Esquema, puerto y ruta no limitan la búsqueda por dominio.
- Los sufijos públicos por sí solos (por ejemplo, `co.uk`) no son objetivos válidos. Las direcciones IP solo se admiten en una consulta por página y se comparan como host exacto.

Ejemplos de correspondencia:

| Solicitud                                                  | Clave o ámbito resultante                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Página `https://shop.example.com/pricing?campaign=x#plans` | `https://shop.example.com/pricing`; no coincide con `http://shop.example.com/pricing` ni con `/pricing/`. |
| Dominio `blog.shop.example.co.uk`                          | Dominio registrable `example.co.uk`; incluye sus subdominios, también `shop.example.co.uk`.               |
| Dominio `example.com`                                      | Incluye `example.com` y `shop.example.com`; excluye `notexample.com` y `example.com.attacker.test`.       |

#### Respuesta y paginación

Una consulta válida devuelve `200 OK` y una colección de resúmenes, sin incluir datos restringidos:

```json
{
  "items": [],
  "nextCursor": null
}
```

Si no hay coincidencias, devuelve `200 OK` con `items: []` y `nextCursor: null`; el cliente lo presenta como estado vacío, no como fallo. Los resultados se ordenan por fecha de creación descendente, con identificador como desempate estable. El cursor es opaco y permite continuar sin cambiar el orden. La proyección concreta de cada resumen corresponde a HU-05 y HU-01/T6; el detalle completo queda fuera de esta consulta.

Una entrada o parámetro inválido devuelve `400 Bad Request` con un código de error estable y un mensaje que permita corregir la solicitud. Errores de autenticación/autorización, límites de uso y fallos del servicio se gestionan según las reglas de acceso y errores de HU-11/HU-01/T5; nunca se convierten en una lista vacía.

#### HU-01/T4 y HU-01/T9 — Interfaz y mecanismo de consulta

La pantalla inicial de la web presenta un campo de URL/dominio, una acción de
consulta, el estado de resultados y una explicación de que los reportes son
información comunitaria, no veredictos. Una búsqueda completada sin coincidencias
se presentará como estado vacío; los errores de transporte o de validación se
mostrarán por separado y permitirán reintentar o corregir la entrada. El listado
mostrará únicamente resúmenes públicos del contrato anterior, ordenados por fecha,
y permitirá continuar con `nextCursor`. No incluye la vista de detalle HU-02.

El mecanismo previsto es una solicitud de solo lectura a
`GET /api/reports?scope={page|domain}&target={encodedTarget}&limit={1..100}&cursor={opaque}`.
Para página se usa URL absoluta; para dominio, dominio o URL HTTP(S). El cliente
elimina query y fragmento antes de enviar y la API valida de nuevo la entrada,
aplica la normalización WHATWG y las reglas de correspondencia descritas arriba.
Una respuesta `200` con `items: []` es una búsqueda correcta sin coincidencias;
`400` identifica una entrada inválida. Un error de servicio no se representa como
lista vacía. Los datos de la respuesta se renderizan como reportes comunicados,
sin inferir credibilidad cuando el campo no esté disponible.

**Estado de implementación:** HU-01/T4 aporta la estructura visual del buscador,
la navegación y los estados iniciales. HU-01/T5 implementó el handler `GET /api/reports` con búsqueda, selección de ámbito, paginación y gestión de vacío y errores. HU-01/T3 cierra el contrato en el servidor:

- Dominio registrable con la Public Suffix List mantenida (`tldts`, incluida la sección privada), compartido por la normalización al crear (HU-05) y por la consulta, de modo que la clave es idéntica en ambos lados.
- Modo dominio interpretado con el parser WHATWG también para dominios sin esquema (IDN a _punycode_), sin expresiones regulares propias.
- Proyección pública sin query ni fragmento: el campo `target_url` de la respuesta es `page_key` y `anon` deja de leer la columna `target_url`.
- Cursor validado (fecha ISO 8601 y UUID) antes de usarlo en el filtro.

El contrato HTTP completo está en [`docs/api/reports.md`](api/reports.md#6-get-apireports--consulta-por-página-o-dominio). La credibilidad se presenta desde HU-01/T7 (véase más abajo), su explicación corresponde a HU-09/T3 y la limitación de uso a HU-23.

**Implementación (HU-01/T6):** la pantalla de consulta queda conectada al handler y montada en `/consulta`, enlazada desde la portada.

- `web/src/lib/reports/search.ts` prepara el objetivo en el cliente (HTTP(S), sin credenciales; sin query ni fragmento para página y solo el host para dominio), hace la petición `GET` de solo lectura y traduce la respuesta para `resolveQueryState`. Un `200` con `items: []` es estado vacío. Un `400` muestra el mensaje de `QUERY_ERROR_MESSAGES` y pide corregir la entrada. Los fallos de servicio o de red y las respuestas mal formadas se presentan como `QUERY_FAILED` o `SERVICE_UNAVAILABLE`, con reintento. Una búsqueda nueva cancela la anterior con `AbortController`.
- `web/src/components/ReportSummaryCard.tsx` muestra por reporte el título, la categoría (etiquetas de `web/src/lib/reports/categories.ts`, compartidas con el formulario de HU-05), la página afectada sin query, la fecha en es-ES (zona `Europe/Madrid`, fija para que no dependa del visitante), un extracto de la descripción sin la sección «Pasos para reproducir:» y recortado por puntos de código, el aviso «Reporte comunitario, no es un veredicto» (HU01-FL-04) y el estado de credibilidad de HU-01/T7.
- «Cargar más» usa `nextCursor` y añade la página siguiente sin repetir reportes. El listado es una lista semántica bajo el encabezado de resultados. Al terminar una búsqueda, el foco pasa a ese encabezado y, al cargar más, al primer reporte nuevo. Una región `role="status"` anuncia el estado.
- El detalle completo (HU-02) no forma parte de este listado.

**Implementación (HU-01/T7):** el listado presenta el estado de credibilidad de cada reporte sin darlo por cierto.

- `queryReports` (`web/src/server/reports.ts`) añade `items[].credibility` con una sola llamada a `getReportsCredibility` por página y el mismo cliente sin sesión. Si un reporte no tiene resultado, su valor es `null`. Si el cálculo falla, se registra (`console.error` u opción `logError`) y todos quedan en `null`: la consulta no pasa a error ni a lista vacía (flujo alternativo de HU-01). Contrato en [`docs/api/reports.md`](api/reports.md#credibilidad-en-el-listado).
- `ReportCredibilitySummary` (`web/src/lib/reports/query.ts`) replica la forma de `CredibilityResult` sin importar código del servidor. Un test de tipos comprueba que ambos son asignables entre sí.
- `parseReportsResponse` normaliza a `null` una credibilidad mal formada en lugar de descartar la respuesta.
- `describeCredibility` (`web/src/lib/reports/summary.ts`) da la etiqueta: «Credibilidad no disponible» sin valor, «Datos insuficientes» si `sufficientData` no es `true` (nunca «Media») y, en otro caso, «Alta», «Media» o «Baja». `ReportSummaryCard` la muestra como texto, con un color de apoyo con contraste suficiente, y debajo el aviso «La credibilidad cambia con nuevas evidencias y valoraciones; no es una garantía» (HU01-FL-06 y HU-09). No muestra la puntuación como veredicto.
- **HU-09/T3 implementada:** `ReportSummaryCard` añade «Cómo se calcula», un desglose desplegable de los factores agregados y mensajes para la ausencia del desglose o del cálculo.

#### Integración y decisiones de implementación

- HU-05 debe hacer consultable la página afectada por cada reporte con la clave definida aquí; la forma de persistir y derivar esa clave se resuelve al diseñar el modelo de reportes.
- El servidor implementa validación, búsqueda, paginación y proyección, y el buscador de HU-01/T4 lo consume desde HU-01/T6. La extensión lo consumirá al abordar HU-17.
- El uso de la Public Suffix List requiere una implementación mantenida y una política para actualizar sus datos; no se debe asumir que los dos últimos componentes separados por puntos identifican siempre el dominio registrable. Se usa `tldts` con versión exacta; la política de actualización y la limitación de los reportes anteriores a HU-01/T3 están en [`docs/api/reports.md`](api/reports.md#public-suffix-list-implementación-y-actualización).
- Los límites de página ayudan a acotar respuestas, pero no sustituyen los controles contra extracción masiva previstos por el ConOps.

#### Acceso de lectura en la base de datos

La migración `20261119100000_reports_public_read.sql` abre la lectura de `public.reports`, acordada en la revisión del contrato de evidencias (PR #13, respuesta 2), porque HU01-FL-07 establece que consultar información pública no requiere permisos de colaborador:

- Política `reports_select_public` para `anon` y `authenticated`, sin condiciones: todavía no hay estados de reporte. Cuando la moderación los añada, la política deberá filtrar por ellos.
- `anon` lee la proyección pública (`id`, `title`, `description`, `pattern_type`, `page_key`, `target_host`, `registrable_domain`, `created_at`), que es la que usa `GET /api/reports` con el cliente sin sesión; **no lee `author_id` ni `target_url`**.
- `authenticated` lee todas las columnas, incluido `author_id` (por ejemplo, para que HU-08 impida valorar el propio reporte). Las políticas de evidencias necesitan que pueda leer los reportes.
- La escritura sigue revocada: crear, modificar o borrar reportes corresponde a HU-05.

`target_url` puede conservar la _query_ de la URL reportada (identificadores de seguimiento o sesión). HU-01/T3 lo resuelve en la proyección pública: `GET /api/reports` no lee la columna y devuelve como `target_url` el valor de `page_key`, y la migración `20261119130000_reports_hide_target_url_from_anon.sql` revoca a `anon` la lectura de `target_url`. Los datos guardados no cambian; decidir si HU-05 debe dejar de guardar la _query_ queda para esa historia.

## Validación e invalidación de reportes

**Requisitos relacionados:** HU-08 (validar o invalidar un reporte), HU-10 (nivel de confianza y permisos) y HU-09 (credibilidad del reporte).
**Origen de esta definición:** HU-08, T1 — Definir el flujo y las reglas de validación e invalidación.
**Estado:** Definición funcional inicial. Las decisiones indicadas como pendientes deberán acordarse antes de implementar las reglas correspondientes.

### Propósito y conceptos

La validación e invalidación permite que los Usuarios Colaboradores autorizados valoren reportes sobre posibles _dark patterns_, contribuyendo a determinar la fiabilidad de la información registrada en Dark-Shield.

De acuerdo con el ConOps:

- **Validar un reporte** significa que el colaborador considera que el comportamiento descrito está presente.
- **Invalidar un reporte** significa que el colaborador considera que el comportamiento descrito no está presente.

Ambas acciones representan valoraciones de la comunidad, no verificaciones definitivas de la veracidad del reporte.

Es necesario distinguir el **nivel de confianza del colaborador**, que puede condicionar su capacidad para participar, del **nivel de credibilidad del reporte**, que refleja su fiabilidad estimada a partir de la información y las valoraciones disponibles.

### Condiciones para realizar una valoración

Para registrar una validación o invalidación, el sistema deberá comprobar que:

1. El usuario está autenticado y puede identificarse como Usuario Colaborador.
2. El usuario dispone de los permisos necesarios para realizar la acción, teniendo en cuenta su rol y su nivel de confianza.
3. El reporte sobre el que se desea actuar existe y puede ser objeto de valoración.
4. La operación cumple las demás restricciones de participación que se acuerden para el proyecto.

El modelo de perfiles existente almacena el nivel de confianza en `trust_level`, con valores enteros entre 1 y 100. Sin embargo, **todavía no se ha definido el umbral mínimo necesario para validar o invalidar reportes**.

El modelo también contempla `is_active` para representar el estado de la cuenta. Su aplicación al control de acceso de estas operaciones deberá concretarse junto con las reglas generales de permisos.

### Flujo funcional

El proceso previsto de validación o invalidación será el siguiente:

1. El Usuario Colaborador accede a un reporte y solicita validarlo o invalidarlo.
2. El sistema recibe la solicitud, identificando la operación y el reporte correspondiente.
3. El servidor comprueba la identidad del usuario y sus permisos efectivos, incluyendo las restricciones asociadas a su nivel de confianza.
4. El sistema verifica que el reporte existe y que la operación cumple las reglas de participación aplicables.
5. Si todas las comprobaciones son satisfactorias, se registra la valoración asociada al usuario y al reporte.
6. La nueva valoración queda disponible para contribuir a la actualización de la credibilidad del reporte, según las reglas definidas para HU-09.
7. El sistema comunica al usuario si la operación se ha completado correctamente.

Si alguna comprobación falla, la operación deberá rechazarse sin registrar una valoración no autorizada o inválida.

### Reglas de negocio

**RV-VAL-01 — Control de autorización.**
Solo podrán validar o invalidar reportes los Usuarios Colaboradores autorizados. Los permisos efectivos deberán determinarse considerando el rol y las condiciones de confianza correspondientes. El servidor será responsable de aplicar estas restricciones, independientemente de los controles visibles en la interfaz.

**RV-VAL-02 — Tipos de valoración.**
Cada operación de valoración deberá identificar si el colaborador desea validar o invalidar el reporte. Ambas acciones deben diferenciarse de forma inequívoca.

**RV-VAL-03 — Asociación y persistencia.**
Toda valoración registrada correctamente deberá quedar asociada al usuario que la emite y al reporte al que se refiere. La información deberá conservarse de forma persistente y poder recuperarse posteriormente.

**RV-VAL-04 — Integración con la credibilidad.**
Las nuevas valoraciones deberán tenerse en cuenta al actualizar la credibilidad del reporte. Esta actualización dependerá de las reglas acordadas para HU-09 y no implicará que una única validación o invalidación determine automáticamente la veracidad del reporte.

**RV-VAL-05 — Protección frente a operaciones no autorizadas.**
Una solicitud que no cumpla las condiciones de autorización deberá rechazarse sin crear ni modificar valoraciones. La comprobación deberá realizarse en el servidor, aunque la interfaz también informe al usuario sobre las acciones que tiene permitidas.

### Situaciones alternativas y errores

Se contemplan las siguientes situaciones durante el proceso:

| Situación                          | Comportamiento esperado                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Usuario no autenticado             | Rechazar la operación porque no se puede identificar a un colaborador autorizado.                 |
| Usuario sin permisos suficientes   | Rechazar la operación sin registrar la valoración.                                                |
| Reporte inexistente                | Informar del error sin registrar una valoración asociada a un reporte inválido.                   |
| Solicitud de valoración incorrecta | Rechazar los datos que no representen una operación válida.                                       |
| Fallo durante el almacenamiento    | No comunicar que la operación ha tenido éxito si la valoración no se ha registrado correctamente. |

La forma concreta de comunicar estos errores mediante la API y la interfaz se definirá durante la implementación de HU-08.

### Dependencias con otras funcionalidades

La validación e invalidación depende de funcionalidades desarrolladas en otras historias de usuario:

- **HU-14 y HU-11:** proporcionan la identidad, los roles y los mecanismos de autenticación necesarios para identificar al colaborador.
- **HU-05:** proporciona los reportes sobre los que se realizan las valoraciones.
- **HU-10:** permite establecer y consultar las condiciones de confianza y los permisos efectivos.
- **HU-09:** utiliza las valoraciones registradas como uno de los factores que intervienen en la credibilidad del reporte.

Los contratos de integración deberán acordarse con los responsables de estas funcionalidades antes de implementar sus dependencias.

### Decisiones pendientes

Los documentos de requisitos no concretan completamente las siguientes reglas:

1. **Nivel mínimo de confianza:** establecer qué condiciones de `trust_level` y permisos permiten validar o invalidar.
2. **Valoraciones repetidas:** decidir si un colaborador puede valorar varias veces un mismo reporte y cómo se gestionan los intentos duplicados.
3. **Cambio o retirada de valoración:** determinar si una valoración puede modificarse o eliminarse después de registrarla.
4. **Valoraciones sobre reportes propios:** el ConOps describe la participación sobre reportes de otros usuarios; debe concretarse cómo se aplica esta restricción y si existen excepciones.
5. **Restricciones según el estado del reporte:** decidir si existen estados que impidan recibir nuevas valoraciones.
6. **Actualización de credibilidad:** establecer el contrato con HU-09, incluida la forma en la que una nueva valoración desencadena o alimenta el recálculo.

Estas decisiones deberán acordarse antes de implementar los comportamientos afectados. Hasta entonces, no se consideran reglas definitivas del sistema.

### Comprobación del comportamiento esperado

La implementación posterior deberá permitir verificar, como mínimo, que:

- Un Usuario Colaborador autorizado puede registrar una validación o invalidación sobre un reporte válido.
- Una valoración registrada queda asociada al usuario y al reporte y puede recuperarse de forma persistente.
- Un usuario sin permisos suficientes no puede registrar una valoración.
- Una nueva valoración se tiene en cuenta en el proceso de actualización de la credibilidad del reporte.

Estas comprobaciones derivan de los criterios de aceptación de HU-08 y servirán de referencia para las pruebas posteriores.

## Evidencias (HU-06)

**Requisito relacionado:** HU-06 — Como Usuario Colaborador, quiero aportar evidencias a un reporte para respaldar la información.
**Origen de esta definición:** HU-06, T6 — Desarrollar pruebas unitarias para el rechazo de archivos no permitidos.
**Estado:** Reglas implementadas y probadas en `web/src/lib/evidences/rules.ts` (T6); selección y validación en el cliente en `web/src/lib/evidences/selection.ts` (T3, parte 1). Tipos y límites acordados en la revisión del contrato de HU-06/T4 (PR #13): **solo PNG, JPEG y WebP, sin PDF** (decisión del PO, Iván) y 10 MiB por archivo. Almacenamiento, permisos, subida y endpoints quedan para las restantes tareas de HU-06.

### Módulo compartido

`rules.ts` es un módulo puro, sin Next.js, Supabase ni E/S, para que la validación en el cliente (HU-06/T3) y en el servidor (HU-06/T4) aplique exactamente las mismas reglas y códigos. El cliente solo anticipa el rechazo para informar al usuario; **el servidor es la autoridad** y debe repetir la validación con los bytes realmente recibidos.

Cada archivo se describe como `EvidenceCandidate`: nombre y MIME declarados, tamaño real en bytes y la cabecera (`head`) con al menos los primeros `EVIDENCE_SIGNATURE_BYTES` (12) bytes. No hace falta leer el archivo completo: en el navegador basta con `file.size` y `file.slice(0, 12)`.

- `validateEvidenceFile(candidate)` devuelve `{ ok: true, evidence }` con tipo, MIME y extensión normalizados, o `{ ok: false, code }`.
- `validateEvidenceBatch(candidates)` devuelve `{ ok: true, evidences }` o `{ ok: false, errors }`, donde cada error indica el `index` del archivo (o `null` si afecta al envío completo). Valida todos los archivos y devuelve todos los rechazos. Un envío vacío es válido: la obligatoriedad de aportar evidencias corresponde a HU-06, no a este módulo.

### Tipos y límites

| Tipo | MIME         | Extensiones     | Firma (magic bytes)                       |
| ---- | ------------ | --------------- | ----------------------------------------- |
| PNG  | `image/png`  | `.png`          | `89 50 4E 47 0D 0A 1A 0A` en el byte 0    |
| JPEG | `image/jpeg` | `.jpg`, `.jpeg` | `FF D8 FF` en el byte 0                   |
| WebP | `image/webp` | `.webp`         | `RIFF` en el byte 0 y `WEBP` en el byte 8 |

- Tamaño máximo por archivo: `EVIDENCE_MAX_FILE_BYTES` = 10 MiB (10 485 760 bytes); el valor exacto se acepta y un byte más se rechaza.
- Número máximo de archivos: `EVIDENCE_MAX_FILES` = 5. `validateEvidenceBatch` lo aplica a cada envío; el contrato de HU-06/T4 lo fija además como máximo de evidencias por colaborador y reporte.
- **El PDF no se admite** (decisión del PO para el Sprint 1): no se puede garantizar la eliminación de metadatos de las imágenes incrustadas. Un `.pdf` se rechaza como `EVIDENCE_TYPE_NOT_ALLOWED`, y `pdf` sigue contando como extensión que disfraza en segmentos intermedios (`informe.pdf.png`). Queda en el _Backlog_ para un _spike_ posterior.
- Extensión y MIME se comparan sin distinguir mayúsculas; el MIME se recorta de espacios.

### Reglas y orden de comprobación

Se devuelve el primer fallo, en este orden:

1. **Nombre.** Se rechaza si está vacío o solo tiene espacios, supera 255 caracteres, contiene `/` o `\`, es `.` o `..`, empieza por punto, termina en punto o espacio, o contiene caracteres de control (U+0000–U+001F, U+007F–U+009F) o de control bidireccional (U+202A–U+202E, U+2066–U+2069), usados para disfrazar extensiones.
2. **Tamaño.** Debe ser un entero positivo y no superar el máximo.
3. **Tipo.** La extensión final y el MIME declarado deben estar en la lista blanca. Se rechazan dobles extensiones: ningún segmento intermedio del nombre puede ser una extensión permitida ni una ejecutable o de script (`exe`, `bat`, `cmd`, `com`, `scr`, `msi`, `js`, `vbs`, `ps1`, `sh`, `jar`, `html`, `htm`, `svg`, `php`). Así se rechazan `factura.pdf.exe`, `informe.pdf.png` y `foto.exe.png`, pero se aceptan `captura 2026.11.13.png` o `informe.final.png`.
4. **Coherencia.** Extensión y MIME deben corresponder al mismo tipo, y los magic bytes de la cabecera deben coincidir con ese tipo. La extensión y el MIME los declara el cliente; la firma comprueba el contenido real.

### Códigos de error

| Código                      | Causa                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| `EVIDENCE_NAME_INVALID`     | Nombre vacío, demasiado largo, con rutas o con caracteres de control     |
| `EVIDENCE_EMPTY`            | Tamaño 0, negativo o no entero                                           |
| `EVIDENCE_TOO_LARGE`        | El archivo supera `EVIDENCE_MAX_FILE_BYTES`                              |
| `EVIDENCE_TYPE_NOT_ALLOWED` | Extensión o MIME fuera de la lista blanca, o doble extensión             |
| `EVIDENCE_CONTENT_MISMATCH` | Extensión y MIME no coinciden, o el contenido no tiene la firma esperada |
| `EVIDENCE_TOO_MANY`         | El envío supera `EVIDENCE_MAX_FILES` (error de envío, `index: null`)     |

Los códigos son estables: T3 y T4 deben reutilizarlos en la interfaz y en la API en lugar de definir otros equivalentes. Cambiar o retirar un código es un cambio de contrato.

### Selección en el cliente (HU-06/T3, parte 1)

`selection.ts` es también un módulo puro (sin React, Next.js ni Supabase) que prepara la selección de archivos antes de cualquier envío. No define reglas propias: clasifica cada archivo con `validateEvidenceFile` y prepara el lote final con `validateEvidenceBatch`.

- `readEvidenceCandidate(file, name?)` convierte un `File` o `Blob` en `EvidenceCandidate` leyendo solo `size`, `type` y `file.slice(0, EVIDENCE_SIGNATURE_BYTES)`; nunca el archivo completo. Un `Blob` sin nombre queda con nombre vacío y se rechaza como `EVIDENCE_NAME_INVALID`.
- `prepareEvidenceFiles(files)` prepara varios archivos y les asigna una clave de deduplicación (nombre, tamaño, MIME y `lastModified`).
- `addToEvidenceSelection(selection, prepared)` acumula archivos sobre la selección anterior, que no se modifica. Los ya presentes, aceptados o rechazados, no se repiten y se devuelven en `duplicates` para poder informar.
- `removeFromEvidenceSelection(selection, key)` quita un archivo y reclasifica el resto.
- Cada elemento de `selection.items` tiene `status: 'accepted'` con la evidencia normalizada o `status: 'rejected'` con el código de `rules.ts`. Los rechazados se conservan para mostrar el motivo hasta que el usuario los quite.
- **El límite `EVIDENCE_MAX_FILES` se aplica después de validar.** Solo cuentan los archivos aceptados, en orden de selección: un archivo rechazado no ocupa hueco ni hace perder uno válido. Un archivo válido que supere el máximo se marca con `EVIDENCE_TOO_MANY` y pasa a aceptado si se quita otro. No se recorta la lista antes de validar, porque así podía perderse un archivo válido cuando el primero era rechazado (caso de seis archivos cubierto por las pruebas).
- `evidenceSubmission(selection)` devuelve los archivos aceptados y el resultado de `validateEvidenceBatch` sobre ellos. Al confirmar una subida, el servidor valida los bytes recibidos y vuelve a comprobar la imagen recodificada.
- `EVIDENCE_ERROR_MESSAGES` es un `Record<EvidenceErrorCode, string>` con mensajes en español. TypeScript obliga a cubrir cada código nuevo, y las cifras y tipos se derivan de `EVIDENCE_MAX_FILE_BYTES`, `EVIDENCE_MAX_FILES` y `ALLOWED_EVIDENCE_TYPES`.

`validateEvidenceBatch` no se usa directamente sobre lo seleccionado porque rechaza el envío completo (`index: null`) cuando hay más de `EVIDENCE_MAX_FILES` archivos y, por tanto, no da un resultado por archivo.

### Subida desde el cliente (HU-06/T3, parte 2)

`web/src/lib/evidences/upload.ts` implementa en el navegador el flujo en dos pasos del contrato de HU-06/T4 (`docs/api/evidences.md`), sin React ni Supabase: recibe `fetch` y la función que da el token, y notifica el estado de cada archivo.

- `uploadEvidences(reportId, items, deps)` pide las URL firmadas para los archivos aceptados por `selection.ts`, sube cada uno con `PUT` a su URL (sin el token de la API) y lo confirma. Los archivos se procesan uno detrás de otro.
- Estados por archivo: `requesting`, `uploading`, `confirming`, `done` (con el `id` de la evidencia) o `error` con `code`, mensaje en español y `retryable`. Los códigos de archivo usan `EVIDENCE_ERROR_MESSAGES`; los demás, `EVIDENCE_UPLOAD_MESSAGES`.
- Se pueden reintentar los errores de red, los 5xx, los fallos temporales de Storage y los archivos que no se enviaron porque otro del mismo envío era inválido. No se reintentan los rechazos de `rules.ts`, los duplicados ni los 401, 403 y 404. El reintento repite el flujo completo para ese archivo con una URL nueva, porque el servidor borra el original al fallar la confirmación.
- HU-11/T2 permite solicitar un enlace de acceso por correo y recibe el callback de Supabase. La sesión todavía no se conserva entre instancias; HU-11/T3 añadirá persistencia y renovación antes de integrar operaciones protegidas.

La interfaz de HU-06/T2 (`dashboard.tsx`) usa ahora `selection.ts` y `upload.ts`: selección acumulada sin duplicados, un estado por archivo, botón de reintento y sin PDF. El reporte de destino llega en el parámetro `?reporte=<uuid>`; sin él, la subida queda desactivada. La lógica está en los módulos medidos; el componente sigue fuera del ámbito de cobertura, como antes.

### Fuera del alcance de T6

Comprobar la firma no garantiza que el archivo sea inocuo. El análisis antivirus sigue pendiente. En T4, el servidor genera los nombres, valida y recodifica las imágenes al confirmar la subida al bucket privado. El modelo HU-06/T4a ya vincula cada evidencia con su reporte y autor.

### Contrato de persistencia y API (HU-06/T4)

**Estado:** acordado en la revisión de la PR #13 (19 de noviembre de 2026): preguntas 1–4 con Gregorio (HU-05/T4), 5–7 con Ildefonso (HU-06/T1 y HU-11) y 8–11 con Iván (HU-09/T2 y PO). La eliminación de metadatos con la subida directa se cerró después: el servidor recodifica la imagen con `sharp` al confirmar (ver más abajo). Implementado en tres piezas: el modelo y su RLS (HU-06/T4a), la lectura pública de reportes (respuesta 2, integrada en la PR #21) y el endpoint con el _bucket_ y sus políticas (HU-06/T4), especificado en [docs/api/evidences.md](api/evidences.md).

T3 define el permiso base `evidences.add`. Los handlers, la RLS y las políticas de Storage de HU-06/T4 todavía no consultan esa asignación. Revocarla por sí sola deja vigente el acceso que esas reglas conceden.

#### Decisiones

| Tema                    | Decisión                                                                                                                                                                                                                                      | Origen                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Almacenamiento          | Supabase Storage, _bucket_ **privado** `report-evidences`. Objetos en `{user_id}/{report_id}/{uuid}.{ext}`. En la base de datos se guarda solo la ruta, nunca una URL.                                                                        | 5                               |
| Lectura de archivos     | El servidor genera una URL firmada bajo demanda (`createSignedUrl`) que caduca a los **120 s** (rango acordado: de 60 s a 5 min).                                                                                                             | 5                               |
| Subida                  | Directa desde el cliente con `createSignedUploadUrl`, en dos pasos, para no pasar los archivos por el límite de cuerpo de Vercel (~4,5 MB).                                                                                                   | 5                               |
| Tipos y tamaño          | Solo `image/png`, `image/jpeg` e `image/webp`; **sin PDF**. Máximo 10 MiB (`EVIDENCE_MAX_FILE_BYTES`). Se aplican en `rules.ts`, en el _bucket_ (`file_size_limit` y `allowed_mime_types`) y en el handler, que no se fía del `Content-Type`. | 5 y 11 (el PO fija los valores) |
| Sesión                  | Token Bearer + `supabase.auth.getUser(token)` con un cliente sin privilegios: las consultas se ejecutan como `authenticated` bajo RLS. Ni `service_role` en los handlers ni `@supabase/ssr` por ahora.                                        | 6, con el patrón de `main`      |
| Errores de acceso       | `401 UNAUTHENTICATED` con el mismo cuerpo para token ausente, caducado o inválido; `403` si está autenticado sin permiso; `404` cuando la RLS oculta el recurso.                                                                              | 7                               |
| Borrado de reportes     | `ON DELETE RESTRICT`: el borrado en cascada dejaría objetos huérfanos en Storage.                                                                                                                                                             | 1                               |
| Visibilidad de reportes | Lectura pública (`anon` y `authenticated`), sin estados por ahora; `anon` no lee `author_id`. La escritura sigue siendo cosa de HU-05.                                                                                                        | 2                               |
| Quién aporta            | Cualquier perfil activo, en cualquier reporte legible, también de otros autores.                                                                                                                                                              | 3                               |
| Límite                  | Como mucho `EVIDENCE_MAX_FILES` (5) evidencias por colaborador y reporte, ocultas incluidas; también limita cada envío. Handler y _trigger_ en la base de datos.                                                                              | 4                               |
| Moderación              | `visible` por defecto (moderación reactiva). Solo un administrador activo (`profiles.role_code = 'admin'`) cambia `moderation_status`. Una evidencia oculta deja de contar para la credibilidad, sin restar.                                  | 9 y 10                          |
| Credibilidad (T5)       | `recalculateReportCredibility(reportId, context)` en `web/src/server/credibility.ts`, asíncrona e idempotente, invocada tras guardar la evidencia dentro de un `try/catch`: si falla, se registra y la respuesta sigue siendo `201`.          | 8                               |

La sesión se aparta de la propuesta de usar `@supabase/ssr` (respuesta 6) para seguir el patrón que ya usa `POST /api/reports` en `main`: la plataforma y la extensión envían `Authorization: Bearer <access_token>` y el handler valida el token contra Auth con `getUser(token)`, nunca con `getSession()`. Cuando HU-11 introduzca cookies SSR, el cambio queda en la obtención del token; la autorización sigue siendo la RLS.

#### Modelo y RLS de la tabla

`public.report_evidences` se describe en "Modelo persistente de evidencias (HU-06/T4a)". En resumen: el servidor genera `id`; `storage_path` debe coincidir con `{uploaded_by}/{report_id}/{id}.{png|jpg|webp}`; `UNIQUE (report_id, sha256)`; las dos claves ajenas son `RESTRICT`; un _trigger_ limita a 5 por colaborador y reporte. `authenticated` lee las evidencias visibles de reportes legibles (el autor, todas las suyas; un admin activo, todas), inserta en su nombre con el perfil activo y solo un admin activo actualiza `moderation_status`. Nadie borra filas directamente.

#### _Bucket_ y políticas de `storage.objects`

Migración del endpoint: `insert into storage.buckets` de `report-evidences` con `public = false`, `file_size_limit = 10485760` y `allowed_mime_types = {image/png, image/jpeg, image/webp}`. Políticas para `authenticated` (ninguna para `anon`; ninguna de actualización, así que no se sobrescriben objetos):

| Operación | Condición, además de `bucket_id = 'report-evidences'`                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insert`  | La primera carpeta es `auth.uid()`, el perfil está activo y tiene el rol `collaborator`, la segunda carpeta es un reporte legible y el nombre del archivo tiene la forma `{uuid}.{png\|jpg\|webp}`. `createSignedUploadUrl` exige este permiso. |
| `select`  | La primera carpeta es `auth.uid()` (sus subidas, confirmadas o no), **o** existe una fila de `report_evidences` con ese `storage_path` legible para quien consulta (se delega en la RLS de la tabla). `createSignedUrl` lo exige.               |
| `delete`  | La primera carpeta es `auth.uid()` y el objeto **no** está registrado en `report_evidences`. Sirve para la compensación y para limpiar subidas sin confirmar; una evidencia confirmada no se puede borrar así.                                  |

#### Flujo de subida en dos pasos

1. **Pedir las URL de subida.** `POST /api/reports/{reportId}/evidences/uploads` con `{ "files": [{ "name": "captura.png", "type": "image/png", "size": 48211 }] }` (de 1 a 5 archivos).
   - El servidor comprueba la sesión (401), el perfil activo con rol `collaborator` (403) y que el reporte sea legible (404).
   - Valida con `rules.ts` lo declarado: nombre, extensión, MIME y tamaño. La firma se comprueba al confirmar, con los bytes reales.
   - Comprueba que el colaborador no supere 5 evidencias en el reporte contando las ya guardadas; el _trigger_ es la garantía final.
   - Por cada archivo genera un `uploadId` (UUID) y la ruta `{user_id}/{reportId}/{uploadId}.{ext}`, y llama a `createSignedUploadUrl(ruta)` sin `upsert`.
   - Responde `201` con `{ "uploads": [{ "uploadId", "path", "token", "signedUrl" }] }`, en el mismo orden que `files`.
2. **Subir.** El cliente sube cada archivo con `uploadToSignedUrl(path, token, file, { contentType })`. Storage aplica los límites del _bucket_.
3. **Confirmar.** `POST /api/reports/{reportId}/evidences` con `{ "uploadId": "…", "originalName": "captura.png" }`, una evidencia por petición.
   - Sesión (401), perfil activo con rol `collaborator` (403) y reporte legible (404).
   - Reconstruye la ruta a partir del usuario, del reporte, del `uploadId` y de la extensión de `originalName`; nunca acepta una ruta del cliente.
   - Si el objeto no existe: `400 EVIDENCE_UPLOAD_MISSING`.
   - Descarga el objeto y valida con `validateEvidenceFile` usando su tamaño real y sus primeros bytes. Si no es válido, borra el objeto y responde `400 EVIDENCE_REJECTED`.
   - Recodifica la imagen con `sharp`, valida la copia limpia y la guarda bajo un nuevo `evidenceId`. Calcula el `sha256` de esa copia e inserta la fila con `id = evidenceId`. Tras registrar la evidencia, retira el original. Si la inserción falla, intenta borrar ambos objetos: el _trigger_ del límite da `400 EVIDENCE_REJECTED` (`EVIDENCE_TOO_MANY`), el contenido repetido da `409 EVIDENCE_DUPLICATE` y cualquier otro fallo, `500 EVIDENCE_PERSISTENCE_FAILED`.
   - Responde `201` con `{ "evidence": { "id", "reportId", "originalName", "mimeType", "sizeBytes", "moderationStatus", "createdAt" } }`.
   - **Punto de enganche de la T5:** después de la inserción y antes de responder, en un `try/catch` que registre el error sin cambiar el `201`. La T5 no se implementa hasta que HU-09/T2 esté en `main`.

#### `GET /api/reports/{reportId}/evidences`

Sesión obligatoria (401) y reporte legible (404). Devuelve `200` con `{ "items": [...], "nextCursor": null }`, ordenado por `created_at` descendente con `id` como desempate y con `limit` (1–50, por defecto 20) y `cursor` opaco, como `GET /api/reports`. Cada elemento lleva los campos de la confirmación, una `url` firmada que caduca a los 120 s y `urlExpiresAt`. Solo incluye lo que la RLS deja leer. Una lista vacía es `200` con `items: []`.

#### Errores

Mismo formato que el resto de la API: `{ "error": { "code", "message", "details"? } }`.

| Estado | `error.code`                                                      | Cuándo                                                                                                                                            |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `INVALID_REQUEST`                                                 | JSON mal formado, campos ausentes o de otro tipo, `uploadId` que no es un UUID, `limit` o `cursor` no válidos.                                    |
| `400`  | `EVIDENCE_REJECTED`                                               | Algún archivo no supera `rules.ts`. `details` es la lista `{ index, code }` de `validateEvidenceBatch`; `EVIDENCE_TOO_MANY` va con `index: null`. |
| `400`  | `EVIDENCE_UPLOAD_MISSING`                                         | Se confirma una subida que no existe.                                                                                                             |
| `401`  | `UNAUTHENTICATED`                                                 | Token ausente, caducado o inválido; siempre con el mensaje «Sesión no válida o caducada.».                                                        |
| `403`  | `FORBIDDEN_INACTIVE_PROFILE`                                      | Perfil inexistente o inactivo (mismo código que `POST /api/reports`).                                                                             |
| `403`  | `FORBIDDEN_ROLE`                                                  | El perfil activo no tiene el rol `collaborator`.                                                                                                  |
| `404`  | `REPORT_NOT_FOUND`                                                | `reportId` mal formado, inexistente o no legible: no se distingue «no existe» de «no es visible».                                                 |
| `409`  | `EVIDENCE_DUPLICATE`                                              | El mismo contenido ya está asociado al reporte.                                                                                                   |
| `500`  | `EVIDENCE_STORAGE_FAILED`, `EVIDENCE_PERSISTENCE_FAILED`          | Fallo de Storage o de la base de datos, tras la compensación.                                                                                     |
| `500`  | `PROFILE_LOOKUP_FAILED`, `REPORT_LOOKUP_FAILED`, `INTERNAL_ERROR` | No se pudo comprobar el perfil o el reporte, o error no previsto.                                                                                 |
| `503`  | `SERVICE_UNAVAILABLE`                                             | Supabase no está configurado en el servidor (como en `/api/reports`).                                                                             |

Los códigos de archivo son los de `EVIDENCE_ERROR_CODES`; la interfaz los traduce con `EVIDENCE_ERROR_MESSAGES`. `POST /api/reports` usa todavía `INVALID_SESSION` para el token inválido: conviene alinearlo con este `401` único.

#### Fallos parciales y subidas sin confirmar

- Si el paso 3 falla después de descargar, se borra el objeto (permiso de borrado del propietario sobre objetos no registrados).
- Si también falla el borrado, se registra la ruta (sin datos personales) para limpiarla después.
- Las subidas que nunca se confirman quedan en la carpeta del usuario sin fila asociada. El cliente las borra si el usuario cancela; una limpieza periódica de objetos sin fila con más de 24 h requiere un proceso con privilegios fuera de los handlers y queda pendiente.

#### Metadatos EXIF/GPS (DoD, punto 4)

Con la subida directa, el archivo original llega a Storage **antes** de que el servidor pueda tocarlo, y validar los _magic bytes_ no elimina los metadatos. Decisión (aprobada el 19 de noviembre de 2026, sin cambiar el flujo en dos pasos): en la confirmación, el servidor descarga el original, lo recodifica con `sharp` en el mismo formato (descarta EXIF, GPS, XMP, IPTC y comentarios, aplica la orientación y limita la decodificación a 40 megapíxeles), sube el resultado como un objeto nuevo `{user_id}/{reportId}/{evidenceId}.{ext}`, registra esa ruta y borra el original. Los bytes viajan entre Storage y el servidor, no en el cuerpo de la petición, así que el límite de Vercel no afecta. El original solo existe en la carpeta privada del propio usuario hasta la confirmación o hasta que se borre.

### Modelo persistente de evidencias (HU-06/T4a)

**Estado:** migración `supabase/migrations/20261118170000_create_report_evidences.sql` con pruebas pgTAP (`report_evidences_model.test.sql` y `report_evidences_rls.test.sql`). Aplica las decisiones cerradas en la revisión del contrato de HU-06/T4 (PR #13). El _bucket_ de Storage, sus políticas y los endpoints corresponden al endpoint de HU-06/T4.

- `public.report_evidences` guarda `id` (lo genera el servidor, sin valor por defecto), `report_id`, `uploaded_by`, `storage_path`, `original_name`, `mime_type`, `size_bytes`, `sha256`, `moderation_status` (`visible` u `hidden`, por defecto `visible`) y `created_at`.
- Las restricciones reproducen `rules.ts`: solo `image/png`, `image/jpeg` e `image/webp` (decisión del PO: **sin PDF**), de 1 byte a `EVIDENCE_MAX_FILE_BYTES` (10 MiB) y las reglas del nombre, más la forma NFC. `sha256` son 64 caracteres hexadecimales en minúscula.
- `storage_path` es el nombre del objeto en el _bucket_ privado `report-evidences` y debe ser exactamente `{uploaded_by}/{report_id}/{id}.{png|jpg|webp}`, con la extensión canónica del MIME. La primera carpeta es el propietario, que es lo que comprueban las políticas de `storage.objects`. Nunca contiene el nombre del usuario y en la base de datos solo se guarda la ruta, nunca una URL.
- `UNIQUE (report_id, sha256)` impide aportar dos veces el mismo contenido a un reporte; su índice sirve también para consultar por reporte. `storage_path` es único.
- **Límite por colaborador y reporte:** el _trigger_ `report_evidences_enforce_limit` (función `private.enforce_report_evidences_limit`, _security definer_ con `search_path` vacío y sin permisos de ejecución para los roles de la API) rechaza con `23514`/`EVIDENCE_TOO_MANY` la sexta evidencia de un mismo colaborador en un mismo reporte, contando también las ocultas. Un bloqueo consultivo por colaborador y reporte serializa las inserciones concurrentes; el índice `(uploaded_by, report_id)` sirve al recuento. Si quien inserta (por la API) no es el `uploaded_by`, el _trigger_ no cuenta y deja que la RLS rechace la fila, para no revelar cuántas evidencias tiene otra persona.
- Las dos claves ajenas usan `ON DELETE RESTRICT`: borrar un reporte o un perfil con evidencias falla, para no dejar objetos huérfanos en Storage.

**Seguridad (RLS).** Los _route handlers_ trabajan como `authenticated` con el token Bearer del usuario, igual que la API de reportes; `anon` y `service_role` no tienen ningún permiso.

| Operación  | Permiso de `authenticated`                                                                                               | Política                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lectura    | `SELECT` de la tabla                                                                                                     | `report_evidences_select_visible`: evidencias `visible` de reportes legibles para quien consulta (se delega en la RLS de `reports`). El autor ve todas las suyas, también las ocultas (la política de borrado de `storage.objects` se apoya en ello) y un administrador activo ve todas, para moderarlas. |
| Inserción  | `INSERT` solo de `id`, `report_id`, `uploaded_by`, `storage_path`, `original_name`, `mime_type`, `size_bytes` y `sha256` | `report_evidences_insert_own_active`: en su propio nombre, con perfil activo, estado `visible` y en cualquier reporte legible, también de otros autores.                                                                                                                                                  |
| Moderación | `UPDATE` solo de `moderation_status`                                                                                     | `report_evidences_update_moderation_admin`: solo perfiles activos con `role_code = 'admin'`. Para el resto, la actualización no afecta a ninguna fila.                                                                                                                                                    |
| Borrado    | Ninguno                                                                                                                  | Ocultar es la herramienta de moderación; el borrado de objetos y filas será un procedimiento del servidor.                                                                                                                                                                                                |

Las políticas que consultan `reports` necesitan que `authenticated` pueda leer esa tabla. Las pruebas de RLS emulan la visibilidad de los reportes dentro de su transacción revertida (sustituyen temporalmente las políticas de lectura de `reports`), de modo que no dependen de la política de lectura pública que se añade aparte.

Las pruebas `profiles_backfill`, `reports_backfill` y `roles_backfill` reaplican migraciones anteriores borrando tablas o columnas; ahora eliminan antes `report_evidences` (dentro de su transacción revertida), porque la tabla y sus políticas dependen de `profiles`, `reports` y `profiles.role_code`.

## Credibilidad de reportes (HU-09)

**Requisito relacionado:** HU-09 — Consultar la credibilidad de un reporte.
**Origen de esta definición:** HU-09, T1 — Diseñar un algoritmo de ponderación que distinga entre votos de usuarios según su nivel de confianza.
**Estado:** diseño (T1), cálculo y acceso a datos implementados para HU-09/T2, estado en el listado con HU-01/T7 y explicación visible de factores implementada para HU-09/T3. Siguen pendientes las llamadas tras guardar una evidencia (HU-06/T5) o una valoración (HU-08/T4 y T7). Respeta el contrato acordado en la PR #13 (fila «Credibilidad (T5)» de las decisiones de HU-06/T4) y tiene en cuenta HU-10/T2–T3 (PR #28).

### Criterios que debe cumplir

- **HU-09:** el nivel es comprensible; se actualiza con nuevas evidencias, valoraciones u otra información; puede apoyarse en la IA, pero no depender de ella; la interfaz deja claro que es dinámico y no una garantía.
- **HU-01:** no se da por cierto un reporte cuya credibilidad no esté suficientemente respaldada.
- **RV-VAL-04 (HU-08):** una única validación o invalidación no determina por sí sola la veracidad del reporte.
- **PR #13:** `recalculateReportCredibility` vive en `web/src/server/credibility.ts` (TypeScript, no SQL), es asíncrona y **estrictamente idempotente**: recalcula desde el estado completo, sin incrementos. Solo cuentan las evidencias con `moderation_status = 'visible'`; una oculta deja de contar, no resta.

```ts
export interface RecalculateContext {
  cause:
    | 'evidence_added'
    | 'evidence_moderated'
    | 'validation_added'
    | 'manual_recalc';
  triggerId?: string;
}
export interface CredibilityResult {
  score: number; // 0-100
  level: 'low' | 'medium' | 'high';
  updatedAt: string;
}
export async function recalculateReportCredibility(
  reportId: string,
  context?: RecalculateContext,
): Promise<CredibilityResult>;
```

### Entradas

| Entrada                                  | Origen                            | Qué cuenta                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidencias visibles (`E`)                | `report_evidences`                | Filas del reporte con `moderation_status = 'visible'`. Cada contenido cuenta una sola vez: `UNIQUE (report_id, sha256)` ya impide repetirlo. Cuentan también las del autor del reporte. Una evidencia oculta deja de contar sin restar.                                                                    |
| Valoraciones (`validate` / `invalidate`) | `report_assessments` + `profiles` | Solo la **última** valoración de cada valorador en el reporte (`created_at` descendente, `id` como desempate), y solo si el valorador **no es el autor** del reporte (`reports.author_id`) y su perfil está **activo** (`is_active`). Cada una pesa según el `trust_level` **actual** de quien la emitió.  |
| Fecha del reporte                        | `reports.created_at`              | Solo para `updatedAt` cuando no hay otras entradas.                                                                                                                                                                                                                                                        |
| Rol (`role_code`) y permisos efectivos   | —                                 | **No intervienen.** Un administrador pesa lo mismo que un colaborador con el mismo `trust_level`. Que el valorador tuviera `assessments.submit` y la confianza mínima se comprueba al registrar la valoración (HU-08), no al calcular: retirar el permiso más tarde no anula las valoraciones ya emitidas. |
| IA                                       | —                                 | No interviene en esta versión. Si se añade, entrará como un término acotado más, igual que las evidencias (véase «Extensiones»), sin poder alcanzar por sí sola el nivel alto.                                                                                                                             |

#### Escala y distribución de `trust_level` (HU-10)

`profiles.trust_level` es un `SMALLINT` obligatorio en el intervalo 1–100, con valor inicial 1. HU-10/T2–T3 (PR #28) añadió la consulta de la confianza **propia** (`getMyProfile` en `web/src/server/profile-query.ts` y `GET /api/me/profile`) y la lista de acciones permitidas, pero **ninguna operación que modifique `trust_level`**: no hay función, API ni política de escritura, y `change_role` solo cambia el rol. En la práctica, mientras otra historia no defina cómo evoluciona, todos los perfiles valen 1. El valor 65 de `web/src/app/profile/page.tsx` es un dato de ejemplo hasta HU-11. `assessments.submit` se concede a los tres roles sin condición de confianza; el umbral sigue pendiente de HU-08 y HU-10.

#### Peso de cada valorador

```text
w(t) = 0.25 + 0.75 · (t − 1) / 99        t = trust_level ∈ [1, 100]
```

| `trust_level` | 1    | 34   | 67   | 100  |
| ------------- | ---- | ---- | ---- | ---- |
| `w(t)`        | 0,25 | 0,50 | 0,75 | 1,00 |

Justificación:

- **Lineal.** La escala ya está acotada (1–100), así que una curva de saturación solo redistribuye pesos añadiendo un parámetro más y es más difícil de explicar («comprensible», HU-09). Además, al ser afín, la suma de los pesos de `n` valoraciones se obtiene de `n` y de la suma de sus `trust_level`: `Σw = 0.25·n + 0.75·(Σt − n)/99`. Así la base de datos devuelve solo agregados y **toda la fórmula vive en TypeScript**, como exige el contrato.
- **Con suelo (0,25).** Hoy todos los perfiles valen 1. Sin suelo (`w = t/100`) cada valoración pesaría 0,01 y la credibilidad no se movería. Con el suelo, un colaborador nuevo cuenta un cuarto de uno con la máxima confianza: la confianza distingue (relación 1:4) sin anular la participación.
- **Tope (1,0).** Ningún valorador aporta más de una unidad, y una sola valoración nunca basta para alcanzar el nivel alto o bajo (véase «Niveles y datos suficientes»).

#### Peso de las evidencias

Cada evidencia visible aporta 0,25 a favor (lo mismo que una validación de confianza mínima), con un tope total de 1,0 (4 evidencias): `Ev = min(0.25 · E, 1.0)`. Las evidencias respaldan el reporte, pero no lo confirman: con solo evidencias la puntuación máxima es 67 (nivel medio) y nunca hay datos suficientes, porque estos exigen valoradores.

### Fórmula

```text
V   = Σ w(t) de las validaciones que cuentan
I   = Σ w(t) de las invalidaciones que cuentan
Ev  = min(0.25 · E, 1.0)
P   = V + Ev                 (masa a favor)
N   = I                      (masa en contra)
score = clamp(round(100 · (P + 1) / (P + N + 2)), 0, 100)
```

Es la proporción de apoyo ponderado con **dos votos ficticios neutrales** (uno a favor y otro en contra, de peso 1): sin datos el resultado es exactamente **50**, y con pocos datos tiende a 50. Al crecer la masa, el resultado se acerca a la proporción real de apoyo. El cociente ya está entre 0 y 100; el `clamp` es una defensa. `round` es `Math.round` (al entero más próximo, 0,5 hacia arriba). Añadir una validación o una evidencia nunca baja la puntuación y añadir una invalidación nunca la sube.

`updatedAt` es la fecha más reciente entre las entradas que cuentan (`created_at` de las evidencias visibles y de las valoraciones contadas) o, si no hay ninguna, `reports.created_at`. Es determinista y no usa el reloj. Limitación conocida: ocultar una evidencia, desactivar un perfil o cambiar un `trust_level` no tienen fecha propia, de modo que `updatedAt` puede no moverse (o retroceder) aunque cambie la puntuación.

#### Niveles y datos suficientes

```text
sufficientData = assessors ≥ 2  y  P + N ≥ 1.0
level = 'medium'                  si no sufficientData
        'high'   si score ≥ 70    (con sufficientData)
        'low'    si score < 40    (con sufficientData)
        'medium' en otro caso
```

`assessors` es el número de valoradores distintos que cuentan (tras aplicar las reglas de las entradas). La comparación `P + N ≥ 1.0` usa una tolerancia de `1e-9` para que los errores de coma flotante no cambien el resultado en el límite.

- **HU-01:** un reporte sin datos suficientes **nunca es `high`**, así que no se presenta como respaldado. Tampoco puede serlo con solo evidencias ni con un único valorador.
- **RV-VAL-04:** se exigen al menos dos valoradores; una sola persona, por mucha confianza que tenga, no lleva el reporte a `high` ni a `low`. Por simetría, un único voto hostil tampoco hunde un reporte.
- La masa mínima (1,0) evita que dos cuentas nuevas (0,5 en total) basten: hacen falta, por ejemplo, cuatro valoradores de confianza 1 o dos valoradores con evidencias.
- Sin datos suficientes el nivel es `medium`, entendido como **indeterminado**. Para que la interfaz no lo confunda con «credibilidad moderada», el resultado incluye `sufficientData` (abajo) y la interfaz muestra «Datos insuficientes» en ese caso.

#### Campos opcionales del resultado

Se proponen dos campos **opcionales y aditivos**; no rompen el contrato de la PR #13 y quien solo lea `score`, `level` y `updatedAt` sigue funcionando. HU-09/T2 los rellena siempre.

```ts
export interface CredibilityFactors {
  visibleEvidences: number; // E (antes del tope)
  validations: number; // valoraciones 'validate' que cuentan
  invalidations: number; // valoraciones 'invalidate' que cuentan
  assessors: number; // validations + invalidations
  supportWeight: number; // P, redondeado a 2 decimales
  againstWeight: number; // N, redondeado a 2 decimales
}

export interface CredibilityResult {
  score: number;
  level: 'low' | 'medium' | 'high';
  updatedAt: string;
  sufficientData?: boolean;
  factors?: CredibilityFactors;
}
```

`factors` permite a HU-09/T3 explicar el resultado («3 validaciones, 1 invalidación, 2 evidencias») sin exponer quién valoró ni su confianza. El `context` de `recalculateReportCredibility` solo se usa para registrar la causa en los _logs_: **no cambia el resultado**, condición necesaria para la idempotencia.

#### Presentación (HU-09/T3 y HU-01/T7)

HU-01/T7 implementa la parte del listado (etiqueta, «Datos insuficientes», aviso y ausencia de valor). HU-09/T3 presenta en cada tarjeta un desglose desplegable de evidencias, validaciones, invalidaciones, personas valoradoras y pesos a favor/en contra. Describe reglas de cómputo ya definidas, sin mostrar puntuación como veredicto ni revelar la confianza individual o identidad de quien valoró. Si el cálculo no proporciona factores, la tarjeta lo indica explícitamente.

Mostrar el nivel con texto (no solo color), la indicación «Datos insuficientes» cuando `sufficientData` sea `false` y un aviso del tipo «La credibilidad cambia con nuevas evidencias y valoraciones; no es una garantía de que el patrón exista». Si la credibilidad no está disponible (error), se muestra el reporte sin inventarla (HU01-FL-06 y flujos alternativos de HU-01).

### Reglas anti-abuso

| Riesgo                                       | Regla del algoritmo                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El autor valora su propio reporte            | Se ignora (`assessor_id = reports.author_id`), aunque HU-08 lo llegue a permitir o un operador SQL lo inserte. Sus **evidencias** sí cuentan, pero están acotadas y no generan datos suficientes.                                           |
| Valoraciones repetidas                       | **Solo cuenta la última por valorador** (D1). No hay `UNIQUE (report_id, assessor_id)`: es equivalente si HU-08/T4 impone unicidad y sigue siendo correcto si guarda historial.                                                             |
| Cambio de opinión                            | Cuenta la última acción (D1). No hay retirada en el Sprint 1 (D2); si HU-08 la añade, una valoración retirada dejará de contar.                                                                                                             |
| Muchas evidencias                            | Máximo 5 por colaborador y reporte (_trigger_ de HU-06), contenido único por reporte (`sha256`) y tope de 1,0 en la masa de evidencias: inundar de evidencias no supera 67.                                                                 |
| Evidencias inapropiadas                      | La moderación las oculta y dejan de contar.                                                                                                                                                                                                 |
| Cuentas desactivadas                         | Sus valoraciones dejan de contar mientras estén inactivas; vuelven a contar si se reactivan (el cálculo parte siempre del estado actual).                                                                                                   |
| Un solo valorador decide                     | Imposible: hacen falta 2 valoradores y masa 1,0 para salir de `medium`.                                                                                                                                                                     |
| Varias cuentas de confianza mínima (_sybil_) | **Riesgo residual.** Ocho cuentas nuevas coordinadas alcanzan `high`. Lo mitigan los controles de registro (HU-11), la evolución de la confianza (HU-10) y el umbral para valorar (HU-08). Los umbrales son constantes de `credibility.ts`. |

### Acceso a datos

#### Restricciones detectadas

1. `report_assessments` no es legible por ningún rol de la API (`anon`, `authenticated` ni `service_role`): RLS sin políticas y privilegios revocados (HU-08/T3).
2. `profiles` solo deja leer el perfil **propio** y activo; HU-10/T3 lo confirma (`getMyProfile`). Con el cliente del usuario no se puede leer el `trust_level` de otros valoradores.
3. Los _handlers_ no usan `service_role` (decisión de la PR #13): trabajan como `authenticated` con el token Bearer o como `anon`.
4. La credibilidad se muestra en la consulta pública de HU-01, que usa el cliente sin sesión (`anon`).
5. `recalculateReportCredibility` se invoca desde la confirmación de evidencias (HU-06/T5) dentro de un `try/catch`: su fallo no puede cambiar el `201`.

#### Opción A — Cálculo bajo demanda sin persistir (recomendada)

- Un esquema `credibility_internal` **no expuesto** por PostgREST (`supabase/config.toml` solo expone `public` y `graphql_public`), con el patrón de `authorization_internal` en `20261119104009_role_permissions.sql`: `revoke all` del esquema y `grant usage` solo a los roles que lo necesiten.
- `credibility_internal.report_inputs(report_ids uuid[])`: `SECURITY DEFINER`, `STABLE`, `search_path = ''`, referencias cualificadas, sin SQL dinámico y como mucho 100 identificadores (el `limit` máximo de `GET /api/reports`). Aplica las reglas de las entradas (evidencias visibles; última valoración por valorador, sin el autor y con perfil activo) y devuelve **solo agregados**, una fila por reporte:

  | Columna                                   | Contenido                                                   |
  | ----------------------------------------- | ----------------------------------------------------------- |
  | `report_id`, `report_created_at`          | Identificador y fecha del reporte                           |
  | `visible_evidences`, `latest_evidence_at` | Número de evidencias visibles y la más reciente             |
  | `validations`, `validation_trust_sum`     | Número de validaciones que cuentan y suma de su confianza   |
  | `invalidations`, `invalidation_trust_sum` | Número de invalidaciones que cuentan y suma de su confianza |
  | `latest_assessment_at`                    | Fecha de la valoración contada más reciente                 |

  Nunca devuelve `assessor_id`, `uploaded_by`, el `trust_level` individual ni filas de valoraciones.

- `public.report_credibility_inputs(report_ids uuid[])`: envoltorio `SECURITY INVOKER` que pasa a la función interna **solo los identificadores que la RLS de `reports` deja ver** a quien llama. Así, cuando la moderación añada estados de reporte, la credibilidad respetará la visibilidad sin duplicar la regla.
- `grant execute` sobre ambas funciones (y `usage` del esquema) a `anon` y `authenticated`; nada para `service_role` ni `PUBLIC`.
- TypeScript (`credibility.ts`) llama al envoltorio por RPC, calcula los pesos con `Σw = 0.25·n + 0.75·(Σt − n)/99` y aplica la fórmula en una función pura (`computeCredibility`). `recalculateReportCredibility` = obtener agregados, calcular y devolver; no escribe nada. Puede usar el cliente sin sesión (`createServerSupabaseClient()`), porque los agregados son públicos, o recibir un cliente en un tercer parámetro opcional (aditivo, como `EvidenceServiceOptions`). Una variante por lotes (`getReportsCredibility(reportIds)`) sirve a HU-01/T7 con una sola llamada por página.
- **Residuo de privacidad aceptado:** con un único valorador, `validation_trust_sum` es su `trust_level`, aunque no se revela quién es. La puntuación ya lo dejaría deducir, así que no hay forma de evitarlo sin alterar el resultado.

#### Opción B — Persistir el resultado en `report_credibility`

Una tabla `report_credibility (report_id PK, score, level, sufficient_data, factors, updated_at)` legible por todos. El problema es **quién la escribe**:

- Si TypeScript calcula y escribe con el cliente del usuario, `authenticated` necesita permiso de escritura y cualquiera podría falsificar su puntuación.
- Si escribe con `service_role`, se rompe la decisión de la PR #13.
- La única vía segura es una función `SECURITY DEFINER` que reciba solo `report_id` y recalcule **en SQL**, lo que contradice el contrato («TypeScript, no SQL») y duplica la fórmula.

Además, el valor quedaría obsoleto cuando cambie algo que no dispara el recálculo: un `trust_level`, una desactivación, una moderación o una valoración insertada por un operador. Mantenerlo al día exigiría _triggers_ sobre `profiles`, `report_evidences` y `report_assessments`.

#### Decisión

**Opción A.** Es idempotente por construcción (no hay estado propio que se desincronice), no abre ninguna vía de escritura ni de falsificación, no necesita `service_role`, mantiene la fórmula en TypeScript con pruebas unitarias y refleja siempre los cambios de confianza, estado de cuenta y moderación. El coste es calcular en cada lectura: una consulta agregada por página de resultados, apoyada en los índices existentes (`report_evidences_report_sha256_key`, cuya primera columna es `report_id`, y `report_assessments_report_id_idx`). Si algún día hiciera falta, la opción B se puede añadir como caché derivada sin cambiar el contrato.

### Casos de ejemplo (batería TDD de HU-09/T2)

`t` es el `trust_level` del valorador; `A` el número de valoradores que cuentan. Salvo indicación, ninguno es el autor y todos están activos.

| #   | Entradas                                                      | P   | N    | A   | Score | `sufficientData` | Level  |
| --- | ------------------------------------------------------------- | --- | ---- | --- | ----- | ---------------- | ------ |
| 1   | Sin evidencias ni valoraciones                                | 0   | 0    | 0   | 50    | no               | medium |
| 2   | 2 evidencias visibles                                         | 0,5 | 0    | 0   | 60    | no               | medium |
| 3   | 4 evidencias visibles                                         | 1   | 0    | 0   | 67    | no               | medium |
| 4   | 10 evidencias visibles (dos colaboradores, 5 cada uno): tope  | 1   | 0    | 0   | 67    | no               | medium |
| 5   | 4 evidencias, 2 de ellas ocultas                              | 0,5 | 0    | 0   | 60    | no               | medium |
| 6   | 1 validación, t=100                                           | 1   | 0    | 1   | 67    | no               | medium |
| 7   | 1 invalidación, t=100                                         | 0   | 1    | 1   | 33    | no               | medium |
| 8   | 1 validación t=100 + 4 evidencias (un valorador no basta)     | 2   | 0    | 1   | 75    | no               | medium |
| 9   | 2 validaciones, t=100                                         | 2   | 0    | 2   | 75    | sí               | high   |
| 10  | 2 invalidaciones, t=100                                       | 0   | 2    | 2   | 25    | sí               | low    |
| 11  | 2 validaciones, t=1 (masa insuficiente)                       | 0,5 | 0    | 2   | 60    | no               | medium |
| 12  | 4 validaciones, t=1                                           | 1   | 0    | 4   | 67    | sí               | medium |
| 13  | 8 validaciones, t=1                                           | 2   | 0    | 8   | 75    | sí               | high   |
| 14  | 2 validaciones t=1 + 2 evidencias                             | 1   | 0    | 2   | 67    | sí               | medium |
| 15  | 1 validación t=100 + 1 invalidación t=1                       | 1   | 0,25 | 2   | 62    | sí               | medium |
| 16  | 2 validaciones t=100 + 2 invalidaciones t=100                 | 2   | 2    | 4   | 50    | sí               | medium |
| 17  | 3 validaciones t=100 + 4 evidencias                           | 4   | 0    | 3   | 83    | sí               | high   |
| 18  | 2 validaciones t=34 + 1 invalidación t=67                     | 1   | 0,75 | 3   | 53    | sí               | medium |
| 19  | 1 validación t=34 + 3 invalidaciones t=67                     | 0,5 | 2,25 | 4   | 32    | sí               | low    |
| 20  | El autor valida su reporte (t=100) + 1 validación ajena t=100 | 1   | 0    | 1   | 67    | no               | medium |
| 21  | X valida y después invalida (t=100) + Y invalida (t=100)      | 0   | 2    | 2   | 25    | sí               | low    |
| 22  | 2 validaciones t=100, una de un perfil inactivo               | 1   | 0    | 1   | 67    | no               | medium |
| 23  | Caso 11 tras subir la confianza de ambos valoradores a 100    | 2   | 0    | 2   | 75    | sí               | high   |

Propiedades que también deben probarse:

- **Idempotencia:** el mismo estado da siempre el mismo resultado, con cualquier `context` y llamando varias veces seguidas.
- **Monotonía:** añadir una validación o evidencia no baja la puntuación; añadir una invalidación no la sube.
- **Límites:** el score está siempre entre 0 y 100; solo evidencias nunca dan `high`; un único valorador nunca da `high` ni `low`.
- **`factors`:** en el caso 21, `validations = 0`, `invalidations = 2`, `assessors = 2`; en el caso 4, `visibleEvidences = 10` (antes del tope).
- **`updatedAt`:** la fecha más reciente de las entradas que cuentan; en el caso 1, `reports.created_at`; en el caso 20, la valoración del autor no la mueve.
- **Defensa:** agregados incoherentes (por ejemplo, una suma de confianza fuera de `[n, 100·n]` o recuentos negativos) se rechazan como error, no se corrigen en silencio.

### Extensiones

Cualquier señal futura (IA, informes de moderación, etc.) entra como un término acotado más en `P` o en `N`, con un tope que impida alcanzar `sufficientData` por sí sola, de modo que la credibilidad pueda apoyarse en ella sin depender de ella. Los pesos y umbrales son constantes con nombre en `credibility.ts`; cambiarlos exige actualizar esta tabla de casos.

### Implementación (HU-09/T2)

#### Decisiones del PO

Aprobado por el PO, 19/11/2026:

| #   | Decisión                       | Regla aplicada                                                                                                                                                                                                                                                     |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Repetición y cambio de opinión | Cuenta solo la **última** valoración de cada valorador en el reporte (`created_at` descendente, `id` como desempate). No se añade `UNIQUE (report_id, assessor_id)`: HU-08/T4 decide si guarda historial o impone unicidad; el cálculo es correcto en ambos casos. |
| D2  | Retirada                       | No hay retirada de valoraciones en el Sprint 1. La función interna no la excluye; un comentario en la migración indica dónde hacerlo si HU-08 la añade.                                                                                                            |
| D3  | Reportes propios               | La valoración del autor (`assessor_id = reports.author_id`) se ignora en el cálculo. HU-08/T4 deberá además rechazarla al registrar.                                                                                                                               |
| D4  | Revocación                     | Retirar `assessments.submit` o bajar la confianza por debajo del mínimo **no** anula las valoraciones ya emitidas. El cálculo no vuelve a comprobar permisos; sí excluye los perfiles inactivos (`is_active = false`) y usa el `trust_level` actual.               |
| D5  | Acceso                         | `credibility_internal.report_inputs` es la primera función con lectura de `report_assessments`. La tabla sigue cerrada a `anon`, `authenticated` y `service_role`, y la función devuelve solo agregados.                                                           |
| D6  | Estados de reporte             | Aún no existen; no se filtra por estado. El envoltorio `public.*` respeta la RLS de `reports`, de modo que cuando existan estados se aplicarán solos.                                                                                                              |

#### Piezas

- **Migración** `supabase/migrations/20261119140000_create_report_credibility_inputs.sql`: esquema `credibility_internal` (no expuesto; `usage` solo para `anon` y `authenticated`), `credibility_internal.report_inputs(uuid[])` (`SECURITY DEFINER`, `STABLE`, `search_path = ''`, sin SQL dinámico) y `public.report_credibility_inputs(uuid[])` (`SECURITY INVOKER`, filtra los identificadores por la RLS de `reports`). Ambas rechazan `null` o más de 100 identificadores con `22023` y devuelven una fila por reporte existente y visible, con exactamente las columnas de «Acceso a datos». `execute` solo para `anon` y `authenticated`. No cambia los privilegios de `report_assessments`.
- **Servidor** `web/src/server/credibility.ts` (`server-only`): constantes con nombre de pesos y umbrales, `computeCredibility(inputs)` (pura), `recalculateReportCredibility(reportId, context?, options?)` y `getReportsCredibility(reportIds, options?)`. `options` es un tercer parámetro opcional y aditivo `{ client?, logError? }`; por defecto se usa `createServerSupabaseClient()` sin sesión, porque los agregados son públicos.
- **Pruebas:** `supabase/tests/report_credibility_inputs.test.sql` (forma, privilegios, agregados de los casos con base de datos, límite y RLS) y `web/tests/credibility.test.ts` (los 23 casos, las propiedades y los errores).

#### Errores

Ninguna función inventa credibilidad: si no puede calcularla lanza `CredibilityError` con un `code` estable.

| `code`               | Cuándo                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT`      | Identificador que no es UUID, lista que no es un array o más de 100 identificadores distintos.                                                             |
| `NOT_FOUND`          | `recalculateReportCredibility`: el reporte no existe o quien llama no puede verlo.                                                                         |
| `UNAVAILABLE`        | Configuración de Supabase, red o RPC no disponibles (el error original va en `cause`).                                                                     |
| `INVALID_AGGREGATES` | Respuesta mal formada o agregados incoherentes (recuentos negativos, suma de confianza fuera de `[n, 100·n]`, fechas que no concuerdan con los recuentos). |

`getReportsCredibility` devuelve un `Map` por identificador en minúsculas y omite los reportes inexistentes o no visibles; no registra nada (decide quien llama). `recalculateReportCredibility` registra cualquier fallo con su `context` (causa y `triggerId`) antes de relanzarlo.

#### Cómo invocarlo tras guardar (HU-06/T5, HU-08/T4)

Después de persistir y antes de responder, sin que un fallo cambie la respuesta:

```ts
import { recalculateReportCredibility } from '@/server/credibility';

try {
  await recalculateReportCredibility(reportId, {
    cause: 'evidence_added', // o 'validation_added'
    triggerId: evidence.id, // o el id de la valoración
  });
} catch {
  // Ya registrado por recalculateReportCredibility; la respuesta no cambia.
}
```

En la confirmación de evidencias encaja en `EvidenceServiceOptions.onEvidenceSaved` ([docs/api/evidences.md](api/evidences.md)). Como el cálculo no persiste nada, la llamada solo sirve hoy para registrar fallos y comprobar que el reporte es calculable; HU-09/T3 y HU-01/T7 obtienen el valor actual al leer. Esta tarea no conecta ningún _hook_ ni la interfaz.

#### Límites conocidos

- `updatedAt` se devuelve en ISO 8601 con precisión de milisegundos.
- `credibility_internal.report_inputs` necesita `execute` para `anon` y `authenticated` porque el envoltorio es `SECURITY INVOKER` (el mismo patrón que `authorization_internal`). PostgREST no expone ese esquema; invocada directamente desde SQL solo omitiría el filtro de visibilidad de `reports` y seguiría devolviendo agregados. Hoy todos los reportes son públicos (D6).

### Pendiente de HU-08 (Mario Polaino)

Puntos que había que acordar con HU-08 y su estado tras HU-09/T2:

1. ~~**Cardinalidad:** `UNIQUE (report_id, assessor_id)` o historial.~~ **Resuelto (D1):** cuenta la última por valorador; HU-08/T4 decide si guarda historial o impone unicidad. Si guarda historial, conviene un índice `(report_id, assessor_id, created_at desc)`.
2. ~~**Retirada.**~~ **Resuelto (D2):** no hay retirada en el Sprint 1. Si se añade, la función interna deberá excluirla (lugar señalado en la migración).
3. ~~**Reportes propios.**~~ **Resuelto (D3):** el cálculo los ignora; HU-08/T4 deberá rechazarlos al registrar.
4. ~~**Umbral de confianza y revocación.**~~ **Resuelto (D4):** la revocación no anula valoraciones emitidas; se excluyen los perfiles inactivos y se usa la confianza actual. El valor del umbral (`ASSESSMENTS_MIN_TRUST_LEVEL`) sigue siendo cosa de HU-08 y HU-10.
5. **Abierto — Estados del reporte** que impidan valorar (HU-05). Para la credibilidad no hace falta nada más (D6).
6. **Abierto — Invocación:** después de registrar una valoración, HU-08/T4 debe llamar a `recalculateReportCredibility(reportId, { cause: 'validation_added', triggerId: assessmentId })` dentro de un `try/catch` que no cambie la respuesta (véase «Cómo invocarlo tras guardar»).
7. ~~**Lectura de la tabla cerrada.**~~ **Resuelto (D5):** `credibility_internal.report_inputs` lee `report_assessments` y devuelve solo agregados; las pruebas pgTAP comprueban que la tabla sigue cerrada y que no se exponen identidades.

Fuera de HU-08 quedan la llamada con `evidence_added` (HU-06/T5), con `evidence_moderated` cuando exista la operación de moderación y la presentación en el listado (HU-01/T7).
