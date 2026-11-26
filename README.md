# Dark-Shield

Dark-Shield es una plataforma colaborativa para consultar, comunicar y evaluar posibles _dark patterns_ (patrones oscuros): prácticas de diseño de interfaces que pueden inducir a las personas a tomar decisiones que no habrían tomado de forma plenamente consciente.

El proyecto pretende ayudar a los usuarios a navegar con mayor información y a los desarrolladores a identificar y evitar prácticas de diseño engañosas. La comunidad puede aportar reportes, evidencias y valoraciones. La inteligencia artificial, cuando se incorpore, ayudará a estructurar y analizar los reportes, **sin detectar por sí sola los patrones ni decidir de forma autónoma su validez**.

> **Estado: prototipo en desarrollo (preparación para Open Source).** No es una herramienta de detección automática ni un servicio listo para producción. La existencia de un reporte no prueba que una web use patrones oscuros; la ausencia de reportes tampoco garantiza que sea segura.

## Estado y hoja de ruta

| Componente         | Estado actual                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Consulta web       | Búsqueda pública por página o dominio, listado y resumen de reportes y credibilidad.                                                             |
| Cuentas y permisos | Registro, inicio de sesión, recuperación y cierre de sesión; backend de perfiles, roles y permisos. La vista de perfil aún usa datos de ejemplo. |
| Reportes           | Formulario, endpoint y modelo de datos disponibles; la creación contra la BD real está bloqueada por la autorización de inserción pendiente.     |
| Evidencias         | Flujo de selección, subida firmada y confirmación de imágenes PNG, JPEG y WebP (hasta 10 MiB); visor completo y moderación pendientes.           |
| Valoraciones       | API y controles de validación/invalidación; activación real pendiente de la decisión sobre el mínimo de confianza.                               |
| Extensión          | Popup inicial para Chrome/Edge. Consulta de la página y alertas pendientes.                                                                      |
| IA                 | Sin implementación ni proveedor seleccionado.                                                                                                    |

Las prioridades inmediatas son completar el flujo de reportes y perfiles, resolver la política de valoraciones y preparar una distribución reproducible con datos de prueba. Después se ampliarán la extensión y el análisis asistido por IA conforme al roadmap. Las funcionalidades propuestas no son compromisos de fecha.

- [Issues y propuestas](https://github.com/DarkShieldApp/dark-shield-app/issues).
- [Releases](https://github.com/DarkShieldApp/dark-shield-app/releases) para las versiones que se publiquen.
- [Estrategia de apertura](docs/open-source/open-source-strategy.md) para el alcance previsto.

## Arquitectura y estructura

Monorepositorio TypeScript con npm workspaces: Next.js reúne interfaz React y backend HTTP; WXT genera la extensión Manifest V3; Supabase proporciona PostgreSQL, Auth y Storage. La extensión consumirá la API web, no Supabase directamente.

```text
dark-shield-app/
├── web/                          # @darkshield/web
│   ├── src/app/                  # Páginas, layouts y API HTTP
│   ├── src/components/           # Componentes React
│   ├── src/lib/                  # Utilidades, validaciones y clientes
│   ├── src/server/               # Lógica de servidor y autorización
│   └── tests/                    # Pruebas Vitest
├── extension/                    # @darkshield/extension
│   ├── src/entrypoints/popup/    # Popup de navegador
│   └── wxt.config.ts             # Configuración WXT
├── supabase/
│   ├── config.toml               # Instancia local
│   ├── migrations/               # Esquema, permisos, triggers y RLS
│   └── tests/                    # Pruebas SQL/pgTAP
├── docs/                         # Arquitectura, API y decisiones
├── .github/                      # Plantillas y CI
├── package.json                  # Scripts y workspaces
└── package-lock.json             # Lockfile único
```

Consulta [arquitectura](docs/architecture.md) y sus ADR para conocer las decisiones tecnológicas. RLS (_Row-Level Security_) son las políticas de acceso a filas en PostgreSQL y forman parte de la autorización del sistema.

## Primeros pasos

### Requisitos

- Git, **Node.js 24.x** (fijado en `.nvmrc`) y **npm 11 o 12**. CI utiliza npm 12.2.1.
- Chrome o Edge para probar la extensión.
- Docker con motor Linux si vas a ejecutar Supabase local o las pruebas SQL; puertos 54320–54324 libres. La primera descarga de imágenes puede tardar varios minutos.

Ejecuta los comandos desde la raíz del repositorio.

```sh
git clone https://github.com/DarkShieldApp/dark-shield-app.git
cd dark-shield-app
npm ci
npm run dev:web
```

Abre <http://localhost:3000>. La página inicial y la compilación pueden funcionar sin configuración de Supabase; las operaciones de datos y autenticación la necesitan. Para contribuir a documentación o ejecutar pruebas unitarias no necesitas acceso a la infraestructura del equipo original.

### Configurar Supabase para desarrollo

Se recomienda una instancia local aislada. Con Docker en ejecución, desde la raíz:

```sh
npm run supabase:start
npm run supabase:status
```

En una instancia nueva se aplican las migraciones versionadas. Si ya existe una instancia local, consulta [la guía de Supabase](supabase/README.md) para aplicar migraciones pendientes sin borrar los datos. No hay un seed de reportes de ejemplo.

Copia `web/.env.example` a `web/.env` **solo si este último no existe** y configura:

| Variable                               | Valor                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL base de tu instancia; en local, `http://127.0.0.1:54321`.                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable `sb_publishable_...` de tu instancia.                                                  |
| `SUPABASE_SECRET_KEY`                  | Clave `sb_secret_...`, exclusivamente en servidor; necesaria para iniciar sesión por nombre de usuario. |

Usa las claves de tu instancia que proporciona la CLI (si solo ofrece claves JWT heredadas, no las sustituyas por claves incompatibles: consulta la configuración de la CLI y la guía de Supabase). También puedes emplear un proyecto remoto propio de desarrollo con Auth por correo/contraseña, confirmación de correo y migraciones aplicadas por el procedimiento documentado. Nunca uses el proyecto de producción para probar cambios.

No compartas las claves ni la salida completa de `supabase:status`. No subas `web/.env` ni datos personales a Git. Las variables `NEXT_PUBLIC_` se incluyen en el cliente y se fijan al compilar; reinicia el servidor tras cambiar la configuración y recompila para un despliegue. Consulta los detalles de Auth, redirecciones, correo local y migraciones en [supabase/README.md](supabase/README.md).

Con la web arrancada, puedes explorar `/consulta`, `/login` y `/reports/new`. Utiliza datos sintéticos y ten presentes las limitaciones del apartado de estado. `npm run supabase:check` permite comprobar la conectividad de Auth de la instancia configurada; no demuestra que las tablas ni RLS estén correctamente configuradas.

### Ejecutar la extensión

En otra terminal, desde la raíz:

```sh
npm run dev:extension
```

En Chrome o Edge abre la gestión de extensiones (`chrome://extensions` o `edge://extensions`), activa el modo desarrollador y carga descomprimida la carpeta `extension/.output/chrome-mv3-dev`. Abre el popup desde la barra del navegador. WXT no abre automáticamente un navegador; si reinicias WXT, recarga la extensión.

Para probar la compilación de producción, ejecuta `npm run build:extension` y carga `extension/.output/chrome-mv3`. El manifest de producción actual no pide acceso a sitios ni permisos; el de desarrollo puede incorporar permisos de recarga local. `extension/.env.example` anticipa `VITE_API_BASE_URL`, todavía sin consumo real. No se deben empaquetar secretos en una extensión.

## Comandos y calidad

| Comando                                                    | Resultado                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev:web`                                          | Desarrollo de web y backend HTTP.                                           |
| `npm run dev:extension`                                    | Desarrollo de la extensión.                                                 |
| `npm run build:web` / `npm run build:extension`            | Compilar cada aplicación.                                                   |
| `npm run build`                                            | Compilar ambas aplicaciones.                                                |
| `npm run start --workspace @darkshield/web`                | Ejecutar la web compilada en modo producción local.                         |
| `npm run lint`                                             | ESLint en ambos workspaces.                                                 |
| `npm run typecheck`                                        | Comprobar tipos TypeScript.                                                 |
| `npm run format` / `npm run format:check`                  | Formatear o verificar formato con Prettier.                                 |
| `npm run check`                                            | Formato, lint, tipos y compilación.                                         |
| `npm test`                                                 | Pruebas unitarias en modo no interactivo.                                   |
| `npm run test:coverage`                                    | Pruebas con cobertura V8 y umbral del 80 % por archivo en el ámbito medido. |
| `npm run test:db`                                          | Pruebas SQL/pgTAP con Supabase local iniciado.                              |
| `npm run test:assessments:e2e --workspace @darkshield/web` | Prueba de integración E2E de valoraciones con entorno local.                |
| `npm run supabase:start` / `npm run supabase:stop`         | Iniciar/detener Supabase local (stop conserva los datos).                   |
| `npm run supabase:status` / `npm run supabase:check`       | Estado local / diagnóstico de Auth.                                         |

GitHub Actions ejecuta dos jobs (`check` y `database`) en PR hacia `main` y push a `main`: comprueba formato, lint, tipos, build y cobertura; inicia Supabase local, ejecuta pgTAP y el E2E de valoraciones. No despliega ni necesita secretos remotos. La extensión aún no tiene una suite propia. La cobertura no representa el producto completo: consulta `web/vitest.config.ts` para conocer su alcance exacto.

Instala dependencias específicas con `npm install <paquete> --workspace @darkshield/web` o `--workspace @darkshield/extension`. No generes lockfiles separados. Next.js requiere un servidor para sus endpoints; no desplegar como exportación estática. Antes de probar en producción deben resolverse las limitaciones y los riesgos de apertura.

## Documentación

| Documento                                        | Contenido                                |
| ------------------------------------------------ | ---------------------------------------- |
| [Arquitectura](docs/architecture.md)             | Componentes, responsabilidades y ADR.    |
| [Desarrollo](docs/development.md)                | Organización técnica, calidad y pruebas. |
| [Supabase](supabase/README.md)                   | Configuración, migraciones y pgTAP.      |
| [API de reportes](docs/api/reports.md)           | Contratos de consulta y creación.        |
| [API de evidencias](docs/api/evidences.md)       | Subida, confirmación y lectura.          |
| [API de autorización](docs/api/authorization.md) | Perfiles, permisos y administración.     |
| [API de valoraciones](docs/api/assessments.md)   | Contrato de validación e invalidación.   |

Algunas guías del Sprint 1 conservan referencias históricas que requieren actualización; contrasta el código y los contratos actuales antes de implementar. La documentación pública definitiva debe ajustarse al perímetro aprobado en la estrategia de apertura.

## Contribuir y obtener ayuda

Se agradecen contribuciones de código, pruebas, documentación, accesibilidad, experiencia de usuario y propuestas de categorías de patrones oscuros. Si es tu primera contribución, busca las tareas con la etiqueta [`good first issue`](https://github.com/DarkShieldApp/dark-shield-app/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) cuando se publiquen.

- [Guía de contribución](CONTRIBUTING.md): issues, ramas, commits, pruebas y PR.
- [Código de conducta](CODE_OF_CONDUCT.md): normas y procedimiento confidencial de denuncia.
- [Gobernanza de apertura](docs/open-source/governance-and-sustainability.md): propuesta de mantenimiento y toma de decisiones.

Para errores o funcionalidades utiliza GitHub Issues. Para vulnerabilidades o incidentes de privacidad sigue el [canal privado de seguridad](CONTRIBUTING.md#seguridad-y-privacidad). No publiques reportes sobre personas, evidencias reales ni credenciales en las issues (pensadas para el desarrollo del software, no para el catálogo de dark patterns).

## Origen del proyecto

Dark-Shield nace como proyecto del Grupo 1 de Gestión de Proyectos Software del Grado en Ingeniería del Software, Universidad de Málaga (curso 2026–2027). El equipo impulsor desarrolla el prototipo en colaboración y prepara su apertura a contribuciones externas. El estado actual no implica un servicio oficial de la universidad.

## Licencia

El código original destinado a publicación se propone bajo la **Apache License, Version 2.0** (`Apache-2.0`); véase el archivo [LICENSE](LICENSE). Las dependencias y materiales de terceros conservan sus licencias y avisos. Los datos de usuarios, secretos, material interno y componentes excluidos no deben formar parte de la distribución pública. La incorporación definitiva de la licencia requiere confirmar la titularidad y el perímetro de publicación antes de la release. No se conceden por este archivo derechos sobre marcas, datos o contenidos de terceros.
