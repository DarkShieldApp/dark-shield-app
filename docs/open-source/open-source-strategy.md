# Estrategia y alcance de la apertura

Dark Shield se publica como proyecto open source. Este documento fija **por qué** se abre,
**qué** se publica y qué no, **para quién** y **en qué estado** llega el proyecto a la apertura.
Los aspectos técnicos, de comunidad y de gobernanza se tratan en `technical-readiness.md`,
`community-readiness.md` y `governance-and-sustainability.md`, dentro de esta misma carpeta.

> **Punto de partida.** El repositorio `DarkShieldApp/dark-shield-app` ya es público en GitHub,
> pero **no tiene licencia**: hoy es código visible, no open source. Además, su contenido y su
> historial incluyen piezas que esta estrategia deja fuera (sección 2).

## 1. Objetivo de la apertura y beneficios esperados

Dark Shield pide a los usuarios que confíen en lo que dice sobre las webs que visitan. Abrir el
código persigue tres objetivos:

- **Transparencia sobre nuestras intenciones.** Cualquiera puede comprobar qué hace la extensión
  con su navegación, qué datos se guardan y qué hace la IA con los reportes. En una herramienta que
  denuncia _dark patterns_, un funcionamiento opaco sería incoherente.
- **Mejora y mantenimiento eficientes con la comunidad.** El catálogo de patrones
  (`web/src/lib/reports/categories.ts`), la compatibilidad con navegadores y la IA ganan con
  aportaciones de personas que se encuentran esos patrones a diario. El equipo actual no puede
  cubrir ese mantenimiento solo.
- **Que otros construyan productos similares.** Aceptamos explícitamente que la comunidad
  reutilice el código para crear sus propias herramientas: el objetivo es un internet más seguro,
  no la exclusividad.

## 2. Componentes que se publican y cuáles no

| Parte                                    | Ubicación en el repositorio                                                                                                                                                                                                                                                                                                                                   | Decisión                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Extensión del navegador                  | `extension/`                                                                                                                                                                                                                                                                                                                                                  | Se publica                                                                |
| Web, API y lógica de reportes/evidencias | `web/src/app/`, `web/src/components/`, `web/src/lib/`, `web/src/server/` (salvo abajo)                                                                                                                                                                                                                                                                        | Se publica                                                                |
| Modelo de datos                          | `supabase/migrations/`, `supabase/tests/`                                                                                                                                                                                                                                                                                                                     | Se publica, salvo lo indicado en «Seguridad de los datos de los clientes» |
| IA                                       | No existe todavía; [PENDIENTE: ubicación del módulo de IA]                                                                                                                                                                                                                                                                                                    | **Se publicará íntegra**, incluidos prompts y evaluación                  |
| Algoritmo de puntuación de reportes      | `web/src/server/credibility.ts`, `web/tests/credibility.test.ts`, sección «Credibilidad de reportes» de `docs/domain-design.md`, los pesos del campo `credibility.factors` (`docs/api/reports.md`, «Credibilidad en el listado»), «Integración con credibilidad» de `docs/api/assessments.md` y el apartado de `credibility.ts` en `web/src/server/README.md` | **No se publica** la implementación                                       |
| Seguridad de los datos de los clientes   | Políticas RLS y permisos (`supabase/migrations/`), autorización, autenticación y sesiones (`web/src/server/`), y secretos y configuración de producción (`web/.env`, `SUPABASE_SECRET_KEY`, proyecto Supabase remoto)                                                                                                                                         | **No se publica**                                                         |
| Material interno del equipo              | `reuniones/` (audios y transcripciones), informes de seguimiento de `docs/qa/`                                                                                                                                                                                                                                                                                | **No se publica**: no aporta nada a un colaborador externo                |

**Por qué se excluye el algoritmo de puntuación.** La credibilidad decide qué reportes se muestran
como fiables. Con la fórmula, los pesos y los umbrales a la vista, un grupo coordinado sabe
exactamente cuántas cuentas necesita para hundir o inflar un reporte. La propia documentación
actual lo cuantifica. **Por qué se excluye la seguridad de los datos.** Proteger a los usuarios
prima sobre la transparencia en lo que permitiría acceder a sus datos.

**Tensión con la transparencia y cómo la gestionamos.** Cerrar justo la pieza que decide qué es
creíble puede leerse como una caja negra. Para evitarlo:

1. **Separar el algoritmo como módulo privado.** Hoy lo importan directamente `reports.ts`,
   `assessments.ts` y `evidences.ts`. Se define una interfaz pública `CredibilityProvider`; el
   repositorio público incluye una implementación de referencia simple, marcada como no apta para
   producción, y la de producción vive en un paquete privado. Preferimos un paquete a un servicio
   aparte porque el cálculo es una función pura y no justifica más infraestructura.
2. **Publicar el comportamiento, no la implementación.** Se documentan las entradas (evidencias
   visibles, última valoración de cada usuario, nivel de confianza), las garantías (el autor no
   puntúa su reporte, un solo valorador no decide, las evidencias tienen un tope, la IA no basta
   por sí sola para el nivel alto) y la salida, que la interfaz ya explica al usuario con sus
   factores. No se publican pesos, umbrales ni el análisis de ataques. La API pública tampoco los
   expone: `credibility.factors` se limita a los recuentos que se muestran al usuario, sin pesos.
3. **Cambiar los parámetros al separarlo.** La versión actual ya es pública, también en el
   historial de git: ocultar el fichero sin cambiar sus valores no protege nada.

**Perímetro de «seguridad de los datos».** No se publica el código relacionado con la seguridad de
los datos de los clientes: políticas RLS y permisos, autorización, autenticación y gestión de
sesiones, además de claves, configuración y datos de producción. Para que el proyecto pueda
ejecutarse en local, el repositorio público incluye una configuración de seguridad mínima de
ejemplo, marcada como no apta para producción.

## 3. Usuarios y colaboradores potenciales

| Perfil                                         | Qué busca                                                 | Dónde puede aportar                                                                  |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Usuario habitual de internet                   | Saber si una web le manipula antes de pagar o registrarse | Uso de la extensión y reportes con evidencias                                        |
| Usuario comprometido con un internet accesible | Señalar patrones y validar los de otros                   | Valoraciones, nuevas categorías de patrones, traducciones                            |
| Desarrollador web o de extensiones             | Un proyecto útil en React/TypeScript                      | `extension/` (casi vacía) y la interfaz web                                          |
| Desarrollador interesado en seguridad          | Revisar la seguridad de la parte publicada                | Revisión de la API y la extensión públicas; comunicación privada de vulnerabilidades |
| Perfil de IA                                   | Un caso real y abierto de análisis de reportes            | El módulo de IA desde su diseño                                                      |
| Creador de productos derivados                 | Reutilizar la base para su propia herramienta             | Forks; mejoras que vuelvan al proyecto                                               |

## 4. Madurez del proyecto y funcionalidades no preparadas

Dark Shield es un **primer prototipo**. La base técnica es sólida (CI en verde, alta cobertura de
pruebas, migraciones con pruebas pgTAP), pero la funcionalidad de cara al usuario está incompleta:

- **IA:** sin código ni proveedor elegido (`docs/architecture.md`).
- **Extensión:** solo un popup con texto fijo; no consulta reportes ni muestra alertas.
- **Creación de reportes:** no funciona contra una base de datos real por falta del permiso de
  inserción.
- **Valoraciones:** el umbral mínimo de confianza para valorar no está decidido.
- **Confianza de usuarios:** no existe ninguna operación que la modifique; todos valen 1. El perfil
  muestra datos de ejemplo.
- **Moderación de evidencias:** sin endpoint.
- **Sesiones:** sin cookies SSR y sin sesión en la extensión.

**Dificultades para un colaborador externo.** El sistema interno es complejo: reglas de negocio
repartidas entre TypeScript, funciones SQL y políticas RLS; documentación en español organizada
por historias de usuario internas; y dependencia de Docker y Supabase CLI para ejecutar las
pruebas de base de datos. La IA añadirá complejidad propia. Hoy no hay ningún issue abierto, y
tampoco ninguno marcado como _good first issue_, por el que empezar.

## 5. Prioridades para el éxito de la apertura

1. **Resolver la exclusión del algoritmo antes de anunciar el proyecto.** Es la única decisión de
   alcance que no puede corregirse después: cada día que el repositorio siga público con la
   fórmula actual, esta queda más expuesta. Separarla (sección 2) también ordena el código.
2. **Que un externo pueda ejecutar el flujo completo en local.** Un colaborador que no consigue
   crear un reporte el primer día no vuelve. Implica corregir la creación de reportes, sustituir
   los datos de ejemplo del perfil y una guía de arranque que no presuponga conocer el proyecto.
3. **Diseñar en abierto el contrato de la IA antes de escribirla.** La IA es nuestro principal
   compromiso de transparencia y aún no existe: definir en público su entrada, su salida y sus
   límites (apoya, no decide) la hace auditable desde el primer día y da a la comunidad un punto
   de entrada claro.

## 6. Riesgos

| Riesgo                                                                                          | Mitigación                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| El algoritmo ya está en el historial público y en forks o clones existentes                     | Cambiar parámetros al separarlo; no confiar en reescribir el historial       |
| La comunidad percibe la puntuación privada como caja negra                                      | Especificación pública del comportamiento y factores visibles en la interfaz |
| Los forks no reproducen el producto sin el módulo privado                                       | Implementación de referencia funcional y documentada                         |
| La complejidad interna y el idioma frenan las primeras contribuciones                           | Prioridad 2 y _good first issues_ (`community-readiness.md`)                 |
| Material interno y datos personales del equipo publicados (`reuniones/`, nombres en documentos) | Retirarlo del repositorio y valorar su historial (`technical-readiness.md`)  |

## 7. Acciones pendientes

- [ ] Separar el código de seguridad de los datos de los clientes (sección 2) y publicar la
      configuración mínima de ejemplo para desarrollo local.
- [ ] Definir `CredibilityProvider`, mover la implementación a un paquete privado con nuevos parámetros
      y publicar la implementación de referencia.
- [ ] Sustituir la sección de credibilidad de `docs/domain-design.md` por la especificación de comportamiento,
      y retirar los pesos de `credibility.factors` de la API y de `docs/api/`.
- [ ] Retirar `reuniones/` y los informes internos del repositorio público.
- [ ] Decidir el idioma de la documentación pública. [PENDIENTE: español, inglés o ambos.]
- [ ] Publicar el borrador del contrato de la IA. [PENDIENTE: proveedor y ubicación del módulo.]
- [ ] Añadir la licencia elegida en `community-readiness.md` antes de anunciar el proyecto.
