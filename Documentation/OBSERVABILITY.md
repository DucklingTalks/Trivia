# Plan de Observabilidad

This document tracks the privacy-first observability rollout for Trivia. Sentry phase 1 is implemented for technical error monitoring; PostHog remains planned and is not implemented.

## Ruta rápida

1. El maintainer debe crear las cuentas, proyectos y claves en PostHog y Sentry. Este repositorio no crea cuentas externas ni contiene secretos.
2. Sentry phase 1 is enabled in the client and server; add PostHog only after its consent and event review is complete.
3. Configurar cada entorno con variables independientes y verificar que no se envíen nombres, preguntas, respuestas, UUID locales ni direcciones IP.
4. Completar la lista de validación de este documento antes de habilitar producción.

## Objetivos y límites

| Objetivo | Resultado esperado |
| --- | --- |
| Confiabilidad | Detectar errores del frontend, API y Socket.IO con contexto técnico suficiente para reproducirlos. |
| Uso del producto | Medir el embudo anónimo de creación, unión y finalización de partidas. |
| Operación | Conocer disponibilidad básica, conexiones y duración de partidas sin inspeccionar contenido de usuarios. |
| Privacidad | Recoger la mínima información necesaria y documentar qué queda fuera de la telemetría. |

Fuera de alcance inicial: perfiles de usuario, publicidad, grabación de sesiones, reproducción de teclas, rastreo entre sitios, fingerprinting y almacenamiento de contenido libre introducido por los participantes.

## Límites de privacidad

### No capturar

- **Direcciones IP:** no enviarlas de forma explícita ni aceptar configuraciones del proveedor que las incorporen como dato de evento. Revisar también logs, integraciones y exportaciones.
- Fingerprinting de navegador, dispositivo o red.
- Nombre del jugador, UUID de reconexión (`localUuid`), `socket.id`, código de sesión, URL completa con `?session=`, cookies o identificadores persistentes.
- Preguntas, opciones, respuestas, nombres de archivos importados, URLs de imágenes, textos de error introducidos por usuarios o contenido de `localStorage`.
- Cabeceras, cuerpos completos de solicitudes, payloads de Socket.IO, query strings y breadcrumbs que puedan contener los datos anteriores.

El UUID que hoy se guarda en `localStorage` sirve para la reconexión del juego; no debe convertirse en identificador analítico. Los nombres mostrados en el lobby y el código de partida son datos potencialmente identificables dentro de un grupo y deben permanecer fuera de PostHog y Sentry.

### Datos permitidos, agregados y acotados

- Entorno (`local`, `staging`, `production`), versión/release y nombre técnico del servicio (`client` o `server`).
- Idioma seleccionado (`es`/`en`), rol (`host`/`player`) y pantalla o estado general, sin identificadores de sesión.
- Contadores agregados: cantidad de preguntas, cantidad de jugadores agrupada por rangos y duración agrupada por rangos.
- Duraciones y conteos técnicos, siempre con unidades y límites razonables.
- Un identificador anónimo generado por la herramienta solo si el maintainer aprueba su uso, con opt-out y sin combinarlo con datos de la aplicación.

La configuración debe desactivar captura automática y datos personales por defecto. En versiones del SDK que admitan `sendDefaultPii`, debe quedar en `false`. En versiones recientes del SDK JavaScript, revisar además `dataCollection` y configurar explícitamente las categorías sensibles —información de usuario, cookies, cabeceras, cuerpos HTTP, parámetros de URL y contenido de consultas— porque esa opción reemplaza el control booleano anterior. PostHog debe operar sin autocapture hasta que cada evento haya sido revisado.

## Fases de implementación

### Fase 0 — Preparación y privacidad

- [ ] El maintainer define la separación por entorno en cada proveedor: proyectos separados cuando sea útil, o un único proyecto con nombres de entorno claros.
- [ ] Define responsable, finalidad, retención, región de datos y procedimiento de borrado.
- [ ] Decide si la analítica requiere consentimiento previo en las jurisdicciones y audiencias objetivo.
- [ ] Documenta en la política de privacidad qué proveedores se usan y qué datos no se recopilan.
- [ ] No añadir dependencias ni código hasta aprobar esta configuración.

### Phase 1 — Sentry technical error monitoring (implemented)

- [x] Add the official React/Vite and Node SDKs: `@sentry/react` and `@sentry/node`.
- [x] Initialize the client in `client/src/main.tsx` and the server in `server/src/index.ts` only when a DSN is present.
- [x] Keep `sendDefaultPii: false`; the installed 10.x SDK does not use the newer `dataCollection` option.
- [x] Remove request, user, extra, context, breadcrumb, span, URL, message, and exception-value data before events are sent.
- [x] Capture technical React, HTTP, Express, and Socket.IO failures without capturing expected validation responses as exceptions.
- [ ] Complete provider-side alert, release, retention, and synthetic-data validation before production.

### Fase 2 — PostHog para uso anónimo

- [ ] Inicializarlo una sola vez en `client/src/main.tsx` o en un módulo dedicado de analítica, con autocapture desactivado.
- [ ] Añadir consentimiento/opt-out antes de enviar eventos si la evaluación legal lo requiere.
- [ ] Instrumentar solo acciones del producto y estados agregados; no enviar propiedades libres.
- [ ] No instrumentar el servidor con PostHog en la primera versión: los eventos de producto nacen en el cliente y el backend queda para métricas operativas y Sentry.

### Fase 3 — Operación y revisión

- [ ] Configurar alertas de Sentry por errores nuevos, regresiones y aumento anormal de fallos de conexión.
- [ ] Crear los paneles de PostHog descritos abajo.
- [ ] Revisar semanalmente muestras de eventos y trimestralmente retención, consentimiento y permisos.
- [ ] Definir un procedimiento para borrar datos y revocar claves sin cambiar el código fuente.

## Puntos exactos de integración

| Archivo o área | Integración planificada |
| --- | --- |
| `client/src/main.tsx` | Inicialización única de Sentry/PostHog antes del render; configuración por entorno y consentimiento. |
| `client/src/App.tsx` | Eventos de navegación, creación/unión de partida, inicio, respuesta agregada, finalización y errores de UI. Nunca adjuntar `sessionId`, `playerName`, `playerUuid`, preguntas u opciones. |
| `client/src/socket.ts` | Capturar errores técnicos de conexión y reconexión en Sentry con códigos categóricos, no con URL completa ni payload. |
| `server/src/index.ts` | Inicialización de Sentry y captura de errores HTTP; revisar middleware antes de `express.json()` si el SDK lo requiere. |
| `server/src/routes.ts` | Errores de `POST /api/session` y `GET /api/session/:id` con ruta normalizada y resultado HTTP; nunca cuerpo, `:id` ni preguntas. |
| `server/src/sockets.ts` | Errores y contadores de conexión, unión, reconexión, respuesta y desconexión; usar categorías y rangos, nunca nombres, UUID, socket IDs o session IDs. |
| `server/src/store.ts` | Fuente actual de sesiones en memoria. Puede aportar conteos agregados a una métrica operativa futura, pero no debe enviar el mapa de sesiones ni sus objetos. |
| `shared/types.ts` | Revisar tipos al diseñar propiedades agregadas; no ampliar payloads solo para telemetría. |
| `Documentation/DEPLOYMENT.md` | Añadir las variables al procedimiento de despliegue cuando la implementación de código sea aprobada. |

The repository now includes the Sentry SDKs and phase 1 integration. PostHog dependencies and instrumentation are intentionally still absent.

## Taxonomía de eventos PostHog

Todos los nombres deben ser estables, en `snake_case`, y llevar únicamente las propiedades listadas. No usar autocapture ni nombres dinámicos.

| Evento | Momento | Propiedades permitidas |
| --- | --- | --- |
| `app_opened` | Se carga la aplicación | `environment`, `language`, `app_version` |
| `role_selected` | Se elige crear o unirse | `role` (`host`/`player`), `language` |
| `session_creation_succeeded` | El backend crea la partida | `language`, `question_count_bucket` |
| `session_creation_failed` | Falla la creación | `error_category`, `language` |
| `session_join_succeeded` | Jugador unido correctamente | `language` |
| `session_join_failed` | Falla la unión | `error_category`, `language` |
| `game_started` | El host inicia el juego | `question_count_bucket`, `player_count_bucket`, `language` |
| `answer_submitted` | Se envía una respuesta | `response_time_bucket`, `question_number_bucket` |
| `game_finished` | Se emite `game:finished` | `duration_bucket`, `question_count_bucket`, `player_count_bucket` |
| `reconnection_attempted` | Se intenta reconectar | `result`, `session_status` sin identificador |

Rangos sugeridos: `question_count_bucket` (`1-5`, `6-10`, `11+`), `player_count_bucket` (`1`, `2-4`, `5-9`, `10+`), `response_time_bucket` (`0-5s`, `6-10s`, `11-20s`, `21s+`) y `duration_bucket` (`0-5m`, `6-15m`, `16m+`). No registrar `selectedOptionIndex` ni si la respuesta fue correcta en la primera versión; esos datos no son necesarios para los objetivos definidos.

## Variables de entorno

Los nombres siguientes son parte del plan. No deben tener valores en el repositorio, en ejemplos, en tickets ni en esta documentación. El maintainer debe cargarlos en el gestor de secretos/configuración de cada plataforma.

### Cliente (`client`)

| Variable | Uso |
| --- | --- |
| `VITE_POSTHOG_KEY` | Clave pública del proyecto PostHog del entorno. La proporciona el maintainer. |
| `VITE_POSTHOG_HOST` | Host regional de PostHog elegido por el maintainer. |
| `VITE_SENTRY_DSN` | DSN del proyecto Sentry del frontend. La proporciona el maintainer. |
| `VITE_SENTRY_ENVIRONMENT` | `local`, `staging` o `production`. |
| `VITE_SENTRY_RELEASE` | Identificador opcional de release generado por CI/CD para asociar errores con una versión concreta. No es un secreto. |
| `VITE_POSTHOG_CONSENT_REQUIRED` | `true` si PostHog debe esperar consentimiento antes de enviar analítica; `false` si la política aprobada permite enviarla sin esa interacción. No reemplaza el mecanismo de consentimiento. |

Vite expone al navegador las variables `VITE_*`; no colocar allí tokens administrativos, claves privadas ni credenciales de ingestión del servidor.

### Servidor (`server`)

| Variable | Uso |
| --- | --- |
| `SENTRY_DSN` | DSN del proyecto Sentry del backend. La proporciona el maintainer. |
| `SENTRY_ENVIRONMENT` | `local`, `staging` o `production`. |
| `SENTRY_RELEASE` | Identificador de release de backend, si se habilita. |
| `SENTRY_TRACES_SAMPLE_RATE` | Tasa de trazas aprobada por el maintainer; comenzar con un valor conservador. |

No crear valores ficticios con formato de clave, DSN o token. Para desarrollo local se puede dejar la integración desactivada si la variable no está definida.

### Repositorio, desarrollo local y producción

Hay tres lugares distintos y no deben mezclarse:

1. **Repositorio:** puede contener archivos de plantilla como `.env.example`, únicamente con nombres de variables y comentarios. Nunca debe contener DSN, claves ni valores reales.
2. **Desarrollo local:** los valores de prueba pueden vivir en archivos ignorados por Git, como `client/.env.local` y un archivo de entorno del servidor. La implementación debe cargar explícitamente las variables del servidor mediante `dotenv` o el mecanismo `--env-file` de Node; el servidor actual no carga archivos `.env` por sí solo.
3. **Producción y staging:** los valores se configuran directamente en el panel de la plataforma donde corre cada servicio —por ejemplo, Render, Railway, Vercel o el proveedor elegido— o mediante su gestor de secretos. No se suben archivos `.env` al repositorio ni se copian manualmente dentro del build.

El frontend es una excepción importante: Vite reemplaza las variables `VITE_*` durante el build y quedan visibles en el JavaScript entregado al navegador. `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE` y `VITE_POSTHOG_CONSENT_REQUIRED` deben considerarse configuración pública, no credenciales administrativas. Aun así, deben ser específicos para cada entorno y no deben incluir tokens privados.

El backend recibe `SENTRY_DSN`, `SENTRY_ENVIRONMENT` y las demás variables del servidor en tiempo de ejecución. Esas variables deben configurarse en el servicio Node de staging/producción y no en el frontend.

Flujo recomendado:

```text
`.env.example` en Git
        ├── valores locales en archivos ignorados por Git
        └── valores de staging/producción en el panel del proveedor
```

Este repositorio incluye las plantillas `client/.env.example` y `server/.env.example`. Antes de activar la instrumentación, hay que copiar/adaptar esas plantillas según el entorno, confirmar que los archivos poblados sigan ignorados por Git y documentar qué variables requiere cada comando de desarrollo y despliegue.

## Configuración de cuentas y proyectos

### PostHog

Estas acciones requieren acceso externo y deben hacerlas el maintainer:

1. Crear la cuenta y el proyecto de PostHog; elegir región y revisar el acuerdo de tratamiento de datos.
2. Crear proyectos separados para `staging` y `production`, o una separación equivalente claramente etiquetada.
3. Obtener la clave de ingestión pública y el host regional para completar las variables del cliente. No copiar valores aquí.
4. Desactivar autocapture, captura de sesiones, captura de texto/DOM y cualquier enriquecimiento no necesario.
5. Configurar retención, permisos mínimos, consentimiento y exclusión de usuarios internos de prueba.
6. Crear los paneles de la sección correspondiente y limitar su acceso al equipo responsable.

### Sentry

Estas acciones también requieren acceso externo y deben hacerlas el maintainer:

1. Crear la cuenta y un proyecto para Trivia. Para este MVP se puede usar el mismo proyecto para cliente y servidor, diferenciando `SENTRY_ENVIRONMENT` y, si hace falta, una etiqueta técnica de servicio. Separar `trivia-client` y `trivia-server` es una mejora opcional, no un requisito.
2. Obtener el DSN del proyecto y cargarlo solo mediante las variables indicadas. Sentry crea los entornos automáticamente cuando recibe eventos con valores como `local`, `staging` o `production`; no hace falta crearlos manualmente.
3. Desactivar la recopilación de PII: usar `sendDefaultPii: false` en SDKs que lo soporten y la configuración restrictiva equivalente de `dataCollection` en SDKs recientes. Revisar también scrubbing de datos, URLs, breadcrumbs, request bodies y cabeceras.
4. Configurar releases desde CI/CD sin incluir secretos en logs; subir source maps solo con el mecanismo seguro del proveedor.
5. Establecer alertas, responsables, permisos y retención según el riesgo y presupuesto del proyecto.

El asistente no puede crear cuentas, proyectos, claves, DSN, políticas legales ni configuración en servicios externos.

## Configuración por entorno

| Entorno | PostHog | Sentry | Regla |
| --- | --- | --- | --- |
| Local | Desactivado por defecto o proyecto local separado | DSN opcional; errores manuales durante pruebas | No enviar datos reales ni usar nombres reales. |
| Staging | Proyecto `staging`, autocapture desactivado | Proyectos/entorno `staging`, muestreo controlado | Verificar scrubbing con datos sintéticos antes de promover. |
| Production | Proyecto `production`, consentimiento y retención aprobados | Proyectos/entorno `production`, alertas y release activo | Revisar permisos y ausencia de IP/datos identificables. |

La compilación de Vite ocurre en `client`; los valores deben estar disponibles durante el build del frontend. El servidor Node obtiene sus variables en tiempo de ejecución. Nunca almacenar archivos `.env` con valores reales en Git.

## Paneles y alertas

### PostHog

- Embudo: `app_opened` → `role_selected` → `session_creation_succeeded` o `session_join_succeeded` → `game_started` → `game_finished`.
- Uso por idioma y rol, sin identificación individual.
- Tasa de fallos de creación/unión por `error_category`.
- Partidas terminadas por rangos de jugadores y preguntas.
- Reconexiones por resultado y estado general.

### Sentry

- Errores nuevos y regresiones por servicio y entorno.
- Errores de conexión Socket.IO y fallos HTTP de creación/unión.
- Latencia y errores del health check y de las rutas REST, sin parámetros de sesión.
- Tasa de errores por release y despliegue.
- Alertas con límites que eviten notificaciones por errores de entrada esperables.

## Validación antes de producción

- [ ] `client/package.json` y `server/package.json` solo cambian cuando se apruebe la implementación; este plan no agrega dependencias.
- [ ] No hay claves, DSN, tokens ni valores con apariencia de secreto en Git, documentación o logs.
- [ ] Una inspección de red confirma que no se envía la dirección IP desde la instrumentación propia ni como propiedad de evento.
- [ ] No aparecen `sessionId`, `playerName`, `playerUuid`, `localUuid`, `socket.id`, nombres de preguntas, opciones, respuestas o URLs completas en eventos y errores.
- [ ] Autocapture, session replay y fingerprinting están desactivados; `sendDefaultPii` o la configuración equivalente de `dataCollection` no recopila PII.
- [ ] Se prueba creación, unión, reconexión, respuesta, desconexión, error de red y finalización en local/staging.
- [ ] Se comprueba que los errores esperables estén agrupados y redactados.
- [ ] El consentimiento y el opt-out se prueban antes de generar cualquier evento de analítica.
- [ ] Los paneles muestran datos sintéticos esperados y ninguna dimensión sensible.
- [ ] Se revisan retención, acceso, borrado y exportación con el maintainer.
- [ ] Se confirma que la aplicación funciona cuando las variables están ausentes o el proveedor no responde.

## Retención, consentimiento y gobierno

La retención mínima necesaria debe definirse antes de activar producción y revisarse periódicamente. La analítica de producto debe respetar el consentimiento aplicable; si no existe una base válida, PostHog debe permanecer desactivado para esa persona. `VITE_POSTHOG_CONSENT_REQUIRED` expresa la política de despliegue, pero no sustituye un banner, diálogo, almacenamiento de la decisión ni una opción de opt-out. Sentry puede tratarse como herramienta estrictamente técnica solo después de una revisión legal y de configuración; esta variable no debe bloquearlo automáticamente.

El maintainer debe documentar: finalidad, categorías de datos, proveedores, región, base legal, plazo de retención, responsables, procedimiento de acceso/borrado y respuesta a incidentes. Las cuentas deben usar MFA, roles mínimos y rotación de claves. Las solicitudes de borrado deben ejecutarse en los proveedores y no mediante identificadores que Trivia no debería conservar.

## Extensiones futuras

- Métricas operativas agregadas del proceso Node y del health check, sin capturar tráfico bruto.
- Seguimiento de disponibilidad de Socket.IO y tiempos de ciclo por rangos.
- Source maps y releases automatizados con CI/CD seguro.
- Tests automatizados que fallen si se agregan propiedades prohibidas a eventos.
- Consentimiento granular si se incorporan nuevas finalidades.
- Exportación periódica de métricas agregadas para un panel propio, sin replicar eventos crudos.

Estas extensiones requieren una nueva revisión de privacidad y no deben interpretarse como parte de la implementación actual.
