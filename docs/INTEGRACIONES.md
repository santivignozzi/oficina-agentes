# Integraciones

Qué se puede conectar a la oficina, cuánto cuesta y qué conviene según el caso. Lo que se elige va en `oficina.config.ts`; las claves, en `.env.local` o en las variables del servidor, nunca en el código.

## 1. Modelos de Claude

La oficina usa la API de Anthropic. Hace falta una clave (`ANTHROPIC_API_KEY`), que se saca en [console.anthropic.com](https://console.anthropic.com), en **API Keys**. La API se paga por uso, aparte de cualquier suscripción a Claude.

Precios de lista por millón de tokens (los que usa la oficina para contar el gasto, en `src/server/agents/pricing.ts`):

| Modelo | `model` | Entrada | Salida | Para qué |
| --- | --- | --- | --- | --- |
| Claude Opus 5.5 | `claude-opus-5-5` | USD 4 | USD 20 | La mejor calidad. Conviene en la dirección, que planifica y arma la entrega. |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | USD 2 | USD 10 | Buen equilibrio. El recomendado para empezar, en todos. |
| Claude Haiku 5.5 | `claude-haiku-5-5` | USD 0,10 | USD 0,50 | Muy barato. Para probar el circuito o para tareas simples y repetitivas. |

- `model` en la raíz de la configuración vale para todos; `model` dentro de un agente o de la dirección pisa ese valor para él.
- `AI_OFFICE_MODEL` en las variables pisa el de la configuración para todos, y `AI_OFFICE_MODEL_<ID>` (por ejemplo `AI_OFFICE_MODEL_INVESTIGACION`) para uno. Sirve para cambiar de modelo en el servidor sin tocar el código.
- Un modelo que no está en `pricing.ts` no corre: sin precio, el tope de gasto no podría contarlo. Para sumar otro, agregá su precio ahí.

### Cuánto cuesta una consigna

Estimación con los prompts reales, antes de medir con clave. Una consigna típica es un agente que investiga con 3 búsquedas y otro que propone, más el plan y la entrega de la dirección:

| Consigna | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| --- | --- | --- | --- |
| Liviana: un agente, sin búsquedas | USD 0,13 | USD 0,06 | USD 0,003 |
| Típica: dos agentes, 3 búsquedas | USD 0,45 | USD 0,24 | USD 0,04 |
| Pesada: tres subtareas, 10 búsquedas y un pedido de cambios | USD 1,71 | USD 0,90 | USD 0,14 |

Con 20 consignas típicas por mes: unos USD 9 en Opus, 5 en Sonnet y 0,80 en Haiku. Cada agente que se suma a una consigna agrega una llamada; lo que más pesa son las búsquedas, porque cada resultado se vuelve a leer. Los supuestos están en [docs/ARQUITECTURA.md](ARQUITECTURA.md#9-cuánto-consume).

### Tope de gasto

`AI_OFFICE_BUDGET_USD` es el tope del mes, en dólares (5 si no se pone). Antes de cada llamada la oficina aparta lo máximo que podría costar; si no entra, no sale. El gasto queda guardado en el disco y se reinicia cada mes. La factura de Anthropic es la que vale: conviene poner también un límite de gasto en la consola de Anthropic.

## 2. Búsqueda web

`tools: { webSearch: true }` en un agente. Es una herramienta de la API de Anthropic: no hace falta otra clave ni otra cuenta.

- Cuesta USD 0,01 por búsqueda, además de los tokens de lo que lee.
- Cada llamada hace hasta 5 búsquedas (`MAX_SEARCHES` en `src/server/agents/claude-runner.ts`).
- Las fuentes quedan citadas al final de lo que entrega el agente.
- Lo que lee en la web se trata como datos, no como órdenes.

Sumala a quien tenga que averiguar algo que pudo haber cambiado: precios, competencia, novedades, normas.

## 3. Leer repositorios de GitHub

`tools: { githubRepos: true }` en un solo agente. Ese agente lee de verdad el código y abre los sitios de los repos, en un contenedor que corre Anthropic con **Managed Agents** (en beta).

Qué hace falta:

1. Un token de GitHub **fine-grained**, en [github.com/settings/tokens](https://github.com/settings/tokens?type=beta), con permiso **Contents: Read** en los repos que quieras que lea. Con **All repositories** lee todos los tuyos.
2. Cargarlo en `AI_OFFICE_GITHUB_TOKEN`.
3. Que la cuenta de Anthropic tenga acceso a Managed Agents.

Cómo funciona:

- La dirección ve la lista de repos que deja leer el token (los 50 con cambios más recientes) y, cuando una consigna nombra uno, escribe su nombre exacto en la subtarea. Si la consigna no nombra ninguno, el agente propone sin ver el código y lo dice.
- Sólo lee: no puede cambiar nada ni abrir pull requests. Su red sólo llega a los sitios cargados en **Website** de cada repo en GitHub.
- Se cobra por tokens, con los mismos precios, más USD 0,08 por hora de sesión. Una sesión medida que leyó dos repos y abrió sus sitios costó USD 0,14 en 77 segundos.
- Cada sesión tiene su tope, `AI_OFFICE_REPO_SESSION_USD` (1 dólar si no se pone), y aparta el doble del tope mensual hasta que termina.
- Managed Agents no admite Zero Data Retention: lo que el agente leyó queda guardado en Anthropic hasta que lo borres desde la consola.

Sin token, el agente sigue funcionando: propone a partir de lo que le cuenta la consigna.

## 4. Servidores MCP

MCP (Model Context Protocol) es un estándar para que un modelo use herramientas de otros servicios: leer y crear tareas, buscar en documentos, consultar un CRM. La oficina usa el **conector MCP** de la API de Anthropic: es Anthropic quien se conecta al servidor, así que tiene que ser un servidor **remoto**, publicado en internet con una URL `https://`. Un servidor MCP que corre en tu computadora no sirve.

Se configura en dos partes:

```ts
// En la raíz de oficina.config.ts
mcpServers: [
  {
    name: 'tareas',
    url: 'https://…/mcp',
    tokenEnv: 'MCP_TAREAS_TOKEN',
    // Sólo estas herramientas del servidor; el resto queda apagado.
    allowedTools: ['buscar_tareas', 'leer_tarea'],
  },
],

// En el agente que lo usa
tools: { mcp: ['tareas'] },
```

Y el token, si el servidor lo pide, en la variable que nombra `tokenEnv`. Si falta esa variable, la oficina arranca igual y ningún agente usa ese servidor; el aviso queda en la consola del servidor.

Antes de conectar uno:

- **La URL sale de la documentación oficial del proveedor.** Muchos servicios publican su servidor MCP remoto oficial; buscalo en su documentación ("remote MCP server"). No uses URLs de terceros que no conozcas: el servidor ve todo lo que el agente le manda.
- **El token va como `Authorization: Bearer`.** Si el proveedor da una clave de API, es lo más simple. Si sólo ofrece iniciar sesión con OAuth, hay que conseguir un token de acceso y renovarlo cuando venza: la oficina no hace ese inicio de sesión por vos.
- **Empezá con permisos de sólo lectura**, en dos capas: un token de sólo lectura cuando el proveedor lo permita, y `allowedTools` con los nombres de las herramientas que lean. Los agentes trabajan sin que nadie apruebe cada llamada, y una instrucción escondida en un documento o una página podría intentar que hagan algo que no pediste. Con `allowedTools`, una herramienta nueva que sume el servidor tampoco se habilita sola.
- **Cada herramienta que el agente usa se paga en tokens**: lo que devuelve el servidor entra al contexto.
- Lo que devuelve el servidor se trata como datos, no como órdenes, igual que la web.

Qué conviene conectar según el equipo:

| Si el equipo… | Conectá | Para quién |
| --- | --- | --- |
| Trabaja con un gestor de tareas | El MCP de ese gestor (Linear, Asana, Jira, Notion…) | Producto, Desarrollo |
| Tiene la información en documentos | El MCP de esos documentos | Investigación, Contenido |
| Vende con un CRM | El MCP del CRM | Ventas, Marketing |
| Cobra online | El MCP de la plataforma de pagos, sólo lectura | Finanzas, Datos |
| Atiende clientes por una plataforma de soporte | El MCP de esa plataforma | Soporte |
| Monitorea errores de su aplicación | El MCP del servicio de monitoreo | Desarrollo |

## 5. Dónde corre

| Opción | Qué hace falta | Estado |
| --- | --- | --- |
| **En tu computadora** | Node 22, `npm install` y `npm run dev`. Se abre en `http://127.0.0.1:3011`. | Funciona. Se apaga cuando apagás la compu. |
| **Railway** | Una cuenta (plan Hobby, unos USD 5 por mes), un disco montado en `/data` y una contraseña. | Probado. Los pasos están en [Ponerla online](ARQUITECTURA.md#12-ponerla-online). |
| **Otro servidor Node** | Un proceso siempre prendido con disco permanente, `npm run build:online` y `npm run start:online`. | Debería funcionar igual; no está probado. |
| **Funciones serverless** (Vercel y similares) | — | No sirve: una consigna corre varios minutos dentro del proceso y el estado vive en memoria y en un archivo. |

Online, la oficina no abre sin `AI_OFFICE_PASSWORD` (12 caracteres o más) y sin un disco permanente.

## 6. Modo En vivo

Además de Demo y Agentes, hay un modo de sólo lectura que muestra sesiones de **Claude Code** en la app de escritorio de Claude para macOS: cada agente de la configuración mira la sesión cuyo título es igual a su `name`. Sólo funciona en la misma computadora y sólo en localhost, porque lee transcripts privados del disco. Las rutas se cambian con `AI_OFFICE_LIVE_PROJECT` (por defecto, la carpeta donde corre la oficina), `AI_OFFICE_SESSIONS_DIR` y `AI_OFFICE_TRANSCRIPTS_DIR`.
