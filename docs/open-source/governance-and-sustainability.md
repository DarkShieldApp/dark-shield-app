# Gobernanza y sostenibilidad — Dark-Shield

| Campo       | Valor                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Práctica    | P9 — Preparación del proyecto para Open Source                                                                                   |
| Equipo      | D — Gobernanza y sostenibilidad                                                                                                  |
| Integrantes | Ignacio Jose Garcia Garcia (secciones 1–3) · Mario Merino Zapata (secciones 4–6)                                                                |
| Fecha       | 24/11/2026                                                                                                                       |
| Estado      | Secciones 1–3: **listas para la puesta en común** · Secciones 4–6: **borrador pendiente de revisión de Mario**                   |
| Base        | `main` al cierre del Sprint 1 (`439681e`), acuerdo de trabajo de P6 e informe de cierre `docs/qa/informe-seguimiento-sprint1.md` |

## 1. Modelo de gobernanza

**Decisión: modelo híbrido formado por _maintainers_ por área y un Comité de Dirección (_Steering Committee_) de 3 personas.**

| Órgano                  | Qué decide                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Maintainers de área** | Decisiones técnicas del día a día de su área: revisión y fusión de PR, diseño interno y deuda técnica.                                                                                     |
| **Comité de Dirección** | Roadmap y releases, alta y baja de maintainers, decisiones que afectan a varias áreas, política de moderación y privacidad, cambios en esta gobernanza, y última instancia en desacuerdos. |

**Composición inicial del Comité** (número impar para que no haya empates):

1. **Iván Pedraza Díez**, por su papel de PO: visión de producto y Product Backlog.
2. **Sergio Fernández López**, por su papel de SM: facilitación y proceso.
3. **Un maintainer del área de base de datos y seguridad**, elegido por los maintainers. Proponemos a **Jorge García Galeote**, responsable de HU-14 (roles y permisos).

El mandato dura hasta la release 1.0 o 6 meses, lo que ocurra antes; después, los maintainers votan la renovación. **Cuando haya al menos 2 maintainers externos activos, el Comité pasará a 5 miembros con al menos un puesto externo.** Así se evita que el proyecto sea un «club cerrado» del grupo de clase.

**Transparencia:** la gobernanza se publica en `GOVERNANCE.md` y la lista de maintainers en `MAINTAINERS.md`. Las decisiones se registran en GitHub: en issues con la etiqueta `decision` o, si son de arquitectura, como ADR en `docs/adr/`. Discord y ClickUp pueden seguir usándose para la coordinación interna, pero **ninguna decisión vinculante se toma solo allí**. Es la regla de P6 («las decisiones quedan registradas en ClickUp») trasladada a un espacio público.

**Justificación frente a las alternativas:**

| Modelo                           | Valoración para Dark-Shield                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BDFL                             | ❌ No hay un fundador único: las 8 HU del Sprint 1 tuvieron responsables distintos. Concentraría el _bus factor_ en la persona que decide y contradice la propiedad colectiva acordada en P6.                                                 |
| Comité puro (los 8 deciden todo) | ❌ Sería lento: con 8 estudiantes a tiempo parcial, cada decisión necesitaría quórum. Además deja fuera a los contribuidores externos.                                                                                                        |
| Do-ocracia sin estructura        | ❌ Es arriesgada en un proyecto que publica acusaciones sobre webs y trata datos personales: alguien tiene que poder decir «no» y responder de ello.                                                                                          |
| **Híbrido (elegido)**            | ✅ Las decisiones técnicas las toma quien conoce el área, así que son rápidas. Las de producto, seguridad y privacidad las toma un órgano pequeño y estable. Reutiliza lo que ya funciona: los roles PO y SM, y la matriz de revisores de P4. |

---

## 2. Quién revisa y acepta cambios

### Roles

| Rol                      | Puede                                                             | Cómo se llega                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Contribuidor             | Abrir issues y PR, comentar y revisar sin voto vinculante         | Cualquier persona que acepte el Code of Conduct                                                                                              |
| Maintainer de área       | Aprobar y fusionar PR de su área y etiquetar issues               | Al menos 5 PR fusionadas en el área durante 2 meses, propuesta de un maintainer y consenso perezoso de 7 días entre los maintainers del área |
| Comité de Dirección      | Lo indicado en la sección 1                                       | Sección 1                                                                                                                                    |
| Owner de la organización | Gestionar la configuración de GitHub y de Supabase y los secretos | Al menos 2 personas del Comité (véase la sección 5, R2)                                                                                      |

### Áreas y maintainers iniciales (`.github/CODEOWNERS`)

La asignación parte de la responsabilidad de cada persona en P4 y de la autoría real en el Sprint 1. **Cada área tiene como mínimo 2 maintainers.**

| Área                      | Rutas                                                                       | Maintainers iniciales                                              | Aprobaciones necesarias                              |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Base de datos y seguridad | `supabase/`                                                                 | Jorge García Galeote, Ignacio José García García                   | **2**, al menos una de un maintainer del área        |
| Backend y API             | `web/src/server/`, `web/src/app/api/`                                       | Mario Polaino Blanco, Ildefonso A. Ruiz Beltrán, Iván Pedraza Díez | 1; **2** si toca autorización, sesión o credibilidad |
| Interfaz web              | `web/src/app/` (salvo `api/`), `web/src/lib/`                               | Sergio Fernández López, Gregorio Merchán Merchán                   | 1                                                    |
| Extensión                 | `extension/`                                                                | **Sin asignar: hacen falta 2 voluntarios antes de publicar**       | 1                                                    |
| CI, dependencias e infra  | `.github/`, `package.json`, `package-lock.json`, `sonar-project.properties` | Mario Merino Zapata y un miembro del Comité                        | **2**                                                |
| Documentación             | `docs/`, `*.md`                                                             | Cualquier maintainer                                               | 1                                                    |

### Reglas de aceptación

1. **Nadie fusiona su propia PR.** La fusiona el último maintainer que la aprueba. Corrige directamente la OBS-04.
2. **`main` protegida por configuración, no solo por acuerdo:** PR obligatoria, CI obligatorio (`check`, `test:coverage` y `test:db`), aprobación de CODEOWNERS, _squash merge_ y sin _push_ forzado. El Equipo B lo configura.
3. **Se exigen 2 aprobaciones** en los cambios con impacto de seguridad o privacidad: migraciones, RLS y permisos; autorización y sesión; el algoritmo de credibilidad; dependencias nuevas; _workflows_ de CI; y el tratamiento de evidencias o datos personales.
4. **Las funcionalidades nuevas necesitan una issue aceptada antes de la PR.** Una nueva HU o un cambio en las reglas de credibilidad o de moderación requiere una issue con la etiqueta `accepted`, que pone el PO o el Comité. Así un contribuidor externo no invierte trabajo en algo que luego se rechazará. Los bugs y la documentación no lo necesitan.
5. **Criterio de aceptación:** la DoD de P6 adaptada a un proyecto abierto. CI en verde, cobertura de al menos el 80 % por archivo, pruebas del cambio, documentación actualizada en la misma PR, ningún secreto ni dato personal real, y la plantilla de PR completa. La validación de los criterios de aceptación por el PO solo se mantiene para las funcionalidades.
6. **Las PR externas** necesitan la aprobación de un maintainer para ejecutar los _workflows_ la primera vez que contribuye una persona (ajuste de GitHub para contribuidores nuevos), porque el CI levanta Supabase con Docker. Primera respuesta en un máximo de **5 días hábiles**, con un maintainer de _triage_ que rota cada semana.
7. **Releases:** las decide el Comité y se publican con _tag_ y _changelog_, en línea con la práctica XP de _Small Releases_ de P6.

---

## 3. Resolución de desacuerdos

Los desacuerdos se resuelven de forma **asíncrona y pública**, con argumentos técnicos, y la decisión queda documentada. Se sigue la escalera de P6 (alternativas, prototipo y facilitación), adaptada a personas que no coinciden en una reunión diaria.

| Nivel           | Quién                | Cómo                                                                                                                                                                                                           | Plazo máximo    |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1. Conversación | Autor y revisor      | En la propia PR o issue, cada parte expone su alternativa, sus ventajas, sus inconvenientes y sus riesgos. Si hace falta, se hace un prototipo o _spike_.                                                      | 5 días hábiles  |
| 2. Área         | Maintainers del área | **Consenso perezoso:** una propuesta escrita se adopta si nadie la objeta con argumentos en 72 h.                                                                                                              | 72 h            |
| 3. Comité       | Comité de Dirección  | Se pone la etiqueta `needs-decision` y cada parte resume su postura en un comentario. Se vota por mayoría simple. Un miembro implicado en el desacuerdo se abstiene y le sustituye un maintainer no implicado. | 10 días hábiles |

**Reglas complementarias:**

- **Bloqueo de seguridad:** un maintainer de base de datos y seguridad puede bloquear una PR con una objeción justificada de seguridad o privacidad. Solo el Comité puede levantar el bloqueo, y debe documentar el riesgo que acepta. El Sprint 1 ya dejó tres fallos de RLS o permisos que las pruebas no detectaron (OBS-01, OBS-05 y OBS-06).
- **Producto frente a técnica:** si el desacuerdo afecta al alcance, a los requisitos o al valor del producto, el PO hace la propuesta y el Comité decide. En P6, el PO ya intervenía en estas decisiones.
- **Si no hay decisión en plazo, se mantiene el estado actual** y no se fusiona nada. Ante la duda en un proyecto sensible, no se cambia nada.
- **Registro:** toda decisión de nivel 3 se cierra con un comentario con la etiqueta `decision` o con un ADR. Solo se reabre si aparece información nueva (datos, una incidencia o un cambio de contexto).
- **Conflictos personales o de conducta:** no siguen esta escalera. Se gestionan con el Code of Conduct (Equipo C) y los atiende el Comité sin los miembros implicados.

**Ejemplo con un caso real (OBS-02):** el nivel mínimo de confianza para valorar reportes sigue sin aprobarse (`minimum_trust_level = NULL`). Afecta a producto y a seguridad, así que va directamente al nivel 3: el PO propone un valor, el Comité decide y la decisión queda en un ADR. Hoy esta cuestión está abierta en una conversación interna que nadie externo puede consultar.

---
## 4. ¿Qué ocurre si abandona un desarrollador principal?

_Análisis por área del impacto de la salida de la persona que más conoce cada parte:_

| Área                                     | Qué pasaría                                                                                                         | Qué lo amortigua hoy                                                    | Qué falta                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| _Base de datos y seguridad_              | _Nadie se atreve a tocar las migraciones ni las RLS, y los cambios se paran o se hacen sin entenderlos._            | _22 suites pgTAP con 1015 aserciones y 'docs/domain-design.md'._        | _Una segunda persona que domine las políticas RLS y el modelo de permisos._   |
| _Credibilidad y valoraciones (HU-08/09)_ | _La regla central del producto queda sin dueño y aparecen cambios que alteran resultados sin que se note._          | _921 tests de Vitest con un 99 % de cobertura de líneas y 'docs/api/'._ | _Un ADR que explique por qué la fórmula es la que es, no solo cómo funciona._ |
| _Extensión_                              | _El área se queda sin nadie. Hoy el impacto es bajo porque solo existe el popup, pero será alto cuando crezca._     | _Su tamaño mínimo._                                                     | _Dos maintainers (sección 2)._                                                |
| _Administración de cuentas_              | _Nadie puede cambiar ajustes de la organización 'DarkShieldApp' ni gestionar el proyecto Supabase._ 		 | _Nada documentado._                                                     | _Saber quiénes son hoy los owners y que haya al menos dos._                   |

_**Conclusión:** la salida de **una** persona es asumible. Las pruebas y la documentación permiten retomar el trabajo, y la simulación de P6 (la ausencia de Mario Polaino) mostró que reasignar tareas funciona en pocos días. Lo que **no** es asumible es perder la única cuenta con permisos de administración o que se marche **todo el equipo** al terminar la asignatura._

## 5. Riesgos de continuidad 

| #    | Riesgo                                                                                                | Prob. / Impacto | Señal de alerta                                                                                     | Mitigación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Responsable propuesto |
| ---- | ----------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| _R1_ | _Abandono colectivo al terminar la asignatura_                                                        | _Alta / Alta_   | _30 días sin commits en 'main'_                                                                     | _Antes de publicar, al menos 2 maintainers se comprometen por escrito a seguir, con un tiempo semanal acotado. El README indica el estado del proyecto (activo o en mantenimiento). Tras 6 meses sin maintainers se abre una issue pública buscando relevo y, si nadie lo asume, se archiva el repositorio indicándolo. Se ofrece como tema de TFG o para futuras ediciones de la asignatura._                                                                                                                                         | _Comité_              |
| _R2_ | _Concentración de conocimiento y de accesos (bus factor)_                                             | _Media / Alta_  | _Un área con un solo revisor activo, o más del 50 % de los commits del trimestre en 1 o 2 personas_ | _Al menos 2 owners en la organización de GitHub y en Supabase, con 2FA obligatorio. Credenciales en un gestor compartido y nunca en Discord. Mínimo 2 maintainers por área y revisores rotatorios. ADR para cada decisión no obvia._                                                                                                                                                                                                                                                                                                   | _Comité y Equipo B_   |
| _R3_ | _Coste y carga de operar una instancia pública (infraestructura, moderación y reclamaciones legales)_ | _Media / Alta_  | _Más del 80 % del almacenamiento gratuito usado, o reportes sin moderar durante más de 7 días_      | _El plan gratuito de Supabase pausa los proyectos tras 1 semana sin actividad y solo incluye 1 GB de almacenamiento de archivos, que las evidencias en imagen agotarán. El plan Pro empieza en 25 $/mes. Medidas: separar el código abierto de la instancia operada; documentar el *self-hosting* con Supabase local; resolver los límites y la limpieza de subidas (OBS-18); definir una política de moderación y un canal de retirada antes de abrir una instancia pública (hoy la moderación se hace a mano desde Studio, OBS-08)._ | _Comité_              |

## 6. Modelo de sostenibilidad

_**Propuesta: modelo comunitario con financiación transparente (donaciones y patrocinios a través de Open Collective) y una vía académica e institucional. Se descarta el Open Core.**_

| Opción                         | Valoración                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Open Core_                    | _❌ El valor de Dark-Shield es que la credibilidad sea transparente. Cerrar módulos como la credibilidad o la moderación destruiría esa confianza, y además no hay un cliente que pague por ellos._                                                                                               |
| _Servicios o consultoría_      | _❌ Por ahora no: falta capacidad. Además, cobrar a empresas por auditar sus webs crea un **conflicto de interés** con la publicación de reportes sobre esas mismas webs._                                                                                                                        |
| _Patrocinio corporativo_       | _⚠️ Solo con una política pública de conflicto de interés: el patrocinador no influye en los reportes ni en la moderación, y si es reportado, lo gestionan moderadores sin relación con él._                                                                                                      |
| _Donaciones (Open Collective)_ | _✅ Los gastos son públicos, algo coherente con un proyecto de transparencia. Cubren lo imprescindible: el plan Pro de Supabase (≈300 $/año) y el dominio._                                                                                                                                       |
| _Académica e institucional_    | _✅ La UMA puede aportar TFG, prácticas y futuras ediciones de la asignatura, que son una fuente estable de contribuidores. Las asociaciones de consumidores pueden colaborar en la moderación y el contenido. También hay convocatorias de financiación de software libre o de interés público._ |

_**Fases:** (1) Primera publicación: coste cero. Se publica solo el código, con una demo en el plan gratuito y sin instancia pública abierta. (2) Cuando haya usuarios reales, Open Collective financia el plan Pro. (3) A medio plazo, se buscan colaboraciones institucionales y convocatorias. La sostenibilidad depende más de tener **personas** (R1) que dinero: el coste mínimo es bajo._

---

## Acciones pendientes

| Acción                                                                                                     | Momento               | Responsable | Coordina con |
| ---------------------------------------------------------------------------------------------------------- | --------------------- | ----------- | ------------ |
| Publicar `GOVERNANCE.md` y `MAINTAINERS.md` a partir de las secciones 1 y 2                                | Antes de publicar     | Equipo D    | —            |
| Crear `.github/CODEOWNERS` con las áreas de la sección 2                                                   | Antes de publicar     | Equipo D    | Equipo B     |
| Proteger `main` (CI obligatorio, aprobación de CODEOWNERS, _squash_, sin fusión propia)                    | Antes de publicar     | Equipo B    | Equipo D     |
| Crear las etiquetas `accepted`, `needs-decision`, `decision` y `security-block`                            | Antes de publicar     | Equipo C    | Equipo D     |
| Asignar 2 maintainers a `extension/`                                                                       | Antes de publicar     | Comité      | —            |
| Llevar a issues públicas o ADR las decisiones abiertas que hoy están en ClickUp o Discord (p. ej., OBS-02) | Primera publicación   | PO          | —            |
| _Comprobar quiénes son los owners de GitHub y Supabase y que haya al menos dos (propuesta)_                | _Antes de publicar_   | _Comité_    | _Equipo B_   |
| _Recoger el compromiso escrito de los maintainers que seguirán tras la asignatura (propuesta)_             | _Antes de publicar_   | _Comité_    | _Equipo A_   |
| _Abrir Open Collective cuando exista una instancia pública (propuesta)_                                    | _Después de publicar_ | _Comité_    | —            |
