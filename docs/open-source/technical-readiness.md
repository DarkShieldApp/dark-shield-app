# Preparación técnica y seguridad — Dark-Shield

| Campo    | Valor                                                    |
| -------- | -------------------------------------------------------- |
| Práctica | P9 — Preparación del proyecto para Open Source           |
| Grupo    | Dark-Shield                                              |
| Equipo   | B — Preparación técnica y seguridad                      |
| Fecha    | 27/11/2026                                               |
| Estado   | Propuesta para la puesta en común y revisión del equipo  |
| Base     | `main` (`8c92905`) y entregables de los equipos A, C y D |

## 1. Estructura y organización del repositorio

**Decisión:** conservar el monorepositorio TypeScript con npm workspaces. La separación actual permite trabajar en la web y la extensión sin duplicar dependencias ni perder la trazabilidad de los cambios en la base de datos.

| Componente               | Estado y decisión                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/`                   | Next.js: interfaz, API y lógica de negocio. Publicar salvo la implementación privada de credibilidad y el código de autorización, autenticación y sesiones.                                                                                                                        |
| `extension/`             | WXT y React: publicar el prototipo Manifest V3, indicando que todavía no consume la API.                                                                                                                                                                                           |
| `supabase/`              | Publicar el esquema, la configuración local y las pruebas que no dependan de las políticas privadas. No publicar las políticas RLS y de permisos ni los datos y la configuración de producción; se incluye una configuración de seguridad mínima de ejemplo para desarrollo local. |
| Módulo de IA             | Sin código actual; cuando se implemente se ubicará en `web/src/server/ai/` (con `server-only`) y se publicará íntegro, incluidos prompts y evaluación.                                                                                                                             |
| `docs/`, `.github/`      | Mantener documentación técnica, ADR, plantillas y CI; revisar referencias internas y datos personales antes de publicar.                                                                                                                                                           |
| `reuniones/`, `docs/qa/` | Trasladar a un espacio privado: contienen material interno y no son necesarios para contribuir.                                                                                                                                                                                    |

`.gitignore` ya excluye dependencias, compilaciones, cobertura, archivos `.env` y temporales de Supabase. Se propone añadir `reuniones/`, `docs/qa/` y `.idea/` y retirar del seguimiento Git los archivos internos ya versionados, actualizando los enlaces internos de `docs/` que apunten a ellos. En los documentos públicos se mantendrán únicamente los nombres de los _maintainers_ públicos (`GOVERNANCE.md`, `MAINTAINERS.md`), retirando datos personales innecesarios o sensibles. Ignorar archivos en `.gitignore` no elimina las versiones anteriores. El ZIP de trabajo contiene además archivos locales y generados que no deben formar parte de una release.

De acuerdo con el [Equipo A](open-source-strategy.md), extraer `web/src/server/credibility.ts` a un módulo privado mediante `CredibilityProvider`, publicar una implementación de referencia y adaptar sus consumidores, pruebas y documentación. El clon público debe poder compilar sin acceso al módulo privado. La fórmula actual ya está en el historial; será necesario cambiar los parámetros de producción y no confiar en ocultar el código como única defensa ante valoraciones manipuladas.

## 2. Secretos, credenciales y datos sensibles

**Resultado de la revisión:** la copia analizada solo contiene `web/.env.example` y `extension/.env.example` como archivos de entorno fuera de dependencias y artefactos generados. No aparecen archivos `.env` o `.env.local` reales entre los archivos versionados actuales ni entre las rutas históricas revisadas. Las plantillas web no contienen valores de claves.

Se revisaron las 59 revisiones accesibles desde las referencias Git incluidas en la copia local y 433 objetos de texto históricos distintos mediante patrones de claves Supabase, JWT, tokens GitHub, claves privadas, AWS y OpenAI, sin detectar coincidencias con esos patrones. Es una búsqueda preliminar: se excluyeron 24 objetos binarios o de más de 2 MB y falta contrastar contra todas las ramas remotas del repositorio; no sustituye un escaneo especializado ni acredita que nunca se hayan expuesto credenciales.

Sí se confirma la presencia de 20 audios y transcripciones en `reuniones/` y dos informes en `docs/qa/`, además del algoritmo excluido por el Equipo A. Su publicación supone un riesgo de privacidad y de incumplimiento del alcance acordado.

**Decisión:** antes de anunciar la apertura, ejecutar Gitleaks sobre el árbol actual y todo el historial disponible, revisar manualmente documentación, archivos binarios y artefactos, y verificar las referencias remotas. Si aparecen secretos reales, revocarlos y rotarlos inmediatamente, investigar su uso y sanear el historial cuando proceda. Los maintainers coordinarán la limpieza con los owners; borrar un archivo o reescribir Git no elimina copias, forks ni clones existentes. Activar protección frente a nuevos secretos en GitHub y CI, y habilitar un canal confidencial de vulnerabilidades (`SECURITY.md`). No incluir evidencias, usuarios ni reportes reales en ejemplos o pruebas. Cuando se incorpore el módulo de IA, sus credenciales de proveedor externo se gestionarán exclusivamente mediante variables de entorno en servidor, sin claves incrustadas en el código ni en la extensión.

## 3. Dependencias y licencias de terceros

**Decisión:** mantener las versiones fijadas en `package.json` y `package-lock.json`, instalar con `npm ci` y adoptar la licencia Apache-2.0 para el código propio, acordada por el [Equipo C](community-readiness.md) e incorporada en `LICENSE`.

La revisión de los tres manifiestos y del lockfile confirma 23 dependencias directas distintas: 21 MIT y dos Apache-2.0 (TypeScript y Sharp). No se aprecia incompatibilidad directa con la licencia elegida. Sin embargo, las 619 entradas de paquetes del lockfile, incluidas variantes opcionales por plataforma, incorporan otras licencias que requieren revisión:

| Dependencia                               | Licencia declarada | Acción                                                                       |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| Next.js, React, WXT, Supabase JS y Vitest | MIT                | Conservar avisos de licencia aplicables.                                     |
| TypeScript y Sharp                        | Apache-2.0         | Conservar licencias y avisos exigidos.                                       |
| `@img/sharp-libvips-*`                    | LGPL-3.0-or-later  | Revisar obligaciones si se redistribuyen binarios nativos.                   |
| `lightningcss`, `axe-core`                | MPL-2.0            | Revisar obligaciones sobre archivos cubiertos y modificaciones distribuidas. |
| `caniuse-lite`                            | CC-BY-4.0          | Conservar atribución cuando proceda.                                         |

Generar un inventario/SBOM de la release, comprobar las licencias restantes y conservar los avisos de terceros en los artefactos distribuidos. Ejecutar `npm audit` y habilitar Dependabot para npm y GitHub Actions, con revisión de cambios del lockfile y análisis de dependencias nuevas en PR. Bloquear la release ante vulnerabilidades altas o críticas explotables sin mitigación aprobada. El lockfile permite identificar versiones y licencias declaradas, pero no demuestra ausencia de vulnerabilidades ni cumplimiento completo de redistribución; ambas comprobaciones quedan pendientes.

## 4. Configuración de la aplicación

**Decisión:** separar desarrollo local, CI y producción, sin obligar a un contribuidor a utilizar el proyecto Supabase compartido. Se mantendrán las plantillas `.env.example` y se completará la documentación de configuración.

| Parámetro                              | Gestión                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL de instancia propia. HTTPS salvo HTTP en loopback local; no incluir credenciales.                                                                                                                                                                                                                                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_...`, visible en cliente. La protección real depende de RLS y permisos.                                                                                                                                                                                                                                                                                                            |
| `SUPABASE_SECRET_KEY`                  | Exclusivamente servidor; `username-auth.ts` usa `server-only`. Guardar en el gestor de secretos del despliegue; nunca en la extensión.                                                                                                                                                                                                                                                                           |
| `ASSESSMENTS_MIN_TRUST_LEVEL`          | Añadir a la plantilla solo con un valor de ejemplo para desarrollo local. El valor de producción lo deciden el PO y el Comité, se guarda en la configuración privada del despliegue y no se publica; el ADR registra la decisión y su criterio, no el valor. Debe coincidir con `private.assessment_policy.minimum_trust_level`. Actualmente la política se inicializa a `NULL` y bloquea valoraciones (OBS-02). |
| `VITE_API_BASE_URL`                    | Variable pública de extensión aún no consumida; no introducir claves en el paquete WXT.                                                                                                                                                                                                                                                                                                                          |
| Variables de proveedor de IA (futuras) | Configurar exclusivamente en el entorno de servidor (`server-only`) cuando se defina el proveedor del módulo de IA; no exponerlas al cliente ni a la extensión.                                                                                                                                                                                                                                                  |

El entorno reproducible se basa en Node.js 24 (`.nvmrc`), npm 11/12 (CI: 12.2.1), Docker y Supabase local con PostgreSQL 17 (`supabase/config.toml`). Antes de publicar, probar el README desde un clon limpio, incorporar datos sintéticos y verificar que autenticación, permisos, creación de reportes y valoraciones funcionan sin infraestructura privada. No publicar volcados ni emplear credenciales de producción en CI.

## 5. Tests, CI/CD y automatización

**Estado actual:** `.github/workflows/ci.yml` ejecuta en PR y push a `main` dos jobs con permisos de solo lectura y acciones fijadas por commit. No existe un despliegue automático en ese workflow.

| Comprobación | Estado y decisión                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check`      | Ya ejecuta `npm ci`, `npm run check` (formato, lint, tipos y build) y `npm run test:coverage`. Mantener.                                                                 |
| `database`   | Ya inicia Supabase local, ejecuta `npm run test:db` (22 archivos pgTAP) y el E2E de valoraciones. Mantener.                                                              |
| Cobertura    | Vitest exige un 80 % por archivo en las cuatro métricas, dentro del ámbito medido. Ampliarlo a login, rutas de evidencias, formularios y componentes excluidos (OBS-11). |
| Extensión    | Compila y pasa lint/tipos, pero no tiene suite propia. Añadir pruebas del popup y de su futura integración con la API.                                                   |
| Seguridad    | Añadir análisis de secretos, dependencias y CodeQL para JavaScript/TypeScript.                                                                                           |
| CD           | Proponer releases versionadas con artefactos verificados; mantener el despliegue de producción separado, con aprobación manual y secretos protegidos.                    |

El informe del Sprint 1 registra 921 tests Vitest y un 99,29 % de cobertura de líneas, pero no representa todo el producto y no se ha repetido esa medición en esta revisión. Añadir un E2E de creación de reportes con BD real, pruebas de permisos revocados sobre reportes y evidencias (incluido Storage), y escenarios independientes de valoración.

En coordinación con el [Equipo D](governance-and-sustainability.md), exigir PR y los checks reales `check` y `database` en `main` (cobertura y pgTAP son pasos de esos jobs, no checks independientes). Aplicar CODEOWNERS, al menos una aprobación independiente y dos en cambios sensibles, prohibición de force-push y de fusionar la propia PR. Los owners deben verificar las reglas efectivas en GitHub; la doble aprobación por área se controlará mediante reglas compatibles o revisión del maintainer. No ejecutar código de PR externas con secretos ni permisos de escritura. La configuración efectiva de GitHub no se ha podido comprobar desde el ZIP.

## 6. Tres riesgos técnicos prioritarios antes de publicar

| Riesgo                                                                                                                                                                                                                       | Prioridad | Acción y criterio de cierre                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1 — Exposición de datos internos, secretos o algoritmo privado en el historial.**                                                                                                                                         | Alta      | Retirar material interno, revisar historial y artefactos, rotar secretos expuestos si los hubiera, separar el algoritmo y cambiar sus parámetros. Cierre: revisión de seguridad documentada y perímetro del Equipo A cumplido. |
| **R2 — Fallos funcionales y de autorización en Supabase.** OBS-01, OBS-02, OBS-05 y OBS-06: falta permiso/política de inserción de reportes, política de valoración sin activar y comprobaciones de permisos inconsistentes. | Alta      | Corregir grants, RLS y Storage con mínimo privilegio; alinear API y BD; aprobar el umbral de valoración. Cierre: pruebas pgTAP positivas y negativas y E2E del flujo principal en un entorno limpio.                           |
| **R3 — Integración de código inseguro o regresiones por controles insuficientes.** OBS-04 y OBS-11; sin suite de extensión ni análisis especializado en CI.                                                                  | Alta      | Proteger `main`, ampliar cobertura, añadir análisis de seguridad y dependencias y revisión de licencias. Cierre: checks obligatorios verificados, revisiones independientes y ausencia de hallazgos bloqueantes sin resolver.  |

## 7. Acciones pendientes y criterio de publicación

- [ ] **Owners:** verificar quiénes son los owners actuales de GitHub y Supabase (asegurando al menos dos con 2FA) y configurar las reglas efectivas de protección de `main` (`check` y `database` obligatorios, CODEOWNERS, _squash merge_ y prohibición de fusión propia).
- [ ] **Owners y maintainers de seguridad:** completar la auditoría de secretos e historial remoto (`Gitleaks`), retirar `reuniones/` y `docs/qa/`, corregir los enlaces internos rotos en `docs/` y habilitar `SECURITY.md` con contacto confidencial.
- [ ] **Maintainers de backend:** extraer `credibility.ts` tras `CredibilityProvider` con nuevos parámetros de producción y verificar la compilación y CI de la variante pública con la implementación de referencia.
- [ ] **Maintainers de BD y API, con el PO:** corregir autorización y activar la política de valoraciones (OBS-01, OBS-02, OBS-05, OBS-06); validar el flujo completo con datos sintéticos.
- [ ] **Maintainers de CI e infraestructura:** incorporar análisis de secretos, dependencias y CodeQL, generar el SBOM/avisos de licencias de terceros (`LGPL-3.0`, `MPL-2.0`, `CC-BY-4.0`) y publicar `.github/CODEOWNERS` junto al Equipo D.
- [ ] **Maintainers de web y extensión:** ampliar cobertura de pruebas y validar el onboarding desde un clon limpio junto al Equipo C.

**Conclusión:** Dark-Shield tiene una base técnica organizada y automatizada, pero todavía no está preparado para una apertura formal como proyecto Open Source según el alcance acordado. La primera release pública deberá identificarse como prototipo y quedar condicionada al cierre de los tres riesgos anteriores. La revisión ha sido estática sobre la copia aportada; no se han ejecutado nuevamente los tests, `npm audit` ni los escáneres especializados, ni se ha accedido al GitHub o Supabase remoto.
