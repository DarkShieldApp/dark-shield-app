# Preparación de la comunidad — Dark-Shield

| Campo       | Valor                                                   |
| ----------- | ------------------------------------------------------- |
| Práctica    | P9 — Preparación del proyecto para Open Source          |
| Grupo       | Dark-Shield                                             |
| Equipo      | C — Licencia, documentación y colaboración              |
| Integrantes | Jorge García Galeote · Mario Polaino Blanco             |
| Fecha       | 26/11/2026                                              |
| Estado      | Propuesta para la puesta en común y revisión del equipo |

## 1. Elección de la licencia

**Decisión: Apache License 2.0 (`Apache-2.0`)** para el código propio que se decida publicar. Su texto íntegro se incorpora en [LICENSE](../../LICENSE), sin modificaciones.

Dark-Shield busca que otras personas auditen, reutilicen y mejoren su software, incluso para construir productos derivados. Una licencia permisiva reduce las barreras a la adopción y concuerda con la [estrategia de apertura](open-source-strategy.md). Frente a MIT, Apache 2.0 aporta una concesión expresa de patentes de los contribuidores en los términos de la licencia, y regula la conservación de avisos y la identificación de cambios en archivos modificados. Frente a GPL, no obliga a publicar bajo la misma licencia las modificaciones de código propio que se redistribuyan. Se acepta que no todas las mejoras de terceros reviertan al proyecto; se fomentará su retorno mediante una comunidad activa y un proceso de contribución sencillo.

### Compatibilidad de dependencias

Se han revisado los tres manifiestos `package.json` y el `package-lock.json` de `main`. Las 23 dependencias directas (incluidas las de desarrollo, contando cada paquete distinto una sola vez) declaran MIT, salvo TypeScript 5.9.3 y Sharp 0.35.5, que declaran Apache-2.0. No se identifica una dependencia directa que impida esta licencia para el código propio.

## 2. Documentación y onboarding

**Decisión:** el [README](../../README.md) será el punto de entrada para cualquier persona externa. Se actualiza el existente, que ya contenía arquitectura, arranque, comandos y configuración, pero mantenía descripciones anteriores al cierre del Sprint 1 y carecía de licencia y guía de contribución.

Contenido mínimo definido: propósito y destinatarios, estado real y limitaciones, roadmap, estructura y stack, requisitos, arranque web/extensión y Supabase local, comandos de calidad, documentación técnica, contribución, soporte y licencia. Se separa el arranque rápido sin credenciales del flujo con base de datos local. No se obliga a acceder al Supabase compartido ni a ClickUp para contribuir.

Esta decisión reduce el coste de incorporación y el riesgo de expectativas falsas. Antes de anunciar la apertura, una persona ajena a la implementación deberá seguir el README desde un clon limpio, registrar bloqueos y corregir los enlaces y pasos. Se mantiene el castellano de la documentación existente; la decisión de añadir una versión inglesa se coordinará con el Equipo A. No se afirma que el flujo completo esté operativo ni se promete un tiempo de instalación sin medirlo.

**Dificultad conocida.** El funcionamiento interno puede resultar tedioso y complejo para quien llega de fuera, incluida la IA cuando se incorpore. Para reducir esa barrera, el README remite a la arquitectura y las primeras tareas se ofrecen como _good first issues_ acotadas, cada una con un maintainer como mentor.

## 3. Gestión de issues

**Decisión:** mantener las plantillas existentes [Bug report](../../.github/ISSUE_TEMPLATE/bug_report.md) y [Feature request](../../.github/ISSUE_TEMPLATE/feature_request.md) como canal de entrada público. Su uso, clasificación y seguimiento se describen en [CONTRIBUTING.md, sección 2](../../CONTRIBUTING.md#2-issues-comunicar-errores-y-proponer-mejoras).

GitHub será la referencia pública para cambios y decisiones, sin duplicar la planificación interna de ClickUp. Las etiquetas `accepted`, `needs-decision`, `decision` y `security-block` se incorporarán según el Equipo D. Se propone un triage semanal rotatorio con primera respuesta en cinco días hábiles (plazo del Equipo D, ajustado a la disponibilidad del equipo), sin prometer resolución inmediata. No se publicarán vulnerabilidades ni evidencias reales en las issues: hay que habilitar el contacto confidencial de seguridad especificado en la guía.

## 4. Normas de Pull Requests

**Decisión:** mantener `main` como rama de integración y la [plantilla de PR](../../.github/pull_request_template.md), con contribuciones pequeñas, revisables e identificables. Las reglas operativas de ramas, commits, pruebas, revisión y fusión se recogen en [CONTRIBUTING.md, secciones 3–7](../../CONTRIBUTING.md#3-ramas-y-flujo-git).

La convención propuesta de ramas por tarea y Conventional Commits formaliza los prefijos usados en el historial sin exigir reescribir los commits existentes. Se adoptan las reglas de [gobernanza del Equipo D](governance-and-sustainability.md): revisión independiente, doble aprobación en cambios sensibles, CI y DoD, _squash_ y prohibición de fusionar la propia PR. Se preserva la trazabilidad HU/subtarea cuando corresponda; una contribución externa no necesita acceso a ClickUp.

El Equipo B debe verificar la protección efectiva de `main` y sus checks reales (`check` y `database`); el Equipo D publicará responsables y CODEOWNERS. La configuración de una rama protegida no demuestra que todas las reglas estén activas.

## 5. Código de conducta

**Decisión:** adoptar el [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) propuesto, con reglas de respeto e inclusión, conductas no permitidas, ámbito, denuncia confidencial, gestión de conflictos de interés, medidas proporcionales y revisión. El Comité atiende los incidentes excluyendo a las personas implicadas, de acuerdo con el modelo de gobernanza. El procedimiento y las medidas son una propuesta específica para Dark-Shield, no una copia literal de un código de terceros.

Es especialmente relevante porque el producto trata evidencias y valoraciones sobre webs: debe proteger tanto a contribuidores como a personas afectadas por la difusión indebida de datos, sin confundir el debate técnico con el acoso. El código regula la comunidad de desarrollo; la moderación del producto se establecerá separadamente. Antes de abrir la participación se verificarán los contactos principal y alternativo y se acordarán responsables sin conflicto de interés.

## 6. Good first issues

Actualmente no hay issues abiertas en GitHub en la revisión de `main`. Se proponen las siguientes **tres tareas nuevas para trasladar a GitHub Issues**, derivadas de observaciones reales de T-CTRL-04 y verificadas en los archivos actuales. No están creadas ni etiquetadas todavía. Se comprobará que no estén asignadas en ClickUp antes de ofrecerlas. Se han evitado tareas de autorización, RLS o algoritmo de credibilidad que requieren conocimiento crítico y doble revisión.

### GFI-01 — Eliminar el formulario duplicado de creación de reportes

- **Origen:** OBS-10, HU-01/T4 y HU-05.
- **Tipo y etiquetas:** `bug`, `good first issue`.
- **Esfuerzo orientativo:** 1–2 h, sin contar la incorporación inicial.
- **Contexto:** `web/src/app/dashboard.tsx` contiene un formulario secundario cuyo `submitReport` valida el borrador localmente pero no crea el reporte. Existe ya el formulario principal en `/reports/new` (`web/src/components/ReportForm.tsx`).
- **Tarea:** sustituir el formulario secundario por un enlace accesible a `/reports/new` y retirar su estado/lógica si deja de utilizarse. No modificar la API, autenticación ni autorización de inserción (OBS-01 queda fuera).
- **Punto de entrada:** `web/src/app/dashboard.tsx`, `web/src/app/dashboard.module.css`.
- **Mentoría propuesta:** maintainer de interfaz web.

Criterios de aceptación:

- [ ] El acceso desde el panel conduce a `/reports/new` y funciona con teclado.
- [ ] No queda un segundo formulario de creación que simule un envío exitoso.
- [ ] La consulta de reportes y el panel de evidencias conservan su comportamiento.
- [ ] Se aporta comprobación visual con datos sintéticos y pasan los checks de CI.

Es adecuada porque es una modificación de interfaz acotada, permite conocer el flujo React/Next.js y no requiere credenciales ni tocar operaciones sensibles.

### GFI-02 — Documentar la decisión de almacenamiento de evidencias

- **Origen:** OBS-15, HU-06/T1; decisión recogida en la respuesta 5 de la [PR #13](https://github.com/DarkShieldApp/dark-shield-app/pull/13).
- **Tipo y etiquetas:** `documentation`, `good first issue`.
- **Esfuerzo orientativo:** 45–60 min.
- **Tarea:** crear `docs/adr/0005-evidence-storage.md` (o el siguiente identificador libre), siguiendo el formato de los ADR existentes. Explicar por qué se eligió Supabase Storage, qué alternativas se consideraron según la documentación y cómo se integra con Auth y RLS. Distinguir las propuestas de la PR de las decisiones finales ya reflejadas en la API (PNG, JPEG y WebP, hasta 10 MiB, sin PDF).
- **Punto de entrada:** `docs/adr/0004-supabase-persistence.md`, `docs/api/evidences.md` y `supabase/README.md`.
- **Mentoría propuesta:** maintainer de documentación con consulta al área de BD.

Criterios de aceptación:

- [ ] ADR con contexto, decisión, consecuencias y referencia a la fuente original.
- [ ] La decisión se ajusta al contrato actual y no incluye claves, URLs firmadas reales, datos personales ni detalles excluidos por la estrategia de apertura.
- [ ] ADR enlazado desde la sección de decisiones de `docs/architecture.md`; documentación y enlaces revisados; formato correcto.

Es adecuada para aprender la arquitectura y el proceso de decisiones sin modificar código, SQL ni configuración de seguridad. No se rediseña el almacenamiento.

### GFI-03 — Actualizar el índice de endpoints de la API

- **Origen:** OBS-16, documentación desactualizada tras HU-11, HU-08 y HU-10.
- **Tipo y etiquetas:** `documentation`, `good first issue`.
- **Esfuerzo orientativo:** 45–90 min.
- **Contexto:** `web/src/app/api/README.md` no lista las rutas de inicio de sesión, perfil propio y valoraciones que sí existen en `web/src/app/api/`; conserva además información antigua sobre la sesión del formulario de reportes.
- **Tarea:** actualizar exclusivamente el índice de endpoints y enlaces; contrastar `POST /api/auth/sign-in`, `GET /api/me/profile` y `POST /api/reports/{reportId}/assessments` con sus handlers. Indicar las limitaciones de creación y activación de valoraciones sin dar por resueltos los fallos pendientes. No modificar contratos ni comportamiento.
- **Punto de entrada:** `web/src/app/api/README.md`, los `route.ts` correspondientes y `docs/api/assessments.md`, `docs/api/reports.md`.
- **Mentoría propuesta:** maintainer de backend/API o documentación.

Criterios de aceptación:

- [ ] Métodos, rutas, propósito y requisitos generales de acceso coinciden con el código y la documentación de referencia.
- [ ] Se eliminan afirmaciones obsoletas sin prometer funcionalidades no operativas.
- [ ] Enlaces relativos válidos, sin secretos, sin datos reales y formato correcto.
- [ ] No se cambia código de producción ni el esquema de base de datos.

Es una tarea independiente de GFI-01 y GFI-02; introduce la navegación por las rutas Next.js y la lectura de contratos sin ejecutar infraestructura ni modificar seguridad.
