# Informe de seguimiento y cierre del Sprint 1 (T-CTRL-04)

| Campo                  | Valor                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarea de control       | T-CTRL-04 — Consolidar HU completadas y elaborar el informe                                                                                                                                                    |
| Estado                 | **Completada**. La tarea se completa con este informe, a petición del PO; la revisión de Gregorio Merchán queda registrada en la PR                                                                            |
| Periodo                | Sprint 1, 9–22/11/2026                                                                                                                                                                                         |
| Fecha y hora           | 22/11/2026, 13:06 (CET, UTC+1). Medición iniciada a las 12:54 del mismo día                                                                                                                                    |
| Commit medido          | `439681e` (`main`, último commit del Sprint: HU-08/T5, PR #43)                                                                                                                                                 |
| Entorno                | Node.js 24.22.1, npm 11.19.1, Supabase CLI 3.1.0, Docker 28.4.0, Windows 10 Pro                                                                                                                                |
| Responsable            | Iván Pedraza Díez                                                                                                                                                                                              |
| Revisor                | Gregorio Merchán Merchán                                                                                                                                                                                       |
| Fuentes                | Repositorio (`git log origin/main`), PR fusionadas y revisiones (`gh pr list`), ejecuciones de GitHub Actions (`gh run list`), ejecución local y actas de las reuniones diarias (`reuniones/transcripciones/`) |
| Exportación de ClickUp | **No disponible** (no se aportó el CSV). Las horas y las discrepancias de estado quedan como «No disponible» (P5, § 4.2)                                                                                       |

Las cifras de las secciones 2, 3 y 6 proceden de la verificación del repositorio y de una ejecución
local sobre el commit indicado. El estado del CI procede de GitHub Actions. No se ha consultado
ni modificado ningún dato remoto de Supabase.

## 1. Resumen ejecutivo

| Indicador                       | Valor                         | Estado   |
| ------------------------------- | ----------------------------- | -------- |
| % HUC                           | **8/8 = 100 %**               | 🟢 Verde |
| Subtareas de HU con entregable  | 43/43                         | —        |
| Tareas de control con documento | 2/4 (T-CTRL-02 parcial)       | —        |
| Observaciones para el Sprint 2  | 21 (4 Alta, 10 Media, 7 Baja) | —        |
| Vitest y cobertura V8           | 921 tests, 99,29 % líneas     | 🟢 Verde |
| pgTAP                           | 22 suites, 1015 aserciones    | PASS     |
| CI de `main` (últimos 5 runs)   | 5/5 correctos                 | 🟢 Verde |

> **Aceptación por decisión del PO (22/11/2026).** Las ocho HU comprometidas se dan por completadas
> y aceptadas en el cierre del Sprint por decisión del Product Owner: toda subtarea con entregable
> en `main` (PR o commit) cuenta como completada, y una HU con todas sus subtareas completadas
> cuenta como completada y aceptada. Los problemas detectados al revisar cómo está hecha cada tarea
> **no cambian su estado**; se registran como observaciones para el Sprint 2 (sección 8). Se deja
> constancia para mantener la trazabilidad exigida en P5 y P6.

**Hitos del Sprint** (última PR fusionada de cada HU): HU-14, HU-05 y HU-10 el 19/11; HU-06, HU-01 y
HU-09 el 20/11; HU-11 y HU-08 el 21/11. T-CTRL-02 (semana 1) el 13/11.

**Conclusiones:**

1. El alcance comprometido está integrado en `main`: 43 subtareas con entregable y CI en verde.
2. Hay tres funcionalidades que **no operan contra una base de datos real** aunque sus pruebas pasan:
   la creación de reportes (HU-05, sin permiso de inserción; demostrado en local), las valoraciones
   (HU-08, mínimo de confianza sin aprobar) y la pantalla de perfil (HU-10, datos de ejemplo). Son
   las prioridades del Sprint 2.
3. La revisión independiente apenas está registrada en GitHub (3 aprobaciones en 43 PR) y `main` no
   está protegida.
4. Dos tareas de control (T-CTRL-01 y T-CTRL-03) y la semana 2 de T-CTRL-02 no tienen documento en el
   repositorio, por lo que TB, DEE y Cycle Time quedan «No disponibles».
5. La cobertura es alta, pero su ámbito deja fuera varias rutas y componentes con lógica.

## 2. Porcentaje de HU completadas (% HUC)

| HU    | Responsable o coordinación (P4)  | Revisor (P4)               | Subtareas | Estado     | Observaciones                  |
| ----- | -------------------------------- | -------------------------- | :-------: | ---------- | ------------------------------ |
| HU-14 | Jorge García Galeote             | Mario Polaino Blanco       |    3/3    | Completada | 0                              |
| HU-11 | Ildefonso Alejandro Ruiz Beltran | Mario Merino Zapata        |    4/4    | Completada | 1 (OBS-16)                     |
| HU-05 | Sergio Fernández López           | Jorge García Galeote       |    6/6    | Completada | 5 (OBS-01, 05, 10, 16, 17)     |
| HU-06 | Ignacio José García García       | Iván Pedraza Díez          |    6/6    | Completada | 6 (OBS-06, 07, 08, 15, 17, 18) |
| HU-10 | Gregorio Merchán Merchán         | Ildefonso A. Ruiz Beltran  |    3/3    | Completada | 2 (OBS-03, 19)                 |
| HU-01 | Iván Pedraza Díez                | Ignacio José García García |    9/9    | Completada | 1 (OBS-10)                     |
| HU-08 | Mario Polaino Blanco             | Sergio Fernández López     |    9/9    | Completada | 5 (OBS-02, 09, 16, 19, 20)     |
| HU-09 | Iván Pedraza Díez                | Gregorio Merchán Merchán   |    3/3    | Completada | 1 (OBS-02)                     |
|       | **Total**                        |                            | **43/43** | **8/8**    |                                |

Las observaciones transversales (OBS-04, 11, 12, 13, 14, 21) no se asocian a una HU concreta.

$$\text{\% HUC} = \frac{\text{HU completadas y aceptadas}}{\text{HU comprometidas al inicio}} \times 100 = \frac{8}{8} \times 100 = 100\ \%$$

- **Denominador:** las 8 HU comprometidas al inicio del Sprint (HU-14, HU-11, HU-05, HU-06, HU-10,
  HU-01, HU-08 y HU-09). No se ha modificado.
- **Numerador:** 8 HU con todas sus subtareas completadas y aceptadas por decisión del PO.
- **Umbrales (P5):** verde ≥ 90 %; amarillo de 75 % a menos de 90 %; rojo < 75 %. **Resultado: 🟢 verde.**

## 3. Estado por HU y subtarea

Todas las subtareas se han comprobado en `main` (`439681e`). Los commits sin `(#N)` en el mensaje
se fusionaron por _rebase_; la PR correspondiente se indica entre paréntesis.

| HU    | Subtarea | Responsable (P4) | Estado     | Entregable en `main`                                                                                                                    | Observación        |
| ----- | -------- | ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| HU-14 | T1       | Jorge García     | Completada | `e85e927` (PR #1)                                                                                                                       | —                  |
| HU-14 | T2       | Jorge García     | Completada | `0ec06e4` (PR #3)                                                                                                                       | —                  |
| HU-14 | T3       | Jorge García     | Completada | `d6f9fd9` (PR #24)                                                                                                                      | —                  |
| HU-11 | T1       | Ildefonso Ruiz   | Completada | PR #26 (`59756ec`): acceso con Supabase                                                                                                 | —                  |
| HU-11 | T2       | Ildefonso Ruiz   | Completada | PR #26: enlace de acceso y _callback_                                                                                                   | —                  |
| HU-11 | T3       | Ildefonso Ruiz   | Completada | PR #26: sesión persistente y cierre                                                                                                     | OBS-16             |
| HU-11 | T4       | Ildefonso Ruiz   | Completada | PR #26: `CollaboratorGuard` y protección de rutas                                                                                       | OBS-16             |
| HU-05 | T1       | Sergio Fernández | Completada | PR #11 (`fadfb12`)                                                                                                                      | OBS-10             |
| HU-05 | T2       | Sergio Fernández | Completada | PR #15 (`47fb883`)                                                                                                                      | —                  |
| HU-05 | T3       | Sergio Fernández | Completada | PR #16 (`fa89385`)                                                                                                                      | OBS-01, 05, 17     |
| HU-05 | T4       | Gregorio Merchán | Completada | PR #10 (`c6602ae`)                                                                                                                      | OBS-01             |
| HU-05 | T5       | Mario Merino     | Completada | PR #9 (`aab7916`)                                                                                                                       | —                  |
| HU-05 | T6       | Sergio Fernández | Completada | PR #19 (`38a18b7`)                                                                                                                      | OBS-16             |
| HU-06 | T1       | Ildefonso Ruiz   | Completada | Decisión de almacenamiento: respuesta 5 de la PR #13, recogida en `docs/domain-design.md` § «Contrato de persistencia y API (HU-06/T4)» | OBS-15             |
| HU-06 | T2       | Mario Merino     | Completada | PR #9 (`aab7916`)                                                                                                                       | OBS-07             |
| HU-06 | T3       | Ignacio García   | Completada | PR #12 (`11a697a`) y #25 (`8c8c6c4`)                                                                                                    | —                  |
| HU-06 | T4       | Ignacio García   | Completada | PR #13 (`15433ab`), #14 (`f5e016e`), #21 (`429b2a3`) y #23 (`159dad9`); CA1 en #40 (`e46184c`)                                          | OBS-06, 08, 17, 18 |
| HU-06 | T5       | Ignacio García   | Completada | PR #36 (`38e279c`)                                                                                                                      | OBS-08             |
| HU-06 | T6       | Ignacio García   | Completada | PR #6 (`27dff0c`) y #22 (`de4e0e3`)                                                                                                     | —                  |
| HU-10 | T1       | Gregorio Merchán | Completada | PR #20 (`ca80916`)                                                                                                                      | OBS-03             |
| HU-10 | T2       | Gregorio Merchán | Completada | PR #28 (`e06c21b`)                                                                                                                      | OBS-03             |
| HU-10 | T3       | Gregorio Merchán | Completada | PR #28 (`e06c21b`)                                                                                                                      | OBS-03, 19         |
| HU-01 | T1       | Iván Pedraza     | Completada | PR #4 (`8f79121`)                                                                                                                       | —                  |
| HU-01 | T2       | Iván Pedraza     | Completada | PR #8 (`6838127`)                                                                                                                       | —                  |
| HU-01 | T3       | Iván Pedraza     | Completada | PR #27 (`266d888`)                                                                                                                      | —                  |
| HU-01 | T4       | Mario Merino     | Completada | PR #9 (`aab7916`)                                                                                                                       | OBS-10             |
| HU-01 | T5       | Iván Pedraza     | Completada | PR #18 (`594a9ac`)                                                                                                                      | —                  |
| HU-01 | T6       | Iván Pedraza     | Completada | PR #32 (`6dd06f1`)                                                                                                                      | —                  |
| HU-01 | T7       | Iván Pedraza     | Completada | PR #33 (`4f17f8b`)                                                                                                                      | —                  |
| HU-01 | T8       | Iván Pedraza     | Completada | PR #34 (`967e004`)                                                                                                                      | —                  |
| HU-01 | T9       | Mario Merino     | Completada | PR #9 (`aab7916`)                                                                                                                       | —                  |
| HU-08 | T1       | Mario Polaino    | Completada | `ec777b5` (PR #2)                                                                                                                       | OBS-20             |
| HU-08 | T2       | Mario Polaino    | Completada | `86e26ab` (PR #30)                                                                                                                      | —                  |
| HU-08 | T3       | Mario Polaino    | Completada | `c7a8e51` (PR #17)                                                                                                                      | —                  |
| HU-08 | T4       | Mario Polaino    | Completada | `25dd281` (PR #37)                                                                                                                      | OBS-02             |
| HU-08 | T5       | Mario Polaino    | Completada | PR #43 (`439681e`)                                                                                                                      | OBS-02             |
| HU-08 | T6       | Mario Polaino    | Completada | `3f2d09f` (PR #39)                                                                                                                      | —                  |
| HU-08 | T7       | Mario Polaino    | Completada | `ce69d91` (PR #38)                                                                                                                      | —                  |
| HU-08 | T8       | Mario Merino     | Completada | PR #41 (`867471d`)                                                                                                                      | OBS-09             |
| HU-08 | T9       | Mario Polaino    | Completada | `ec777b5` (PR #2): `docs/domain-design.md` § «Validación e invalidación de reportes» ¹                                                  | OBS-16, 20         |
| HU-09 | T1       | Iván Pedraza     | Completada | PR #29 (`0c967a4`)                                                                                                                      | —                  |
| HU-09 | T2       | Iván Pedraza     | Completada | PR #31 (`68399bb`)                                                                                                                      | OBS-02             |
| HU-09 | T3       | Mario Merino     | Completada | PR #35 (`c1a863b`)                                                                                                                      | —                  |

¹ En la reunión diaria del día 4 (`reuniones/transcripciones/Dia 4.pdf`), HU-08/T9 se describe como
documentar las decisiones de T1 para que todo el equipo pudiera consultarlas. Ese contenido es la
sección indicada, añadida en el mismo commit que T1.

### 3.1. Criterios de aceptación y cobertura en el código

Sin la exportación de ClickUp, los criterios proceden de `docs/domain-design.md` y de los contratos de
`docs/api/`. Lo parcial o no verificado se remite a la sección 8; la HU sigue contando como completada.

| HU    | Criterios (fuente)                                                                                                                                  | Cobertura en el código                                                                                                                                                                 | Parcial / sin verificar                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| HU-14 | Perfil 1:1 con Auth, rol principal y matriz de permisos (`domain-design.md` § Identidad, Roles y Permisos)                                          | Migraciones `20261110154948`, `20261111113011` y `20261119104009`; suites pgTAP `profiles_*`, `roles_*` y `permissions_*`; API `docs/api/authorization.md`                             | —                                                                                                           |
| HU-11 | Acceso, sesión persistente y protección de rutas de colaborador (`architecture.md`, ADR-0004)                                                       | `login/page.tsx`, `AuthProvider`, `CollaboratorGuard` (consulta `/api/me/profile`), `api/auth/sign-in`; tests `collaborator-access`, `password-auth`, `username-*`                     | Docs desactualizadas (OBS-16)                                                                               |
| HU-05 | Crear un reporte con sesión, perfil activo y validación (`docs/api/reports.md` §§ 1–5)                                                              | Formulario (`ReportForm.tsx`, envía Bearer), validación compartida y `POST /api/reports`; tests `report-validation`, `reports-api` con SDK simulado                                    | **La inserción falla contra una BD real** (OBS-01); permiso `reports.create` sin comprobar (OBS-05)         |
| HU-06 | Aportar evidencias PNG/JPEG/WebP ≤ 10 MiB, sin metadatos, con permiso `evidences.add` y recálculo de credibilidad (`domain-design.md` § Evidencias) | `rules.ts`, `selection.ts`, `upload.ts`, `server/evidences.ts` (recodificación con `sharp`, `evidences.add` en ambos POST desde #40), bucket privado y RLS; pgTAP `report_evidences_*` | RLS/Storage sin el permiso (OBS-06); visor y moderación (OBS-07, 08)                                        |
| HU-10 | Consultar la confianza propia y las acciones permitidas (`domain-design.md` § Escala de `trust_level`)                                              | `GET /api/me/profile`, `profile-query.ts`, `permission-actions.ts`, `profile-view.tsx`; tests `profile-*`                                                                              | La pantalla usa datos de ejemplo (OBS-03); la confianza nunca cambia (OBS-19)                               |
| HU-01 | HU01-FL-01 a FL-08 (`domain-design.md` § Reglas del flujo)                                                                                          | `GET /api/reports` (página/dominio con PSL, cursor, vacío ≠ error), `/consulta`, `ReportSummaryCard` con credibilidad y aviso; `report-query-acceptance.test.ts`                       | Detalle completo fuera del Sprint (HU-02), según la planificación; FL-08 (anti-extracción) remitido a HU-23 |
| HU-08 | Las cuatro comprobaciones de `domain-design.md` § «Comprobación del comportamiento esperado»                                                        | `POST /api/reports/{id}/assessments`, RPC transaccional, controles en el listado, recálculo de credibilidad; pgTAP de envío y concurrencia; E2E en CI                                  | Sin mínimo de confianza aprobado no se puede valorar en un entorno real (OBS-02)                            |
| HU-09 | Nivel comprensible, dinámico, no dependiente de la IA y sin `high` sin datos suficientes (`domain-design.md` § Criterios que debe cumplir)          | `server/credibility.ts` con los 23 casos TDD, `report_credibility_inputs` y desglose «Cómo se calcula» en la tarjeta                                                                   | Sin valoraciones reales (OBS-02) solo influyen las evidencias                                               |

### 3.2. Comprobaciones específicas de HU-06

- **Permiso `evidences.add` (PR #40):** confirmado. `web/src/server/evidences.ts:220` consulta
  `rpc('my_permissions')` y `:233-237` responde `403 FORBIDDEN_MISSING_PERMISSION` sin el permiso, en
  los dos `POST` (pedir URL y confirmar).
- **`GET` de evidencias:** existe (`web/src/app/api/reports/[reportId]/evidences/route.ts:27`). Ninguna
  pantalla lo usa: el único cliente, `web/src/lib/evidences/upload.ts:149`, llama a los `POST`. Es deuda
  del visor ligada a HU-02, aceptada por el PO (OBS-07).
- **Moderación:** reactiva desde Supabase Studio, según la respuesta 10 de la PR #13. No hay endpoint
  ni llamada con `'evidence_moderated'` (`docs/domain-design.md:580-582`; OBS-08).

## 4. Tareas por integrante

Esta sección describe el estado de las tareas asignadas, **no compara a las personas**: P5 prohíbe usar
las métricas con ese fin. Las horas estimadas y registradas son **No disponibles** para todos los
integrantes porque no se aportó la exportación de ClickUp. «Revisión registrada» indica si GitHub
conserva una aprobación o comentario de la persona revisora; la revisión pudo hacerse por otros
canales (OBS-04).

### 4.1. Sergio Fernández López

- **Subtareas:** HU-05/T1 (#11), T2 (#15), T3 (#16) y T6 (#19): Completadas.
- **Control:** T-CTRL-02: semana 1 completada (#5, #7); semana 2 sin documento (sección 5).
- **Revisa:** HU-08. Sin revisión registrada en las PR de HU-08.
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-01, OBS-05, OBS-09 (como revisor), OBS-11, OBS-14, OBS-16, OBS-17.

### 4.2. Mario Polaino Blanco

- **Subtareas:** HU-08/T1, T2, T3, T4, T5, T6, T7 y T9: Completadas.
- **Control:** T-CTRL-03: sin documento en el repositorio (sección 5).
- **Revisa:** HU-14. Sin revisión registrada en #1, #3 y #24.
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-02, OBS-13, OBS-16, OBS-20.

### 4.3. Iván Pedraza Díez

- **Subtareas:** HU-01/T1, T2, T3, T5, T6, T7 y T8; HU-09/T1 y T2: Completadas.
- **Control:** T-CTRL-04: **Completada** (este informe).
- **Revisa:** HU-06 (aprobación registrada en #36 y respuestas en #13) y T-CTRL-01 (sin documento que
  revisar).
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-02 y OBS-19 (decisión del PO), OBS-07 y OBS-08 (priorización del
  _Backlog_), OBS-21.

### 4.4. Mario Merino Zapata

- **Subtareas:** HU-05/T5, HU-06/T2, HU-01/T4 y T9 (#9); HU-08/T8 (#41); HU-09/T3 (#35): Completadas.
- **Revisa:** HU-11. Aprobación registrada en #26.
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-09, OBS-10.

### 4.5. Ignacio José García García

- **Subtareas:** HU-06/T3, T4, T5 y T6: Completadas (además, HU-06/CA1 en #40).
- **Revisa:** HU-01 (revisión descartada en #34 y comentarios en #8 y #9) y T-CTRL-02 (revisión comentada
  en la reunión del día 5 y correcciones en #7).
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-06, OBS-07, OBS-08, OBS-18.

### 4.6. Jorge García Galeote

- **Subtareas:** HU-14/T1, T2 y T3: Completadas. En GitHub figura con el alias `CeNtAuRoOo`.
- **Revisa:** HU-05. Sin revisión registrada en las PR de HU-05.
- **Horas:** No disponible.
- **Observaciones que le afectan:** ninguna específica (OBS-04, de proceso, afecta a todo el equipo).

### 4.7. Gregorio Merchán Merchán

- **Subtareas:** HU-05/T4 (#10); HU-10/T1 (#20), T2 y T3 (#28): Completadas.
- **Control:** T-CTRL-01: sin documento en el repositorio (sección 5).
- **Revisa:** HU-09 (sin revisión registrada; #31 la aprobó Ignacio García) y T-CTRL-04 (en la PR de
  este informe).
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-01, OBS-03, OBS-12, OBS-19.

### 4.8. Ildefonso Alejandro Ruiz Beltran

- **Subtareas:** HU-11/T1, T2, T3 y T4 (#26); HU-06/T1 (decisión en la PR #13): Completadas.
- **Revisa:** HU-10 (sin revisión registrada en #20 y #28) y T-CTRL-03 (sin documento que revisar).
- **Horas:** No disponible.
- **Observaciones que le afectan:** OBS-15, OBS-16.

## 5. Tareas de control

| Tarea     | Responsable      | Revisor          | Estado real                                                                                                                                                          | Indicadores                                                                             |
| --------- | ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| T-CTRL-01 | Gregorio Merchán | Iván Pedraza     | **Sin documento en el repositorio.** `docs/qa/` no contiene registro de bloqueos e impedimentos                                                                      | Registro de impedimentos: No disponible                                                 |
| T-CTRL-02 | Sergio Fernández | Ignacio García   | **Semana 1 completada** (`docs/qa/reporte-pruebas-metricas.md`, #5 y #7, commit `27dff0c`). **Semana 2 sin documento**: la medición prevista para el 20/11 no existe | % CPA y DDP de la semana 2: No disponibles (la sección 6 aporta la cobertura al cierre) |
| T-CTRL-03 | Mario Polaino    | Ildefonso Ruiz   | **Sin documento en el repositorio.** Necesita las horas de inicio real y de aceptación de ClickUp (reunión del día 4)                                                | TB, DEE y Cycle Time: No disponibles                                                    |
| T-CTRL-04 | Iván Pedraza     | Gregorio Merchán | **Completada** (este informe)                                                                                                                                        | % HUC = 100 %                                                                           |

Para cerrar T-CTRL-01 falta el registro de bloqueos e impedimentos del Sprint. Para T-CTRL-03 faltan
la exportación de ClickUp con horas estimadas, registradas, fecha de inicio real y fecha de aceptación,
y el documento con el cálculo. Para T-CTRL-02 falta la medición de la semana 2. Ninguna de ellas cambia
el % HUC, que solo cuenta HU.

## 6. Verificación técnica

| Comando                              | Resultado                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `npm ci`                             | Correcto: 536 paquetes; 7 avisos moderados en dependencias                 |
| `npm run check`                      | Correcto: formato, ESLint, tipos y builds de web y extensión               |
| `npm run test:coverage`              | Correcto: **29 archivos, 921 tests**, umbral del 80 % por archivo superado |
| `npm run supabase:start`             | Correcto (reutilizó un volumen local del 19/11; véase la nota)             |
| `npm run test:db`                    | Correcto: **22 suites, 1015 aserciones** (`Result: PASS`)                  |
| `npm run test:assessments:e2e` (web) | Correcto: 1 archivo, 1 test (HU-08/T8)                                     |
| `npm run supabase:stop`              | Correcto, conservando los volúmenes                                        |

**Cobertura V8 global** (40 archivos medidos, `web/coverage/coverage-summary.json`):

| Métrica    | Cubiertas/totales |    %    |
| ---------- | :---------------: | :-----: |
| Líneas     |     1131/1139     | 99,29 % |
| Sentencias |     1203/1213     | 99,17 % |
| Ramas      |     1004/1029     | 97,57 % |
| Funciones  |      205/207      | 99,03 % |

**Mínimo por archivo:** `src/app/api/reports/route.ts`, con 81,25 % en ramas (88,88 % en líneas). Le
siguen `src/components/ReportSummaryCard.tsx` y `src/lib/auth/return-path.ts` (85,71 %). Todos superan
el 80 %. El ámbito medido deja fuera varias rutas y componentes con lógica (OBS-11).

**Nota sobre pgTAP.** La primera ejecución falló (`profiles_model`, `profiles_backfill`,
`profiles_rls`, `roles_backfill`) porque la instancia local reutilizó un volumen anterior sin la
migración `20261120143700_add_profile_usernames.sql`. Tras aplicarla con `supabase migration up`, sin
reiniciar la base, pasaron las 22 suites. No es un defecto del repositorio: en un runner nuevo el CI
aplica todas las migraciones.

**Demostración de HU-05 (OBS-01).** Con Supabase local y `next dev` apuntando a él, se creó un usuario
temporal (perfil activo, rol `collaborator`, permisos `reports.create`, `evidences.add` y
`assessments.submit`). `POST /api/reports` con su Bearer y un cuerpo válido respondió
**`500 REPORT_PERSISTENCE_FAILED`**, y el `insert` directo en `public.reports` con su token respondió
**`42501 permission denied for table reports`**. El usuario se borró al terminar.

**CI (GitHub Actions).** Los cinco últimos runs de `main` son correctos. El run 44906494366
(PR #43, 21/11/2026) pasó los jobs `check` y `database`, incluidos pgTAP (`Files=22, Tests=1015`) y el
paso «Flujo E2E de validaciones HU-08/T8».

## 7. Discrepancias ClickUp ↔ repositorio

**No disponible.** Sin la exportación de ClickUp no se puede comparar el estado de cada subtarea en el
tablero con su entregable en `main`. Lo que sí se ha verificado en el repositorio:

- Las 43 subtareas tienen entregable en `main` (sección 3).
- Las autorías de las PR coinciden con las asignaciones de P4. El único alias detectado es `CeNtAuRoOo`
  (Jorge García Galeote, HU-14).
- Hay PR que agrupan varias subtareas (#9: HU-05/T5, HU-06/T2 y HU-01/T4 y T9; #26: HU-11/T1–T4; #28:
  HU-10/T2–T3) y una subtarea sin entregable propio (HU-06/T1). Conviene comprobar en ClickUp que esas
  subtareas están cerradas (OBS-21).

## 8. Observaciones para el Sprint 2

Ninguna de estas observaciones cambia el estado de las tareas ni de las HU (decisión del PO del
22/11/2026).

| ID     | HU / subtarea               | Descripción                                                                                                                                                              | Evidencia                                                                                                                                                                                                                                                                                                    | Impacto                                                                                                                | Prioridad | Responsable sugerido                                               | Acción propuesta                                                                                                                                                                  |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | :-------: | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBS-01 | HU-05/T3, T4                | `authenticated` no tiene `INSERT` ni política de inserción sobre `public.reports`; la creación de reportes falla contra una BD real                                      | `supabase/migrations/20261116123000_create_reports.sql:53-54` (`revoke all`); `20261119100000_reports_public_read.sql:4,16` (solo `select`); `supabase/tests/reports_model.test.sql:154-158` lo exige; `web/src/server/reports.ts:256-279`; demostración local (sección 6)                                   | Ningún colaborador puede crear reportes fuera de las pruebas con SDK simulado; bloquea el flujo principal del producto | **Alta**  | Gregorio Merchán (modelo) y Sergio Fernández (endpoint)            | Migración con `grant insert` de columnas y política `with check (author_id = auth.uid())`, perfil activo y `reports.create`; actualizar pgTAP y añadir una prueba E2E de creación |
| OBS-02 | HU-08/T4, T5; HU-09         | El mínimo de confianza para valorar no está aprobado: `private.assessment_policy.minimum_trust_level` se inserta a `NULL` y `ASSESSMENTS_MIN_TRUST_LEVEL` no tiene valor | `supabase/migrations/20261120120000_submit_report_assessments.sql:9`; `web/src/server/assessment-authorization.ts:45`; `docs/api/assessments.md:184-196`                                                                                                                                                     | En un entorno real todas las valoraciones devuelven `503 POLICY_UNAVAILABLE`; la credibilidad solo refleja evidencias  | **Alta**  | Iván Pedraza (PO) y Mario Polaino                                  | Aprobar el entero (propuesta: 1) y aplicar el procedimiento de `docs/api/assessments.md` § «Configuración y activación pendiente»                                                 |
| OBS-03 | HU-10/T1–T3                 | `/profile` muestra datos de ejemplo fijos (confianza 65 y permisos constantes) en lugar de los del usuario                                                               | `web/src/app/profile/page.tsx:5-22`; existe `GET /api/me/profile` (PR #28) y HU-11 ya está integrada                                                                                                                                                                                                         | El usuario no ve su confianza ni sus permisos reales, que es el objetivo de HU-10                                      | **Alta**  | Gregorio Merchán                                                   | Cargar el perfil con `GET /api/me/profile` y el token de `AuthProvider`; añadir pruebas de la pantalla                                                                            |
| OBS-04 | Proceso (todas)             | La revisión independiente apenas queda registrada y `main` no está protegida                                                                                             | Solo #26, #31 y #36 tienen aprobación; 40 de 43 PR las fusionó su autor; `gh api …/branches/main/protection` → 404; #31 (HU-09) la aprobó Ignacio, no el revisor de P4                                                                                                                                       | No hay evidencia en GitHub de la revisión que exige la DoD (`docs/development.md:140`)                                 | **Alta**  | Equipo (PO y Scrum Master)                                         | Proteger `main` con 1 aprobación obligatoria y CI requerido; asignar la persona revisora de P4 en cada PR                                                                         |
| OBS-05 | HU-05/T3                    | La creación exige `role_code = 'collaborator'` pero no comprueba el permiso `reports.create`                                                                             | `web/src/server/reports.ts:245-251`; `docs/api/reports.md:14`; matriz de `docs/domain-design.md:54-61`                                                                                                                                                                                                       | Revocar `reports.create` no impide crear; `developer` y `admin` tienen el permiso pero se rechazan                     |   Media   | Sergio Fernández                                                   | Usar `rpc('my_permissions')` como en evidencias (#40) y alinear la regla de rol con la matriz de HU-14                                                                            |
| OBS-06 | HU-06/T4                    | La RLS de `report_evidences` y las políticas del _bucket_ no exigen el rol `collaborator` ni `evidences.add`                                                             | `docs/domain-design.md:496,510,527`; `docs/api/evidences.md:167`                                                                                                                                                                                                                                             | Con su token, un usuario puede llamar a Supabase directamente sin pasar la comprobación de la API                      |   Media   | Ignacio García                                                     | Añadir la comprobación del permiso a las políticas de inserción y de Storage, con pruebas pgTAP                                                                                   |
| OBS-07 | HU-06/T2 (HU-02)            | `GET /api/reports/{id}/evidences` existe, pero ninguna pantalla muestra las evidencias                                                                                   | `web/src/app/api/reports/[reportId]/evidences/route.ts:27`; `web/src/lib/evidences/upload.ts:149` solo usa los `POST`                                                                                                                                                                                        | Las evidencias no son visibles para nadie desde la aplicación (deuda aceptada por el PO, ligada a HU-02)               |   Media   | Iván Pedraza (PO) e Ignacio García                                 | Planificar el visor con HU-02 en el Sprint 2                                                                                                                                      |
| OBS-08 | HU-06/T4, T5 (HU-15)        | No hay endpoint de moderación ni llamada `recalculateReportCredibility(…, { cause: 'evidence_moderated' })`; la moderación es reactiva desde Supabase Studio             | `docs/domain-design.md:512,580-582`; `docs/api/evidences.md:166`; respuesta 10 de la PR #13                                                                                                                                                                                                                  | La moderación depende de un acceso manual a Studio sin trazabilidad en la aplicación                                   |   Media   | Iván Pedraza (PO) e Ignacio García                                 | Incluir el endpoint de moderación en HU-15, con la llamada `'evidence_moderated'`                                                                                                 |
| OBS-09 | HU-08/T8                    | El título de la PR dice «necesita comprobación». El E2E **sí se ejecuta en CI** y pasa, pero contiene un único caso y la PR no tiene revisión                            | PR #41 (`867471d`); `.github/workflows/ci.yml:64`; `web/tests/assessments-e2e.test.ts`; run 44906494366                                                                                                                                                                                                      | Riesgo bajo de regresión, pero la verificación no está revisada y el caso único agrupa varios escenarios               |   Media   | Mario Merino; revisión de Sergio Fernández                         | Revisar la PR, confirmar el estado en ClickUp y separar los escenarios en casos independientes                                                                                    |
| OBS-10 | HU-01/T4, HU-05             | El panel principal incluye un segundo formulario de reportes que no envía nada                                                                                           | `web/src/app/dashboard.tsx:272-282` («El envío al servidor aún no está conectado») y `:684-690`; el formulario real está en `/reports/new` (`ReportForm.tsx`)                                                                                                                                                | Confusión del usuario y código duplicado                                                                               |   Media   | Mario Merino                                                       | Sustituir el formulario del panel por un enlace a `/reports/new` o por `ReportForm`                                                                                               |
| OBS-11 | Calidad (T-CTRL-02)         | El ámbito de cobertura deja fuera rutas y componentes con lógica                                                                                                         | `web/vitest.config.ts:17-27`: no incluye `api/reports/[reportId]/evidences/**`, `api/auth/sign-in`, `CollaboratorGuard`, `AuthProvider`, `ReportForm` ni `dashboard.tsx`                                                                                                                                     | La cobertura del 99 % no representa todo el código funcional                                                           |   Media   | Sergio Fernández                                                   | Ampliar el ámbito y añadir las pruebas que falten (`docs/development.md`, regla de cobertura)                                                                                     |
| OBS-12 | T-CTRL-01                   | No hay documento de bloqueos e impedimentos                                                                                                                              | `docs/qa/` solo contiene `reporte-pruebas-metricas.md`                                                                                                                                                                                                                                                       | Sin trazabilidad de impedimentos para la retrospectiva                                                                 |   Media   | Gregorio Merchán                                                   | Redactar el registro del Sprint 1 a partir de las actas de `reuniones/`                                                                                                           |
| OBS-13 | T-CTRL-03                   | No hay documento de desviación de esfuerzo ni tiempo de ciclo                                                                                                            | `docs/qa/`; reunión del día 4 (petición de horas en ClickUp)                                                                                                                                                                                                                                                 | TB, DEE y Cycle Time no disponibles                                                                                    |   Media   | Mario Polaino                                                      | Exportar ClickUp, calcular los indicadores y publicarlos en `docs/qa/`                                                                                                            |
| OBS-14 | T-CTRL-02                   | Falta la medición de la semana 2 (prevista para el 20/11)                                                                                                                | `docs/qa/reporte-pruebas-metricas.md` (§ 7, «Siguiente medición semanal»)                                                                                                                                                                                                                                    | % CPA y DDP de la semana 2 no disponibles                                                                              |   Media   | Sergio Fernández                                                   | Publicar la medición de la semana 2 (puede reutilizar la sección 6 de este informe)                                                                                               |
| OBS-15 | HU-06/T1                    | La subtarea no tiene entregable propio: su resultado es la respuesta 5 de la PR #13                                                                                      | Comentario de la PR #13 (18/11/2026); `docs/domain-design.md:494-513`                                                                                                                                                                                                                                        | Trazabilidad débil de la decisión de almacenamiento                                                                    |   Baja    | Ildefonso Ruiz                                                     | Registrar la decisión como ADR (`docs/adr/0005-…`) con referencia a la PR #13                                                                                                     |
| OBS-16 | HU-05, HU-11, HU-08, HU-10  | Documentación desactualizada respecto al código                                                                                                                          | `docs/api/reports.md:12-13` (el formulario ya envía Bearer: `ReportForm.tsx:109-121`); `web/src/app/api/README.md:12`; `docs/architecture.md:47` y `docs/adr/0004-supabase-persistence.md:4` (HU-11/T4 ya integrada en #26); `docs/domain-design.md:304,388-399` (decisiones ya resueltas en D1–D6) y `:657` | Información contradictoria para quien retome el trabajo                                                                |   Baja    | Sergio Fernández, Ildefonso Ruiz, Mario Polaino y Gregorio Merchán | Actualizar cada documento junto con la corrección asociada (OBS-01, OBS-03)                                                                                                       |
| OBS-17 | HU-05/T3, HU-06             | Códigos distintos para un token no válido: `INVALID_SESSION` en reportes y `UNAUTHENTICATED` en evidencias y valoraciones                                                | `web/src/server/reports.ts:216-220`; `docs/api/evidences.md:168`                                                                                                                                                                                                                                             | Los clientes deben tratar dos códigos para el mismo caso                                                               |   Baja    | Sergio Fernández                                                   | Unificar en `401 UNAUTHENTICATED` y actualizar `docs/api/reports.md`                                                                                                              |
| OBS-18 | HU-06/T4                    | Quedan pendientes la limpieza de subidas sin confirmar y el análisis antivirus                                                                                           | `docs/domain-design.md:490,578`; `docs/api/evidences.md:165`                                                                                                                                                                                                                                                 | Objetos huérfanos en Storage; archivos con firma válida no analizados                                                  |   Baja    | Ignacio García                                                     | Añadir al _Backlog_ un proceso de limpieza con privilegios y evaluar el análisis antivirus                                                                                        |
| OBS-19 | HU-10 (HU-08, HU-09)        | Ninguna operación modifica `trust_level`: todos los perfiles valen 1                                                                                                     | `docs/domain-design.md:657`                                                                                                                                                                                                                                                                                  | La ponderación por confianza de HU-09 no distingue a nadie                                                             |   Baja    | Iván Pedraza (PO) y Gregorio Merchán                               | Definir en el _Backlog_ cómo evoluciona la confianza                                                                                                                              |
| OBS-20 | HU-08/T1, T9 (trazabilidad) | PR sin número de subtarea en el título y commits sin `(#N)`; HU-08/T1 y T9 comparten commit                                                                              | PR #2, #17, #35, #41; commits `e85e927`, `0ec06e4`, `d6f9fd9`, `ec777b5`, `c7a8e51`, `86e26ab`, `25dd281`, `ce69d91`, `3f2d09f`                                                                                                                                                                              | Cuesta relacionar entregables y subtareas                                                                              |   Baja    | Equipo                                                             | Una PR por subtarea con `HU-XX/TY` en el título y fusión con _squash_                                                                                                             |
| OBS-21 | Todas                       | No se han podido comprobar las discrepancias con ClickUp                                                                                                                 | Sección 7                                                                                                                                                                                                                                                                                                    | El estado del tablero puede no coincidir con `main`                                                                    |   Baja    | Iván Pedraza                                                       | Exportar ClickUp y anotar las discrepancias en la revisión de esta PR o en el Sprint 2                                                                                            |

## 9. Resumen externo para docentes (P5, § 4.4)

**Sprint 1 (9–22/11/2026). Medición del 22/11/2026 a las 13:06 sobre `main` (`439681e`).**

- **% HUC: 8/8 = 100 % (verde).** Las ocho HU comprometidas (HU-14, HU-11, HU-05, HU-06, HU-10, HU-01,
  HU-08 y HU-09) se aceptan por decisión del PO en el cierre del Sprint: sus 43 subtareas tienen
  entregable en `main`.
- **Cobertura disponible:** 921 tests de Vitest con 99,29 % de líneas y 97,57 % de ramas; ningún archivo
  medido baja del 80 %. 1015 aserciones pgTAP correctas. El CI de `main` está en verde.
- **Hitos:** HU-14, HU-05 y HU-10 el 19/11; HU-06, HU-01 y HU-09 el 20/11; HU-11 y HU-08 el 21/11.
- **Pendientes:** T-CTRL-01, T-CTRL-03 y la semana 2 de T-CTRL-02 no tienen documento; TB, DEE y Cycle
  Time no están disponibles. No se dispone de la exportación de ClickUp.
- **Incidencias:** la creación de reportes no funciona contra una base de datos real por falta de
  permiso de inserción; las valoraciones esperan la aprobación del mínimo de confianza; la pantalla de
  perfil usa datos de ejemplo; la revisión independiente no queda registrada en GitHub. Las 21
  observaciones pasan al Sprint 2 (4 de prioridad alta).

## 10. Acciones para el Sprint 2 y la retrospectiva

### 10.1. Entrada en el Sprint Backlog del Sprint 2

| Prioridad | Observaciones                  | Criterio                                                                            |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Alta      | OBS-01, OBS-02, OBS-03, OBS-04 | Entran al inicio del Sprint 2, antes de nuevas HU que dependan de ellas             |
| Media     | OBS-05 a OBS-14                | Entran en el Sprint 2 como subtareas de las HU afectadas o de control               |
| Baja      | OBS-15 a OBS-21                | Se priorizan en el _Product Backlog_; las de documentación, junto con su corrección |

### 10.2. Propuestas de mejora del proceso

1. **Actualizar ClickUp al fusionar:** mover la subtarea a su estado final y registrar las horas el mismo
   día de la fusión, para que T-CTRL-03 y este informe puedan calcularse.
2. **Una PR por subtarea** con `HU-XX/TY` en el título y fusión con _squash_, para que cada commit de
   `main` lleve su `(#N)`.
3. **Verificar contra la base de datos real antes de cerrar una HU:** al menos una prueba de extremo a
   extremo con Supabase local por operación de escritura (como la de HU-08/T8), además de las pruebas con
   el SDK simulado.
4. **Proteger `main`:** aprobación obligatoria de la persona revisora de P4 y CI requerido.
5. **Tareas de control con fecha fija:** publicar cada medición en `docs/qa/` el día previsto, aunque sea
   con indicadores «No disponibles».
6. **Actualizar la documentación en la misma PR** que cambia el comportamiento.
