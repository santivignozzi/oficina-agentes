# Arquitectura

## 1. Resumen de la solución

La oficina es un edificio 2D ilustrado, visto de frente y sin fachada, donde cada personaje es un agente. Lo que se ve no es decoración: la oficina dibuja un **contrato de estado** (`OfficeSnapshot`) y nada más. Si un agente camina, es porque cambió su `location`; si tiene un globo de alerta, es porque hay una entrega esperando revisión.

Ese contrato tiene tres fuentes, que la interfaz trata igual:

| Modo | De dónde sale el estado | Se puede intervenir |
| --- | --- | --- |
| **Demo** | Motor propio en el servidor que simula al equipo de `oficina.config.ts`. Todo se rotula como simulado. | Sí: asignar, pausar, aprobar, rechazar, pedir cambios, reasignar, detener. |
| **En vivo** | Sesiones reales de Claude Code en la app de escritorio de macOS, leídas de sus metadatos y transcripts. Cada agente mira la sesión que se llama como él. Sólo existe en esa computadora. | No: es de sólo lectura, y la interfaz explica por qué. |
| **Agentes** | El mismo motor que Demo, con el equipo de `oficina.config.ts` llamando de verdad a la API de Claude. Lo que entregan y lo que gastan queda en el disco. Es lo que corre online. | Sí, igual que en Demo. Sin clave se ve pero no recibe comandos. |

### Una sola configuración

Todo lo que cambia de una oficina a otra está en `oficina.config.ts`: el nombre, el tono, el modelo, la dirección y cada agente con su rol, cuándo darle trabajo, sus instrucciones, sus herramientas, su sala y su aspecto. `src/config/` la valida al arrancar (`defineOffice`) y la reparte: el edificio (`office/layout.ts`), los prompts (`server/agents/prompts.ts`), el equipo de Demo y Agentes y los escritorios de En vivo salen de ahí. Ningún otro archivo nombra a un agente.

### Por qué En vivo es de sólo lectura

Una web externa no puede escribirle a una sesión de la app de escritorio: no hay API para mandarle mensajes. Sí puede leerla, porque cada sesión deja rastros en el disco. El control real desde la oficina lo da el modo Agentes, que corre agentes propios en este servidor.

## 2. Decisiones tomadas

| Decisión | Por qué |
| --- | --- |
| **Phaser 3.90**, no el 4 | El pedido dice Phaser 3 y `latest` en npm ya es 4.2.1. Se fija la versión. |
| Motor Demo **en el servidor** y no en el navegador | Así el camino es el real desde el día uno: comando → orquestador → eventos → SSE → pantalla. Cambiar el ejecutor no toca la interfaz. |
| Demo y Agentes son **un solo motor** (`ManagedOffice`) con otra configuración | Cambian el ejecutor y el repositorio. Pausar, reasignar, detener y revisar se probaron una vez y valen para los dos. |
| Llamadas directas a la API con `@anthropic-ai/sdk` | Cada agente necesita una sola respuesta con búsqueda web o MCP, no un agente que recorra archivos. Así cada llamada se puede contar y frenar. |
| El equipo es **configuración, no código** | Quien recibe el repo arma el suyo sin tocar el motor. La dirección reparte por el id de cada agente y lee su `whenToUse`, así que un agente nuevo no pide cambios en el plan. |
| El edificio **se genera** del equipo | Planta baja fija, agentes de a dos por piso y la dirección arriba. Cada sala es una plantilla por estilo (`biblioteca`, `tecnica`, `creativa`) medida para media planta: entra a la izquierda o a la derecha sin retoques. |
| **Encabezados de seguridad** en todas las respuestas | CSP que sólo permite el propio servidor, sin `iframe` ajeno, `nosniff`, sin referrer y, online, HSTS. Ver `SECURITY.md`. |
| Herramientas externas por **MCP remoto** | El conector MCP de la API se conecta desde Anthropic: no hay que correr nada más. El token va en una variable de entorno, nunca en la configuración. |
| **Tope de gasto mensual** obligatorio | Antes de cada llamada se reserva su peor caso. Si no entra, no sale. Olvidarse la variable deja 5 dólares, no gasto sin límite. |
| El agente con `githubRepos` lee el repo con **Managed Agents** (beta) y no con herramientas propias | Recorrer un repo sí es trabajo de agente, y hacerlo a mano sería una versión peor de Claude Code. Anthropic corre el contenedor y guarda el token de GitHub fuera de él. Sin `AI_OFFICE_GITHUB_TOKEN`, ese agente propone a ciegas. |
| Qué repos lee **lo decide el token** | No hay una lista en el código: la dirección ve los repos que el token deja leer, escribe el nombre exacto en la subtarea y el agente abre esos. Sumar un repo es elegirlo en el token, sin tocar la oficina. |
| Si GitHub no entrega un repo, **el agente frena** | La sesión seguiría sin el código y el informe saldría de la página pública. Frenar cuesta centavos y dice qué revisar del token. |
| Cada sesión con repos tiene **su propio tope** y aparta el doble en el mensual | La sesión frena antes de cada pedido al modelo, pero el que cruza el tope se completa. Lo apartado queda en `gasto.json`: un reinicio corta el seguimiento, no la sesión, y al arrancar se la frena y se cobra. |
| **SSE** y no WebSockets | El estado sólo baja; los comandos suben por `POST`. Una ruta de Next alcanza y no pide un proceso aparte. |
| Postgres, Redis/BullMQ y LangGraph **detrás de interfaces** | El orquestador ya es un grafo de nodos (`plan → kickoff → work → consolidate → review`). Se conectan si alguna vez hace falta más de un servidor. |
| Arte **dibujado acá**, en SVG generado por código | Sin licencias de terceros. No se copió nada de `percheniy/office-for-claude-agents`. |
| En tu computadora el server escucha sólo en `127.0.0.1` | Los transcripts son privados. `next dev` escucha en todas las interfaces por defecto y los expondría a la red local. |
| Online, **un servidor siempre prendido** y no funciones serverless | Una consigna corre varios minutos dentro del proceso y el estado vive en memoria y en un archivo. Pasarla a funciones era reescribir el motor; un servidor chico cuesta unos USD 5 por mes. |
| Online, **una contraseña** y no usuarios | La usás una persona. Una cookie firmada alcanza, y cambiar la contraseña cierra todas las sesiones. |
| `AI_OFFICE_ONLINE` lo fija el script de npm | No se deduce del pedido: el `Host` se puede falsificar y le abriría la puerta a cualquiera. |
| Sin contraseña o sin disco, **no abre** | Olvidarse una variable no puede dejar la oficina abierta ni perder entregas pagas en el próximo deploy. `/api/salud` dice qué falta y nadie puede entrar, aunque Railway muestre el deploy en verde. |
| Costos en En vivo: **no se muestran** | Hay tokens reales, pero no un costo actualizado por sesión. Preferimos no inventarlo. |
| Esperar tu revisión **no ocupa a nadie** | La entrega queda en el mostrador y el agente sigue con lo próximo; tu decisión retoma el grafo cuando llega. Antes, una revisión olvidada frenaba la cola entera. |
| Cancelar **no es fallar** | Lo decidiste vos: la tarea queda `cancelled`, con el motivo, sin alarma y fuera de la cuenta de fallidas. Lo que dependía de ella se cae como cancelado, no como error. |
| Un agente puede ser **opcional** | Cada subtarea es una llamada paga. Si su `whenToUse` empieza con "Sólo si…", la dirección lo suma únicamente cuando la consigna lo pide. |
| Sacar un agente **no pierde su trabajo** | Al arrancar, lo que estaba a su nombre pasa a la dirección: una entrega que esperaba revisión se puede cerrar igual. |

## 3. Cómo lee En vivo los transcripts

Decisiones del lector de sesiones, tomadas midiendo transcripts reales de Claude Code:

| Dato medido | Consecuencia |
| --- | --- |
| Cada bloque de una respuesta repite el `usage` del mensaje | Sumar crudo daba casi 4 veces los tokens reales. Se deduplica por `message.id`. |
| El `mtime` de un archivo no indica actividad | La actividad sale del último `timestamp` de los registros. |
| El `custom-title` del transcript puede ir atrasado respecto del título en la app | La identidad sale de `claude-code-sessions/**/local_*.json`, que además mapea `local_…` → transcript. El JSONL queda de respaldo. |
| Herramientas: p50 0,7 s, p90 11,7 s, p99 85 s | Una herramienta sin respuesta hace más de 2 minutos se marca como "puede estar esperando aprobación". No se afirma que lo esté. |
| `SendMessage` trae `to`, `summary` y `message`; al receptor le llega como `user` con `origin.kind: "peer"` | Alcanza para dibujar la charla entre agentes, de los dos lados. |

## 4. Arquitectura

```
┌────────────────────────── Navegador ──────────────────────────┐
│  React + Tailwind (paneles)      Phaser 3 (motor visual)      │
│         │       ▲                      ▲                      │
│  comandos       └ useOfficeStream(modo) ┘ OfficeSnapshot      │
└─────────┼───────────────┬─────────────────────────────────────┘
     POST /api/office/commands      GET /api/office/stream (SSE)
          │               │
┌─────────▼───────────────┴──────────── Servidor Node ──────────┐
│  server/runtime: una oficina por modo y por proceso           │
│                                                               │
│  ManagedOffice (Demo y Agentes)     LiveOffice (sólo lectura) │
│   ├ Orchestrator (grafo)             ├ app-sessions           │
│   ├ AgentRunner ← puerto             │   metadatos de la app  │
│   │   ├ Demo: ScriptedRunner         ├ transcript             │
│   │   └ Agentes: ClaudeRunner        │   lector incremental   │
│   ├ JobQueue ← puerto                └ snapshot               │
│   │   └ InlineQueue (mañana: BullMQ)                          │
│   └ OfficeRepository ← puerto                                 │
│       ├ Demo: MemoryRepository                                │
│       └ Agentes: FileRepository (mañana: Postgres)            │
└───────────────────────────────────────────────────────────────┘
```

Online se suma una capa adelante: `proxy.ts` pide la sesión antes de cualquier página o API, salvo `/entrar`, `/api/acceso` y `/api/salud`.

### Reglas de separación

- `domain/` no importa nada del resto: tipos, comandos y selectores puros.
- `office/` (Phaser) no conoce React ni el servidor: recibe un `OfficeSnapshot`, emite clics.
- `components/` no conoce Phaser: sólo `office-stage.tsx` toca la fachada `OfficeGame`, y lo demás usa los hooks de `client/`.
- `server/` no conoce la pantalla: publica snapshots.
- Los agentes son datos de `oficina.config.ts`: ver [cómo cambiar el equipo](#10-cómo-cambiar-el-equipo). Su personaje se genera de `look`.

### Flujo de una consigna en Demo y Agentes

1. El humano escribe la consigna: se crea la tarea raíz y la dirección la toma.
2. **plan**: la dirección la divide en subtareas y elige quién hace cada una por su id, leyendo el `whenToUse` de cada agente.
3. **kickoff**: se reúnen en la sala; la pizarra muestra las subtareas.
4. **work**: cada agente trabaja en su sala, respetando dependencias. Quien termina algo que otro necesita camina hasta su escritorio para derivárselo.
5. **consolidate**: la dirección junta los resultados y arma la entrega.
6. **review**: la dirección deja la entrega en la recepción. Si no tiene otra cosa, te espera ahí con un globo de alerta; si llegó otra consigna, la toma y la entrega sigue esperando en el mostrador. Aprobar o rechazar la cierra. Pedir cambios vuelve a **work**, y la dirección lo atiende antes que una consigna nueva.

Las tareas directas siguen el mismo criterio: al entregar, el agente arranca lo próximo de su cola. Si pedís cambios, la tarea vuelve a la cola de quien elijas.

## 5. Estructura de carpetas

```
oficina.config.ts       El equipo: el único archivo que hace falta tocar
.claude/skills/configurar-oficina/  La guía que sigue Claude Code para armarla
src/
  config/               Valida la configuración y la reparte al resto
  app/                  Rutas de Next: página y API
    api/office/stream/    SSE con el snapshot
    api/office/commands/  Comandos del humano
    api/acceso/           Entrar y salir, sólo online
    api/salud/            Verificación de salud del deploy
    entrar/               Pantalla de contraseña
  proxy.ts              Puerta de entrada online: sin sesión no se pasa
  domain/               Contrato: entidades, comandos, selectores
  server/
    ports.ts            OfficeRepository, JobQueue, AgentRunner
    runtime.ts          Instancias únicas por proceso
    http.ts             Guardas de las rutas: quién tiene acceso y mismo origen
    access.ts           Contraseña, sesión firmada y qué falta para abrir online
    shutdown.ts         Al apagarse: cierra los streams y guarda lo pendiente
    engine/             ManagedOffice: orquestador, estado, cola y repositorio en memoria
    demo/               Configuración Demo: datos de ejemplo y ejecutor simulado
    agents/             Configuración Agentes: ejecutor real con búsqueda y MCP, sesiones sobre el repo, prompts, precios, tope y archivo
    live/               Lector de sesiones reales
  office/               Motor visual Phaser, sin React
    game.ts             Fachada: recibe snapshots, emite clics, maneja cámara y densidad
    scene.ts            Mundo, ambiente, pizarra, efectos y reacción a eventos
    character.ts        Personaje: partes, poses, caminata, globos y cartel
    layout.ts           Plano del edificio: genera pisos, salas y escritorios a partir del equipo.
    elevator.ts         Ascensor visual: se mueve sólo cuando un agente cambia de piso.
    art/                Arte en SVG generado por código
  client/               Hooks de React: estado y tema
  components/           Interfaz: barra, paneles, revisión, tablero
db/schema.sql           Modelo de datos listo para Postgres, sin aplicar
```

## 6. Modelo de datos

Las entidades están en `src/domain/types.ts` y su versión SQL en `db/schema.sql`.

- **Agent**: identidad, rol, herramientas, `capability` (`manager` en la dirección, el id en los demás), `appearance`, `status`, `location`, `activity`, tokens.
- **Task**: `id`, título, descripción, estado (`pending`, `in_progress`, `waiting_review`, `done`, `failed`, `cancelled`), prioridad, agente asignado, timestamps, `output`, costo estimado. Agrega `parentId`, `dependsOn` y `revision`.
- **Assignment**: quién le asignó qué tarea a quién y cuándo se soltó. Es el historial de reasignaciones.
- **OfficeEvent**: mensaje o evento con `channel` (`system`, `log`, `reasoning`, `message`).
- **Deliverable**: entrega con su revisión humana. Si cancelás o detenés su tarea mientras espera, queda `cancelled`.

## 7. Plan por etapas

| Etapa | Qué incluye | Estado |
| --- | --- | --- |
| 1. Oficina y Demo | Oficina, motor simulado, supervisión, human-in-the-loop | Hecha |
| 2. En vivo | Lectura de sesiones de Claude Code | Hecha |
| 3. Agentes propios | `ClaudeRunner` sobre la API de Claude, con tope de gasto. Es lo que da control real desde la oficina. | Hecha. |
| 4. Online | Contraseña, disco permanente y revisiones que sobreviven a un reinicio. El archivo alcanza para un servidor; `PostgresRepository` y `BullMQ` hacen falta recién con más de uno. | Hecha. Probada en Railway. |
| 5. Lectura de repos | `RepoWorker` sobre Managed Agents, sólo lectura, con los repos que deja leer el token y sus sitios. | Hecha. Una sesión con dos repos y sus sitios costó USD 0,14 en 77 s. |
| 6. Configurable | El equipo, el edificio y las integraciones salen de `oficina.config.ts`, con una guía para que Claude Code la arme conversando. MCP remoto por agente. | Hecha. El conector MCP se probó contra una API falsa, no contra un servidor real. |
| 7. Escalar | Más de 6 agentes, más estilos de sala, permisos por agente y retomar lo que corta un reinicio. | Pendiente |

## 8. Cargar la API

Se carga una sola vez, en un archivo que git ignora:

```bash
cp .env.example .env.local
```

Después se pega la clave en `ANTHROPIC_API_KEY`, se reinicia `npm run dev` y se abre `?modo=agentes`. El modelo y el tope se eligen en el mismo archivo. Sin clave, el modo se ve pero rechaza los comandos: no hay forma de gastar por accidente.

El gasto y el trabajo quedan en `.data/`. Lo que estaba en curso al reiniciar queda marcado como fallido, con el motivo, y hay que volver a mandarlo. Lo que espera tu revisión queda intacto: se puede aprobar, rechazar o pedir cambios sin pagar de nuevo lo que ya estaba hecho.

Online, las mismas variables se cargan en el servidor: ver [Ponerla online](#12-ponerla-online).

## 9. Cuánto consume

Los precios son los de lista de la página oficial de Anthropic al 2/11/2026 y están en `server/agents/pricing.ts`. Los prompts son los reales. **El consumo de las tablas es una estimación hecha antes de cualquier llamada paga.**

Lo medido hasta ahora: una sesión del agente de repos que analizó dos repos y sus sitios costó USD 0,14.

Costo por consigna completa, de principio a fin:

| Consigna | Llamadas | Entrada | Salida | Búsquedas | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Liviana: un agente sin búsquedas | 3 | 1,7 k | 6 k | 0 | USD 0,13 | USD 0,06 | USD 0,003 |
| Típica: uno con 3 búsquedas y otro sin | 4 | 66 k | 7,9 k | 3 | USD 0,45 | USD 0,24 | USD 0,04 |
| Pesada: 2 subtareas con 5 búsquedas, otra sin y 1 pedido de cambios | 7 | 326 k | 15 k | 10 | USD 1,71 | USD 0,90 | USD 0,14 |

Por mes, con consignas típicas:

| Consignas | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| --- | --- | --- | --- |
| 20 | USD 9 | USD 5 | USD 0,80 |
| 100 | USD 45 | USD 24 | USD 4 |

De qué depende:

- **Supuestos sin medir:** cada búsqueda suma 10 k tokens que se vuelven a leer en cada vuelta, el pensamiento ocupa tanto como el texto visible y una palabra son 1,6 tokens. Moviendo esos supuestos, la típica queda entre USD 0,29 y 0,65 en Opus, entre 0,16 y 0,34 en Sonnet y entre 0,04 y 0,05 en Haiku.
- **Lo que más pesa son las búsquedas:** 60 k de los 66 k tokens de entrada de la típica son resultados. Para bajar el costo, lo primero es `MAX_SEARCHES` en `claude-runner.ts`.
- **Cada búsqueda cuesta además USD 0,01.** Por eso en Haiku esa tarifa es casi todo el costo.
- **Cada agente más en una consigna** paga una llamada más; si busca en la web, del tamaño de la que tiene búsquedas. Lo que devuelve un servidor MCP también entra al contexto y no se midió.
- **El tope frena antes de lo que parece:** una llamada no sale si su peor caso no entra. El de un agente con búsqueda web es USD 1,19 en Opus, 0,62 en Sonnet y 0,19 en Haiku. Con el tope de USD 5 entran unas 9 consignas típicas en Opus y unas 19 en Sonnet.

Se recomienda empezar con Sonnet 5.5, que es lo que trae la configuración de ejemplo, y arrancar con una consigna liviana para comparar el gasto real contra esta tabla.

**La lectura de repos no está en la tabla.** Se cobra por tokens, con los mismos precios, más USD 0,08 por hora de sesión corriendo. Cada sesión tiene su tope, `AI_OFFICE_REPO_SESSION_USD` (1 por defecto), y antes de arrancar aparta el doble del tope mensual. El costo que ve la oficina es el que informa Anthropic, redondeado al centavo.

## 10. Cómo cambiar el equipo

Lo más simple es pedírselo a Claude Code, que sigue `.claude/skills/configurar-oficina`. A mano:

- **Agente nuevo:** una entrada en `agents` de `oficina.config.ts`. Aparece en Demo, Agentes y En vivo, con su sala, aunque ya haya datos guardados. La dirección lo empieza a usar sola: lee su `whenToUse`.
- **Sacar un agente:** borrar su entrada. Lo que tenía a su nombre pasa a la dirección.
- **Orden:** los agentes se ubican de a dos por piso en el orden de la lista. Con un número impar, el último piso suma un rincón para descansar.
- **Cambiar el id** de un agente ya usado equivale a sacarlo y sumar otro.
- **Máximo:** 6 agentes más la dirección. Con más, la sala de reuniones y el mostrador de revisión se superponen (`SLOTS` en `office/layout.ts`).
- **Pisos y ascensor:** cada piso por encima de cuatro suma 1,5 s a lo que el servidor espera a que bajen a la reunión (`MEETING_WALK_MS`).
- **Estilo de sala nuevo:** una plantilla en `ROOMS` de `office/layout.ts`, con medidas desde el borde izquierdo de la sala y que entre en media planta (unos 570 px). Si usa muebles nuevos, van en `art/furniture.ts`.
- **Otro proveedor de modelos:** hay que implementar `AgentRunner` (`plan`, `work`, `consolidate`). El contexto trae `log`, `reason`, `progress`, `usage` y `checkpoint`, así que pausar, detener y reasignar no tocan el orquestador.

## 11. Límites conocidos

### Agentes

- **La API real se usó con pocas consignas.** El resto de las pruebas corrió contra un servidor falso que imita el streaming, así que otros modelos y los errores de la API real todavía pueden mostrar diferencias. El conector MCP sólo se probó así.
- El gasto que muestra la oficina es una cuenta propia. La factura de Anthropic es la que vale.
- Al detener una llamada, lo cobrado hasta el corte es aproximado, porque la API informa el uso al final.
- Pausar no corta la llamada en curso: la pausa se nota cuando esa respuesta termina.
- Sin `AI_OFFICE_GITHUB_TOKEN`, ningún agente ve repositorios ni corre código: proponen. Lo que traen la web y los servidores MCP se trata como datos, no como órdenes.
- Un servidor MCP con token que vence (OAuth) deja de andar hasta que se renueva la variable. La oficina no hace el inicio de sesión.
- Con el token, el agente de repos lee los que el token deja ver: los 50 con cambios más recientes. Abre uno sólo si la tarea lo nombra tal cual; si no nombra ninguno, propone sin ver el código y lo dice.
- La red de ese agente sólo llega a los sitios cargados en **Website** de cada repo en GitHub, con sus redirecciones. Un repo sin ese dato se lee igual, pero su sitio no se abre. No puede escribir ni abrir pull requests: el token es de sólo lectura.
- Managed Agents está en beta y no admite Zero Data Retention: las sesiones y lo que el agente leyó del código quedan guardados en Anthropic hasta borrarlos. La oficina no las borra.
- Una sesión de repos que se corta no se retoma: se frena y se cobra lo gastado.
- La dirección atiende una consigna a la vez y cada agente, una tarea. Esperar tu revisión no ocupa a nadie, pero los cambios que pedís en una consigna esperan a que la dirección termine el tramo que tiene entre manos: si está supervisando otra, tardan lo que tarde esa.
- Los cambios en una tarea directa van al final de la cola de ese agente.
- En Demo, el primer agente de la lista siempre releva y entran los que comparten palabras con la consigna en su `whenToUse`, rol o nombre. Con agentes reales lo decide la dirección.
- La interfaz está en español. Los agentes escriben en el idioma que diga `voice`.
- Un reinicio corta lo que estaba corriendo y lo que esperaba turno: queda fallido, con el motivo, y lo ya gastado en esa corrida no vuelve. Una pausa tampoco sobrevive.

### Oficina

- El Demo vive en la memoria del proceso: se pierde al reiniciar y no corre en funciones serverless.
- En vivo depende de formatos internos de la app de escritorio. Si cambian, el lector los ignora en lugar de fallar y lo informa en el panel.
- La oficina muestra el estado que dejan los transcripts: no ve lo que la app no escribe en el disco.
- La oficina del celular muestra una parte del plano y se recorre arrastrando: entera, a 375 px, los personajes quedarían demasiado chicos para tocarlos.
- Un viaje entre pisos puede tardar más que los 2,6 s de la caminata del servidor, así que un estado nuevo puede aparecer antes de que el personaje llegue. La excepción es la sala de reuniones: ahí el servidor espera 7,5 s con cuatro pisos, más 1,5 s por piso extra.
- En la revisión, las cabezas de quienes esperan tapan parte del logo de la recepción.
- Cuantos más pisos, más chico se ve el edificio: en la compu entra entero y en el celular los personajes se achican.
- El rendimiento se midió con tres agentes y tres pisos, y sólo en JavaScript, con el panel oculto: 1,2 ms por cuadro sin actividad, 3,3 ms de promedio con una consigna corriendo y 16,8 ms en el peor cuadro, sacando capturas. La GPU no se midió.

### Online

- **En Railway corrieron pocas consignas reales.** Llegó a revisión y la oficina siguió andando después de un reinicio. Las pruebas a fondo de reinicios y cortes se hicieron con `next start` en modo online, contra la API falsa.
- **El verde de Railway no confirma que funcione.** Llegó a marcar como exitoso un deploy con `/api/salud` en 503. Lo que confirma es `{"ok":true}` en esa ruta.
- En vivo no existe online: los transcripts están en tu computadora.
- Hay un solo proceso con un solo disco, sin réplicas. Cada deploy deja la oficina afuera unos segundos: la pantalla dice "Reconectando" y vuelve sola.
- Railway corta las conexiones HTTP a los 15 minutos. El stream se reabre solo.
- La contraseña es una sola y la sesión dura 30 días.
- El límite de intentos es global y vive en memoria: 20 fallidos en 10 minutos frenan a todos por 10 minutos, también con la contraseña correcta. Una sesión abierta sigue andando y reiniciar lo borra.

## 12. Ponerla online

Esto deja la oficina prendida aunque tu computadora esté apagada. Los pasos son en la cuenta de Railway y las claves se pegan ahí, nunca en el código.

1. Creá una cuenta en [Railway](https://railway.com) con el plan Hobby: USD 5 por mes, con USD 5 de consumo incluidos.
2. **New Project → Deploy from GitHub repo** y elegí este repositorio. Toma la configuración de `railway.json`. Puede quedar en verde aunque falten la contraseña y el disco.
3. Agregá un **Volume** al servicio, montado en `/data`. Ahí quedan el trabajo y el gasto, y la oficina lo encuentra sola.
4. En **Variables**, cargá:
   - `AI_OFFICE_PASSWORD`: la contraseña para entrar, de 12 caracteres o más.
   - `ANTHROPIC_API_KEY`: sin esta clave la oficina se ve, pero no recibe comandos.
   - `AI_OFFICE_MODEL`: opcional. Pisa el modelo de `oficina.config.ts` sin tocar el código.
   - `AI_OFFICE_BUDGET_USD`: el tope de gasto por mes.
   - `AI_OFFICE_GITHUB_TOKEN`: opcional. Un token fine-grained con `Contents: Read` en los repos que quieras que lea el agente con `githubRepos`. Con **All repositories**, lee todos los tuyos.
   - `AI_OFFICE_REPO_SESSION_USD`: opcional. El tope de cada sesión de ese agente; si no está, es 1.
   - Los tokens de los servidores MCP, cada uno con el nombre de su `tokenEnv`.

   Van en la pestaña **Variables** del servicio. Las de **Shared Variables**, en la configuración del proyecto, no le llegan solas.
5. Tocá **Deploy** en el aviso de cambios pendientes. Hasta entonces, el disco y las variables no se aplican.
6. En **Settings → Networking**, tocá **Generate Domain**. Esa es la dirección de tu oficina.

Para confirmar que funciona, abrí esa dirección con `/api/salud` al final. `{"ok":true}` quiere decir que está todo; si algo falta, ahí dice qué es.

**Costo.** En esta máquina el servidor midió 111 MB de memoria y casi nada de CPU sin trabajo, lo que entra en los USD 5 incluidos. La API de Claude se paga aparte, en Anthropic: ver [Cuánto consume](#9-cuánto-consume).

**Para probar en tu computadora como si fuera online:**

```bash
npm run build:online
```

```bash
AI_OFFICE_PASSWORD=una-contrasena-larga AI_OFFICE_DATA_DIR=.data npm run start:online
```

Abrila en `http://localhost:3000`: la cookie de sesión es `Secure`, y así se probó.
