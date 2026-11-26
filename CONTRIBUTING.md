# Contribuir a Dark-Shield

Gracias por tu interés en mejorar Dark-Shield. Puedes contribuir con código, pruebas, documentación, accesibilidad, traducciones o propuestas de mejora. No es necesario pertenecer al equipo universitario original.

Toda participación debe respetar el [Código de conducta](CODE_OF_CONDUCT.md). La comunicación se realiza principalmente de forma asíncrona en GitHub. ClickUp y los canales internos pueden servir para organizar el trabajo del equipo, pero las decisiones que afecten a la comunidad deben quedar documentadas públicamente sin exponer información privada.

## 1. Antes de empezar

1. Lee el [README](README.md) y la [guía de desarrollo](docs/development.md).
2. Revisa las [issues abiertas](https://github.com/DarkShieldApp/dark-shield-app/issues) y las [PR](https://github.com/DarkShieldApp/dark-shield-app/pulls) para evitar duplicados.
3. Si eres nuevo, busca `good first issue`. Comenta qué tarea quieres abordar y acuerda el alcance con un maintainer antes de empezar. Si ya está asignada, consulta si puedes colaborar o escoge otra.
4. Prepara tu entorno siguiendo el README. Para el trabajo con base de datos usa tu propia instancia local; no necesitas credenciales del equipo.

## 2. Issues: comunicar errores y proponer mejoras

Abre una issue mediante [New issue](https://github.com/DarkShieldApp/dark-shield-app/issues/new/choose) y selecciona la plantilla correspondiente. Busca también entre las incidencias cerradas. Si existe una equivalente, añade información al hilo existente.

### Reportar un bug

Usa [Bug report](.github/ISSUE_TEMPLATE/bug_report.md). La plantilla propone el título `[Bug]:` y la etiqueta `bug`. Completa todos los apartados aplicables:

- **Descripción y ámbito:** qué falla y si afecta a frontend, backend, extensión o infraestructura/documentación.
- **Pasos para reproducir:** secuencia mínima, versión o commit, y datos sintéticos.
- **Resultado esperado y actual:** distingue el comportamiento que esperabas del observado.
- **Evidencias y entorno:** sistema operativo, navegador, versión de Node si procede, mensajes de error o capturas anonimizadas. Elimina tokens, correos, URLs firmadas, credenciales y datos reales.

### Proponer una funcionalidad

Usa [Feature request](.github/ISSUE_TEMPLATE/feature_request.md). La plantilla propone `[Feature]:` y `enhancement`. Describe la necesidad, el perfil de usuario beneficiado, el ámbito, la propuesta y las alternativas consideradas; incluye criterios de aceptación verificables. Explica qué parte del roadmap o HU se ve afectada, si la conoces.

Las funcionalidades nuevas requieren una issue aceptada (`accepted`) por el PO o el Comité antes de abrir la PR. No se exige aceptación previa para bugs y cambios de documentación. Aun así, recomendamos acordar cambios que puedan duplicar trabajo existente o alterar un contrato público. No asumas que toda propuesta se incorporará.

### Clasificación y seguimiento

| Etiqueta           | Finalidad                                           |
| ------------------ | --------------------------------------------------- |
| `bug`              | Error reproducible.                                 |
| `enhancement`      | Propuesta de mejora o funcionalidad.                |
| `documentation`    | Mejora de documentación.                            |
| `good first issue` | Tarea pequeña y acotada para nuevos contribuidores. |
| `accepted`         | Funcionalidad aceptada para su desarrollo.          |
| `needs-decision`   | Decisión que requiere intervención del Comité.      |
| `decision`         | Registro de una decisión.                           |
| `security-block`   | Bloqueo justificado por seguridad o privacidad.     |

Las cuatro últimas etiquetas forman parte de la propuesta de gobernanza; el equipo las habilitará antes del lanzamiento. El maintainer de _triage_ (rotación semanal) clasifica y deriva las issues, solicita información, identifica duplicados y mantiene su estado. El objetivo acordado en la propuesta de gobernanza es una primera respuesta en un máximo de cinco días hábiles, no la resolución en ese plazo.

Las incidencias de GitHub se refieren al software. No uses una issue para publicar acusaciones contra una web o evidencias de navegación de personas reales.

### Seguridad y privacidad

No abras una issue pública con una vulnerabilidad explotable, credenciales, datos personales, capturas sin anonimizar o detalles que faciliten abusos contra la plataforma.

Si está habilitada la opción de notificación privada de vulnerabilidades en la pestaña Security de GitHub, también puede utilizarse. Mientras no haya canal operativo, solicita un medio privado a los mantenedores sin revelar el hallazgo en público. Describe el impacto y la versión afectada usando una reproducción mínima con datos sintéticos. No pruebes contra cuentas, infraestructura o datos ajenos sin autorización. Para denuncias de conducta utiliza el canal específico del [Código de conducta](CODE_OF_CONDUCT.md).

## 3. Ramas y flujo Git

`main` es la rama de integración. No trabajes directamente en ella. Si tienes permisos de escritura, crea una rama en el repositorio; si no, crea primero un fork en GitHub y clónalo. Mantén una rama por tarea o conjunto pequeño de cambios relacionados.

Ejemplo para una persona externa (sustituye `TU_USUARIO` por tu nombre de GitHub):

```sh
git clone https://github.com/TU_USUARIO/dark-shield-app.git
cd dark-shield-app
git remote add upstream https://github.com/DarkShieldApp/dark-shield-app.git
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c docs/guia-almacenamiento
npm ci
```

Si eres miembro del equipo y trabajas sin fork, clona el repositorio oficial, omite `git remote add upstream` y utiliza `origin` en lugar de `upstream` para sincronizar.

### Convención de nombres

Se propone una convención consistente con los prefijos utilizados en el proyecto:

| Prefijo     | Uso                                 | Ejemplo                          |
| ----------- | ----------------------------------- | -------------------------------- |
| `feat/`     | Funcionalidad                       | `feat/hu-17-consulta-extension`  |
| `fix/`      | Corrección                          | `fix/42-formulario-duplicado`    |
| `docs/`     | Documentación                       | `docs/guia-almacenamiento`       |
| `test/`     | Pruebas                             | `test/hu-01-consulta`            |
| `refactor/` | Reorganización sin cambio funcional | `refactor/report-summary`        |
| `chore/`    | Mantenimiento                       | `chore/actualizar-configuracion` |
| `ci/`       | Integración continua                | `ci/revisar-workflow`            |

Utiliza minúsculas, guiones, nombres descriptivos y, cuando exista, el identificador real de issue o HU/subtarea. Los números de los ejemplos no identifican una issue real. Antes de abrir la PR, sincroniza tu rama con `upstream/main` (o `origin/main`):

```sh
git fetch upstream
git merge upstream/main
```

Resuelve los conflictos, vuelve a ejecutar las comprobaciones y evita reescribir historial compartido o hacer push forzado. No mezcles funcionalidades no relacionadas.

## 4. Commits

Haz commits pequeños, coherentes y fáciles de revisar; comprueba el diff antes de subirlos. Se propone adoptar [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) como convención: `tipo(ámbito): descripción breve`. El ámbito es opcional; usa un verbo que explique el cambio. Añade el motivo y las consecuencias en el cuerpo si la descripción no basta. Mantén la referencia HU/tarea o issue real cuando exista.

```text
feat(hu17): añadir estado inicial de consulta
fix(web): eliminar formulario de reporte duplicado
docs(storage): registrar decisión de almacenamiento
test(reports): cubrir consulta sin resultados
ci: comprobar pruebas de base de datos
```

No incluyas ficheros generados, dependencias instaladas, coberturas ni `.env`. Evita `git add .` sin inspeccionar el contenido. Un ejemplo de trabajo documental:

```sh
git status
git diff
git add docs/adr/0005-evidence-storage.md
git diff --cached
git commit -m "docs(storage): registrar decisión de almacenamiento"
git push -u origin docs/guia-almacenamiento
```

## 5. Estándares técnicos y validación

- Mantén TypeScript estricto, ESLint y Prettier; reutiliza las utilidades existentes y respeta la separación entre cliente, servidor y persistencia.
- Conserva el contrato HTTP, los controles de permisos, RLS y las validaciones. No uses clientes privilegiados como atajo. Cualquier migración debe versionarse; añade nuevas migraciones en vez de reescribir las ya aplicadas.
- Usa datos de prueba sintéticos y añade pruebas de los casos normales, límites y errores relevantes. No reduzcas el ámbito de cobertura para superar un umbral.
- Documenta cambios de API o decisiones arquitectónicas con sus contratos o ADR. Justifica nuevas dependencias y revisa licencias, seguridad y el lockfile único.
- Si utilizas IA para ayudarte, revisa y comprende el resultado; no envíes secretos, datos personales o código excluido a servicios externos. La responsabilidad de la contribución y su procedencia sigue siendo de quien la presenta.

Desde la raíz, antes de enviar cambios de código:

```sh
npm run format:check
npm run check
npm test
npm run test:coverage
```

Si modificas persistencia, permisos, Auth, Storage o flujos afectados por ellos, ejecuta además las comprobaciones aplicables con tu instancia Supabase local:

```sh
npm run supabase:start
npm run test:db
npm run test:assessments:e2e --workspace @darkshield/web
npm run supabase:stop
```

Aplica las migraciones pendientes si reutilizas una instancia. La configuración del E2E se describe en [API de valoraciones](docs/api/assessments.md) y en el script `web/scripts/test-assessments-e2e.mjs`. No ejecutes estas pruebas sobre un entorno compartido o de producción. Si solo modificas documentación, comprueba los enlaces, los ejemplos y el formato; explica qué pruebas no aplican. CI debe pasar igualmente.

## 6. Pull Requests (PR)

### Apertura

1. Abre una PR hacia `main` desde tu rama. Desde un fork, verifica que el repositorio base es `DarkShieldApp/dark-shield-app`.
2. Usa un título descriptivo; si pertenece a una tarea académica, incluye su referencia (por ejemplo, `HU-01/T5`). Para un trabajo externo, enlaza la issue real.
3. Completa la [plantilla existente](.github/pull_request_template.md): descripción, ámbito, tipo de cambio, pruebas realizadas, checklist e issue relacionada. Especifica qué se modifica y por qué, comandos/escenarios y resultados. Para cambios visuales añade capturas sin información real. Marca únicamente lo que hayas comprobado y justifica lo que no aplique.
4. Usa `Closes #N` si la PR resuelve por completo la issue real número N y `Refs #N` si solo está relacionada o resuelve una parte. Si procede, referencia la HU y subtarea para conservar trazabilidad.
5. Mantén la PR acotada, revisable en una sesión. Si aún no está lista, ábrela como Draft y solicita feedback; márcala lista cuando esté preparada.

### Revisión y aceptación

Se aplicará la propuesta del Equipo D en [gobernanza y sostenibilidad](docs/open-source/governance-and-sustainability.md). La configuración efectiva de protección de rama y CODEOWNERS corresponde a los maintainers/Equipo B; no se presupone que todas las reglas estén automatizadas.

- Una PR ordinaria necesita al menos una aprobación independiente del maintainer correspondiente. Se necesitan **dos aprobaciones** para migraciones, RLS, permisos, autorización/sesión, credibilidad, dependencias nuevas, CI y tratamiento de evidencias o datos personales; también para los cambios de las áreas de BD y CI/infraestructura según la matriz de gobernanza. Para BD, al menos una debe proceder de un maintainer del área.
- El PO verifica los criterios de aceptación de las funcionalidades nuevas. Las decisiones transversales o desacuerdos se escalan al Comité según gobernanza.
- CI en verde (`check` y `database`, incluidas cobertura, pgTAP y E2E). La cobertura V8 exige al menos 80 % por archivo en líneas, ramas, funciones y sentencias del ámbito medido, definido en `web/vitest.config.ts`. Añade pruebas del cambio y actualiza dicho ámbito cuando se incorpore lógica que deba medirse.
- No se fusiona con conflictos, cambios solicitados sin resolver, problemas de seguridad pendientes, secretos, datos reales o documentación desactualizada por el propio cambio. No se desactiva la CI para obtener una aprobación.
- Una primera PR externa puede necesitar autorización de un maintainer para ejecutar workflows. El responsable de triage realizará el seguimiento (objetivo: cinco días hábiles para la primera respuesta).
- La persona autora responde a observaciones, actualiza la misma rama y solicita otra revisión cuando proceda. El feedback se centra en el cambio, no en la persona.

**Nadie fusiona su propia PR.** El último maintainer que la aprueba la fusiona mediante _squash merge_ cuando cumple la DoD, las revisiones y las comprobaciones exigidas. El título del squash debe conservar la trazabilidad; se elimina la rama de trabajo cuando ya no sea necesaria. Si una PR se rechaza o aplaza, se documentará el motivo. Los bloqueos de seguridad solo los puede levantar el Comité conforme a la gobernanza.

## 7. Licencia de las contribuciones

Aporta solo material que tengas derecho a licenciar. Identifica el código de terceros, su licencia y avisos; no cambies su licencia ni elimines atribuciones. Los cambios que requieran otra licencia se revisarán antes de aceptarlos. No se exige por esta guía un CLA o un DCO adicional.
