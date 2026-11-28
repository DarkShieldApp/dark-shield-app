# Análisis inicial del proyecto

## ¿Por qué queremos abrir nuestro proyecto?

Queremos abrirlo para permitir a los usuarios una mayor transparencia sobre nuestras intenciones con el programa y para que la comunidad pueda ayudar, mejorar e incluso crear productos similares. El objetivo principal es mejorarlo y mantenerlo de manera eficiente mientras conservamos la transparencia.

## ¿Qué tipo de comunidad o colaboradores queremos atraer?

Queremos atraer a usuarios familiarizados con internet que quieran mejorarlo para convertirlo en un lugar más accesible y seguro. También queremos atraer a desarrolladores que ayuden a mejorar la seguridad de internet mediante el mantenimiento y la mejora de la aplicación.

## ¿Qué partes del proyecto se publicarán y cuáles deberían quedar fuera?

Se publicará todo el código relacionado con la IA para favorecer un sistema transparente. Se protegerá el algoritmo que impondrá el sistema de puntuación de los reportes para evitar el mal uso por parte de usuarios maliciosos y mantener la robustez del sistema. También se protegerán los fragmentos de código relacionados con la seguridad de los datos del cliente.

## ¿En qué estado de madurez se encuentra el proyecto?

El proyecto está en una etapa muy temprana: solo hemos podido crear un primer prototipo que nos permitirá mejorar y aprender de los errores. Al ser un proyecto temprano, damos mucho margen de mejora y eficiencia a los desarrolladores que lo utilicen.

## ¿Qué dificultades podría encontrar una persona externa que quisiera utilizarlo o contribuir?

El funcionamiento del sistema interno puede resultar tedioso y complejo, incluida la IA, lo que podría frenar la capacidad de desarrollo de nuevos colaboradores.

---
# Plan de lanzamiento Open Source — Dark-Shield

**Actividad 3 · Integración y plan de lanzamiento**  
**Fecha:** 28/11/2026  
**Estado:** propuesta común a partir de los entregables de los equipos A, B, C y D.

## Decisión común

Dark-Shield cuenta con una base técnica organizada, CI y propuestas de licencia, comunidad y gobernanza, pero todavía no está listo para una apertura formal. La primera publicación se plantea **solo como código fuente y prototipo**, sin abrir una instancia pública operativa. La release debe quedar condicionada al cierre de los riesgos de privacidad/historial, autorización y controles técnicos, y a completar las verificaciones de gobernanza indicadas abajo.

No se anunciarán como funcionales los flujos afectados por OBS-01, OBS-02, OBS-05 y OBS-06 mientras sigan pendientes. La extensión se describirá como prototipo Manifest V3 que aún no consume la API. Abrir una instancia con usuarios, moderación y almacenamiento de evidencias será una etapa posterior, tras acordar capacidad operativa y financiación.

## Acuerdos integrados y coherencia entre equipos

| Área | Acuerdo común | Condición o pendiente |
|---|---|---|
| Licencia | Apache-2.0 para código propio y conservación de avisos de terceros. | Revisar licencias transitivas y preparar SBOM/avisos antes de distribuir artefactos; la revisión de dependencias directas no basta. |
| Alcance | Publicar web, extensión prototipo, migraciones y configuración local, pruebas y documentación. Excluir datos/configuración de producción. | Retirar `reuniones/` y `docs/qa/`; revisar archivos, enlaces, binarios, historial y artefactos. `.gitignore` no elimina contenido ya versionado. |
| Credibilidad | Separar la implementación privada tras `CredibilityProvider` y publicar una implementación de referencia con especificación de comportamiento. | El algoritmo actual ya aparece en el historial: ocultar el archivo no basta. Cambiar parámetros de producción y confirmar el perímetro de datos entre los equipos A y B. |
| IA | No existe una implementación en el producto actual. La propuesta es publicar íntegramente el código futuro, prompts y evaluación. | Confirmar el acuerdo entre equipos y definir proveedor, ubicación y contrato cuando existan. IA queda fuera del alcance funcional de esta primera publicación. |
| Valoraciones | El umbral de confianza de producción es privado; PO y Comité deciden el valor y documentan el criterio en un ADR. | `minimum_trust_level` está en `NULL` y bloquea valoraciones (OBS-02). En `.env.example` solo se incluirá un valor de ejemplo local, nunca el de producción. |
| Gobernanza | Modelo híbrido con maintainers por área y Comité de Dirección de tres personas. Las decisiones vinculantes se registran en GitHub o ADR. | Revisar las secciones 4–6 aún marcadas como borrador, publicar `GOVERNANCE.md` y `MAINTAINERS.md`, asignar dos maintainers a extensión y confirmar continuidad de al menos dos maintainers. |
| Comunidad | GitHub será el canal público de issues, PR y decisiones. Triage semanal con objetivo de primera respuesta en cinco días hábiles. | Habilitar `SECURITY.md` y contacto confidencial antes del anuncio. No publicar vulnerabilidades, evidencias reales ni datos personales en issues. ClickUp/Discord quedan para coordinación interna, no como registro único de decisiones. |
| Revisión | PR con revisión independiente, checks `check` y `database`, dos aprobaciones en cambios sensibles, squash y sin auto-fusión. | Comprobar en GitHub CODEOWNERS, owners (al menos dos con 2FA) y reglas efectivas de protección de `main`; el documento no prueba su configuración real. |
| Documentación | README en castellano como entrada, con estado real, limitaciones, instalación local, pruebas, contribución y licencia. | Decidir si la documentación pública será en español, inglés o ambos. Validar onboarding desde un clon limpio, sin depender de ClickUp, Supabase compartido o secretos de producción. |
| Operación | Primera etapa sin instancia pública operada; documentar self-hosting local. | Antes de abrir una instancia, acordar moderación, reclamaciones y retirada, límites/limpieza de evidencias (OBS-18), almacenamiento y financiación. No asumir que el plan gratuito cubre la operación sostenible. |

## Condiciones antes de publicar

- [ ] **Auditoría de seguridad:** ejecutar Gitleaks sobre el árbol, historial y referencias remotas; revisar manualmente archivos, binarios y artefactos. Revocar/rotar cualquier secreto detectado, investigar su uso y sanear el historial si corresponde.
- [ ] **Limpieza:** retirar `reuniones/`, `docs/qa/`, datos y artefactos internos; revisar historial y los archivos que entren en la release, y reparar referencias rotas.
- [ ] **Credibilidad:** confirmar el perímetro acordado, extraer la implementación privada mediante `CredibilityProvider`, añadir referencia pública y comprobar que el clon público compila sin el módulo privado.
- [ ] **Autorización/producto:** corregir OBS-01, OBS-02, OBS-05 y OBS-06 antes de presentar esos flujos como utilizables. Para afirmar que el flujo principal funciona, pasar pgTAP positivo/negativo y E2E en local con datos sintéticos. Si se publica una versión solo de código antes, declarar claramente los flujos no disponibles.
- [ ] **Repositorio:** verificar owners de GitHub/Supabase y 2FA, CODEOWNERS y protección efectiva de `main`, con `check` y `database` obligatorios, revisiones requeridas, squash y prohibición de fusión propia.
- [ ] **Gobernanza y comunidad:** aprobar/publicar `GOVERNANCE.md`, `MAINTAINERS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` y `SECURITY.md`; validar contactos confidenciales, conflictos de interés y responsables por área.
- [ ] **Continuidad:** designar dos maintainers de extensión y confirmar por escrito la continuidad de al menos dos maintainers, con dedicación semanal acotada.
- [ ] **Dependencias:** ejecutar `npm audit`, revisar licencias y vulnerabilidades transitivas, resolver vulnerabilidades altas/críticas explotables o registrar mitigación aprobada y generar SBOM/avisos (incluidas LGPL, MPL y CC-BY cuando aplique).
- [ ] **Onboarding:** seguir README desde clon limpio con Node.js/npm y Supabase local, revisar enlaces y configuración, sin credenciales de producción ni servicios privados.
- [ ] **Issues iniciales:** verificar que las propuestas no estén asignadas en ClickUp, y publicarlas en GitHub con etiquetas y responsables de mentoría.
- [ ] **Release:** el Comité valida alcance, estado de prototipo, changelog, tag y artefactos revisados.

La CI descrita por Equipo B ejecuta `npm ci`, `npm run check`, cobertura, Supabase local, pgTAP y E2E de valoraciones. Las 921 pruebas y 99,29 % de cobertura citadas en el informe del Sprint 1 son una medición anterior, no evidencia de que se hayan repetido en el candidato actual. Los análisis y checks pendientes deben ejecutarse sobre ese candidato.

## Roadmap de apertura

| Momento | Tareas | Resultado verificable |
|---|---|---|
| **Antes de publicar** | Cerrar las condiciones anteriores; limpiar árbol e historial; resolver secretos; separar credibilidad; corregir autorización o dejar claros los flujos no disponibles; completar revisión de licencias/SBOM y `npm audit`; aprobar y publicar gobernanza y seguridad; asignar maintainers y continuidad; proteger `main`; validar onboarding desde clon limpio; preparar issues iniciales. | Revisión del Comité con responsables y evidencias. Sin secretos ni material interno, controles remotos verificados y sin hallazgos críticos sin resolver. |
| **Primera publicación** | Crear tag y release versionada como prototipo, con changelog y artefactos revisados; publicar README y documentación; anunciar alcance, limitaciones y roadmap; habilitar canales públicos/confidenciales y abrir issues iniciales. | Release reproducible y anuncio fiel al estado real. Solo código; sin instancia pública operativa. GitHub como registro público de decisiones y contribuciones. |
| **Después de publicar** | Triage semanal; responder con objetivo de cinco días hábiles; revisar/fusionar PR según las reglas; atender vulnerabilidades por canal confidencial; mantener dependencias y releases; revisar indicadores mensualmente. | Seguimiento público de issues y decisiones, releases documentadas y revisión de capacidad. Considerar una instancia operada solo tras aprobar moderación, gestión de evidencias y financiación. |

### Issues iniciales propuestas

Estas tres tareas de Equipo C aún no están creadas ni etiquetadas. Comprobar que no estén asignadas en ClickUp antes de ofrecerlas:

1. **GFI-01 — Eliminar el formulario duplicado de creación de reportes:** enlazar desde el panel a `/reports/new`; no modificar API ni autorización.
2. **GFI-02 — Documentar el almacenamiento de evidencias:** crear un ADR alineado con el contrato actual de Supabase Storage, sus formatos y límites.
3. **GFI-03 — Actualizar el índice de endpoints API:** alinear rutas y enlaces con los handlers sin cambiar código ni dar por resueltas las limitaciones de autorización/valoraciones.

No ofrecer como tareas iniciales cambios de autorización, RLS o algoritmo de credibilidad: requieren contexto y revisión especializada.

## Indicadores de salud

| Indicador | Qué permite detectar | Actuación si empeora |
|---|---|---|
| Tiempo hasta primera respuesta a issues | Comunidad desatendida o triage sin responsable. Medir mediana mensual frente al objetivo de cinco días hábiles. | Activar rotación semanal, nombrar suplente y ajustar capacidad; acusar recibo aunque resolver tarde más. |
| Concentración de contribuciones | Dependencia de pocas personas, conocimiento concentrado o áreas con un solo maintainer activo. | Repartir revisiones, documentar áreas críticas, ofrecer mentoría y asegurar cobertura de dos personas por área, en especial extensión. |
| Nuevos colaboradores que completan su primera contribución | Fricción de onboarding o dificultad para atraer comunidad. Contar primeras contribuciones completadas, no solo visitas o registros. | Probar README y proceso con alguien externo, mejorar tareas pequeñas y etiquetas, responder dudas y asignar mentoría. |
| Actividad de mantenimiento y continuidad | Riesgo de abandono, deuda acumulada o incapacidad para atender incidencias/releases. | Revisar carga y prioridades en el Comité, reducir alcance, buscar relevo o financiación y declarar modo de mantenimiento; archivar con aviso si no hay relevo tras el plazo acordado. |

Revisar los indicadores mensualmente durante los primeros seis meses, junto con vulnerabilidades, PR pendientes, dependencias y capacidad de moderación. El volumen bruto de commits no es una medida suficiente de salud.

## Fuentes

- [`community-readiness.md`](community-readiness.md)
- [`governance-and-sustainability.md`](governance-and-sustainability.md)
- [`open-source-strategy.md`](open-source-strategy.md)
- [`technical-readiness.md`](technical-readiness.md)

---

# Cierre de práctica 9

## ¿Está el proyecto preparado para publicarse hoy? Justificad la respuesta.

No está listo para publicarse a nivel comercial o formal. Todavía habría problemas con la privacidad de los usuarios y los historiales a nivel comercial. A su vez, podría haber problemas menores al no haber algunos documentos legales revisados ni términos de uso y servicio.

## ¿Cuál es el principal riesgo de abrirlo en su estado actual?

Exponer material interno o dejar una aplicación de reportes con permisos inconsistentes, y que el usuario medio que revise un código abierto de un producto que no está listo para lanzarse comercialmente crea que es un producto completamente terminado.

## ¿Cuál sería la primera tarea que realizaríais mañana?

Hacer una reunión con todos los miembros para iniciar la limpieza y auditoría del árbol y del historial, confirmar el perímetro de credibilidad y asignar responsables y fechas para los posibles defectos de autorización. Registrar cada decisión y evidencia en GitHub.

## ¿Qué podría provocar que el proyecto fracasara aunque el código estuviese disponible públicamente?

Que no haya suficiente apoyo comercial a la idea y no se cree una comunidad de usuarios, tanto colaboradores como personas interesadas en utilizar la aplicación. Otra posibilidad es que, a nivel legal, tuviésemos que reducir enormemente las capacidades de la aplicación, hasta dejarla muy limitada o impedirle acceder a páginas donde su uso sería interesante.
