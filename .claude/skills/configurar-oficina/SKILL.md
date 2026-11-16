---
name: configurar-oficina
description: Arma o cambia la oficina de agentes de este repo conversando con la persona. Se usa cuando alguien recién recibe el repo, pide "configurá mi oficina", quiere elegir o cambiar agentes, su diseño, cómo funcionan o qué APIs y servidores MCP conectar, o pregunta cómo ponerla online.
---

# Configurar la oficina

Tu trabajo es dejar la oficina andando para esta persona, con el equipo que necesita, sin que tenga que leer código. Conversás, proponés y escribís vos los archivos. La persona decide; vos recomendás.

Todo lo que cambia de una oficina a otra está en **`oficina.config.ts`**. Su forma, campo por campo, está en `src/config/schema.ts`. No toques otro archivo para cambiar el equipo: el edificio, los prompts, la demo y el modo Agentes se arman solos a partir de esa configuración.

Material de apoyo, leelo cuando llegues a esa parte:

- `.claude/skills/configurar-oficina/catalogo-agentes.md`: agentes listos para proponer, con su configuración.
- `docs/INTEGRACIONES.md`: modelos, búsqueda web, GitHub, servidores MCP y dónde publicarla, con precios.
- `docs/ARQUITECTURA.md`: cómo funciona por dentro, si la persona lo pregunta.

## Cómo conversar

- Hablá en el idioma de la persona. Si no es español, avisale una vez que la interfaz de la oficina está en español y que los agentes van a escribir en su idioma (eso se define en `voice`).
- Una pregunta por vez, o un bloque chico de preguntas relacionadas. Si la herramienta `AskUserQuestion` está disponible, usala para las elecciones con opciones claras.
- Siempre con una propuesta concreta y tu recomendación primero. "¿Qué agentes querés?" es una mala pregunta; "Para lo que contás te propongo estos tres, ¿sumamos o sacamos alguno?" es una buena.
- Si la persona dice "elegí vos" o "lo que recomiendes", decidí y seguí: no la frenes con más preguntas.
- Explicá con palabras simples. Nada de jerga sin explicar: si decís MCP, aclará en una línea qué es.
- Nunca le pidas que pegue una clave o un token en el chat. Las claves van en `.env.local` (en su computadora) o en las variables del servidor; vos le decís en qué variable y dónde.

## Paso 0: ver dónde está parado

Antes de preguntar nada:

1. Leé `oficina.config.ts` y fijate si ya está personalizada o es la de ejemplo (la de ejemplo tiene Dirección, Investigación, Desarrollo y Marketing).
2. Fijate si existe `.env.local` y si tiene `ANTHROPIC_API_KEY` cargada (sin mostrar su valor).
3. Corré `node --version`: hace falta Node 22. Si no está o es otra versión, decíselo y explicá cómo instalarlo antes de seguir.
4. Si no está `node_modules`, corré `npm install`.

Si la oficina ya está configurada y la persona quiere cambiar algo puntual (sumar un agente, cambiar un color, conectar un MCP), andá directo a ese paso.

## Paso 1: para qué la quiere

Preguntá, en una sola tanda:

- **Qué trabajo quiere delegar.** Pedí ejemplos de dos o tres pedidos reales que le haría al equipo. Esto define todo lo demás.
- **Cómo se llama la oficina.** Va en el cartel del techo. Si no le importa, proponé uno a partir de su proyecto o su negocio.
- **En qué idioma y con qué tono escriben los agentes.** Proponé uno según cómo te escribe (por ejemplo, "español rioplatense, con voseo, claro y sin relleno").

Con eso completás `name` y `voice`.

## Paso 2: el equipo

1. Leé `catalogo-agentes.md` y, con los ejemplos del paso 1, proponé un equipo de **2 a 4 agentes** (el máximo es 6, más la dirección). Para cada uno, una línea: qué hace y por qué lo sumás.
2. Recomendá empezar chico: cada agente que participa de una consigna es una llamada paga, y un equipo de tres ya cubre la mayoría de los casos. Se pueden sumar después.
3. Preguntá si quiere ponerles nombre propio o dejarlos con el nombre de su rol. Las dos cosas funcionan.
4. Si pide un agente que no está en el catálogo, armalo vos siguiendo el mismo formato. Lo que más importa:
   - `whenToUse`: es lo único que lee la dirección para repartir. Tiene que decir con claridad qué le toca y qué no. Si es opcional, empezá por "Sólo si…".
   - `instructions`: cómo trabaja y qué entrega, con un límite de palabras (la salida es lo más caro de cada llamada). Pedile que separe hechos de supuestos.
5. La **dirección** siempre está: recibe la consigna, reparte, junta los resultados y te pide aprobación. Sólo se le cambian el nombre, el aspecto y, si hace falta, instrucciones extra.

El orden de la lista importa: los agentes se ubican de a dos por piso, de abajo hacia arriba, y en la demo el primero es el que siempre arranca relevando.

## Paso 3: el diseño de la oficina

El edificio se arma solo: planta baja con sala de reuniones y recepción, los agentes de a dos por piso y la dirección arriba de todo. Lo que se elige por agente:

- **Sala** (`room.style`):
  - `biblioteca`: biblioteca, sillón y pizarra con gráficos. Para investigar, analizar, escribir.
  - `tecnica`: monitores dobles, rack de servidores y código en la pared. Para lo técnico y los datos.
  - `creativa`: tablero de inspiración, cartel de neón y tonos rosados. Para marketing, contenido, diseño, ventas.
- **Cartel de la sala** (`room.label`): en mayúsculas, corto.
- **Personaje** (`look`): color de piel, pelo (`hairStyle`: `bob`, `curly`, `short`, `bun`, `buzz`, `long`), color de pelo, ropa (`outfitStyle`: `blazer`, `sweater`, `hoodie`, `shirt`), color de ropa, accesorio (`glasses`, `headset`, `none`) y `accent`, el color que lo identifica en los paneles. Todos los colores en formato `#RRGGBB`.

Proponé una sala y un aspecto para cada uno, con colores de `accent` bien distintos entre sí, y preguntá si quiere cambiar algo. Si no le importa, dejá tu propuesta.

## Paso 4: cómo funciona

Explicá el circuito en cuatro líneas, para que sepa qué esperar:

1. Escribe una consigna. La dirección la divide en subtareas y elige quién hace cada una.
2. Se reúnen en la sala de reuniones, cada uno vuelve a su sala y trabaja. Lo ve en vivo.
3. La dirección junta todo en una entrega y la deja en la recepción.
4. Ella aprueba, rechaza o pide cambios. Nada se da por terminado sin su revisión.

También puede asignarle una tarea directa a un agente, pausar, reasignar o detener todo.

Después decidí con ella:

- **Cuántas subtareas por consigna** (`maxSubtasks`, entre 1 y 6). Recomendá 3: más subtareas, más costo y más tiempo.
- **Modelo.** Leé la sección de modelos de `docs/INTEGRACIONES.md` y recomendá. Para empezar, Sonnet 5.5 en todos es un buen equilibrio; Opus 5.5 en la dirección si la calidad del plan y la entrega importa más que el costo; Haiku 5.5 para pruebas baratas. Se puede poner un `model` distinto por agente.
- **Tope de gasto por mes** (`AI_OFFICE_BUDGET_USD`, por defecto 5 dólares). Dale una idea de cuánto alcanza con la tabla de costos de `docs/INTEGRACIONES.md`.

## Paso 5: herramientas e integraciones

Para cada agente, decidí qué herramientas necesita según su trabajo. Leé `docs/INTEGRACIONES.md` y explicá sólo lo que aplique:

- **Búsqueda web** (`tools.webSearch`): para investigar, mirar el mercado o confirmar datos. Cuesta USD 0,01 por búsqueda además de los tokens.
- **Leer repositorios de GitHub** (`tools.githubRepos`, sólo un agente): lee el código y abre los sitios de los repos que deje un token de sólo lectura. Usa Managed Agents, que está en beta. Ofrecelo sólo si tiene código que quiere que el equipo analice.
- **Servidores MCP** (`mcpServers` y `tools.mcp`): conectan a un agente con otras herramientas (gestor de tareas, documentos, CRM, pagos…). Preguntá qué herramientas usa en su trabajo y proponé sólo las que sumen a lo que contó en el paso 1. Reglas:
  - Tiene que ser un servidor MCP **remoto**, con URL `https://`. Buscá la URL en la documentación oficial del proveedor; no la inventes ni la adivines. Si no la encontrás, decilo.
  - Si pide token, va en una variable de entorno (`tokenEnv`), nunca en el archivo. Explicá de dónde sacar el token según la documentación del proveedor. Si el proveedor sólo ofrece inicio de sesión con OAuth, avisá que el token vence y que hay que renovarlo a mano.
  - Recomendá empezar con permisos de sólo lectura cuando el proveedor lo permita, y completá `allowedTools` con las herramientas de lectura del servidor (sus nombres salen de la documentación del proveedor). Los agentes trabajan sin que nadie apruebe cada acción. Si la persona quiere herramientas que escriben, explicale el riesgo en una línea y que lo decida ella.

## Paso 6: escribir y mostrar

1. Escribí `oficina.config.ts` completo, con comentarios breves en el idioma de la persona donde ayuden.
2. Corré `npm run typecheck`. Si `defineOffice` se queja, el mensaje dice qué corregir.
3. Levantá la oficina con `npm run dev` y, si podés, sacale una captura a `http://127.0.0.1:3011` con Playwright para mirar el resultado vos antes de mostrarlo. Revisá que cada agente esté en su sala y que los carteles se lean.
4. Probá una consigna en modo **Demo** (no gasta nada) con uno de los ejemplos del paso 1 y fijate que la dirección reparta a quien corresponde. En la demo el reparto es por palabras en común con `whenToUse`, así que es aproximado; con agentes reales decide el modelo.
5. Mostrale la captura o decile que abra la dirección, y preguntá qué cambiaría.

## Paso 7: claves y primera consigna real

1. Copiá `.env.example` a `.env.local` si no existe.
2. Explicale que tiene que pegar su clave de Anthropic en `ANTHROPIC_API_KEY` dentro de `.env.local` (se saca en console.anthropic.com, en API Keys) y, si corresponde, los tokens de GitHub y de cada MCP en sus variables. Que lo haga ella: vos no la ves ni la pedís.
3. Con la clave cargada, reiniciá `npm run dev` y que abra `http://127.0.0.1:3011/?modo=agentes`.
4. Recomendá una primera consigna liviana para comparar el gasto real con la estimación.

## Paso 8: ponerla online (opcional)

Si quiere usarla desde el celular o con la compu apagada, seguí la sección "Ponerla online" de `docs/ARQUITECTURA.md` (Railway, unos USD 5 por mes). Recordale que online la oficina exige contraseña (`AI_OFFICE_PASSWORD`, 12 caracteres o más) y un disco permanente, y que las mismas variables de `.env.local` se cargan en el servidor.

Si el repo es una copia que la persona va a publicar, verificá antes que `.env.local` y `.data/` estén en `.gitignore` (ya vienen así) y que no haya claves en ningún archivo versionado. Recomendá que el repo sea privado y que active en GitHub lo que lista `SECURITY.md`.

## Al terminar

Resumile en pocas líneas:

- El equipo, con qué hace cada uno y sus herramientas.
- Qué modelo usa y el tope de gasto.
- Qué le falta hacer a ella (claves, deploy) y en qué orden.
- Que para cambiar algo después alcanza con pedírtelo: "sumá un agente de ventas", "cambiá el color de Investigación", "conectá Notion".
