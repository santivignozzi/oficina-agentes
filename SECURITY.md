# Seguridad

La oficina maneja cosas sensibles: tu clave de Anthropic, que gasta plata; tokens de GitHub y de otros servicios; y lo que entregan los agentes. Este documento cuenta qué protege el código, qué te toca a vos y cómo avisar de un problema.

## Cómo reportar una vulnerabilidad

No abras un issue público. Usá **Security → Report a vulnerability** en este repositorio (hay que activar *Private vulnerability reporting* en **Settings → Code security**). Contá qué encontraste, cómo reproducirlo y qué impacto tiene.

## Qué protege el código

**Acceso**

- En tu computadora el servidor escucha sólo en `127.0.0.1`, y los comandos se aceptan sólo si el pedido llega a `localhost`. Eso frena a otras máquinas de la red y los ataques de *DNS rebinding*.
- Online no abre sin `AI_OFFICE_PASSWORD` (12 caracteres o más) ni sin un disco permanente. El modo online lo fija el script de arranque, no el pedido: el encabezado `Host` no alcanza para saltear la contraseña.
- La contraseña se compara en tiempo constante. Los intentos fallidos tienen demora y un límite global (20 cada 10 minutos).
- La sesión es una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, firmada con HMAC-SHA256 a partir de la contraseña: cambiarla cierra todas las sesiones.
- Los comandos exigen sesión y que el pedido salga de la misma oficina (encabezado `Origin`), así otra web no puede hacer gastar a tu navegador.

**Navegador**

- Política de seguridad de contenido (CSP): scripts, estilos, imágenes, fuentes y conexiones sólo del propio servidor; sin `<object>`, sin formularios hacia afuera y sin poder meter la oficina en un `<iframe>`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restrictiva, aislamiento entre orígenes y, online, HSTS.
- Lo que escriben los agentes se muestra armando nodos de React, nunca como HTML, y sin enlaces: un texto malicioso no puede ejecutar código en tu navegador.

**Claves y gasto**

- Las claves sólo se leen de variables de entorno. `.env*` y `.data/` están en `.gitignore`.
- La clave de Anthropic va siempre a `api.anthropic.com`. Las variables para apuntar a un servidor falso de pruebas se ignoran online.
- El token de GitHub no entra al contenedor de Managed Agents: lo inyecta Anthropic del lado de su proxy. El agente sólo puede leer, y su red llega sólo a los sitios de tus repos.
- Tope de gasto mensual obligatorio (5 dólares si no se configura) y tope por sesión de repos. Antes de cada llamada se aparta su peor caso; si no entra, no sale.
- Un modelo sin precio cargado no corre, para que el tope no se pueda saltear.
- Los archivos de datos se guardan con permisos `600`, en una carpeta `700`.

**Agentes y contenido externo**

- Lo que llega de la web, de los repos y de los servidores MCP se marca en los prompts como datos, nunca como instrucciones.
- Los servidores MCP tienen que ser `https://` y su token va en una variable, nunca en la configuración.
- `allowedTools` limita qué herramientas de cada servidor MCP pueden usar los agentes. Con la lista, cualquier herramienta nueva del servidor queda apagada.
- La configuración se valida al arrancar: ids, colores, servidores MCP y que sólo un agente lea repos.

**Repositorio**

- CI en cada cambio: `npm audit` (falla con vulnerabilidades altas), tipos, lint y build.
- CodeQL con las consultas de seguridad extendidas, en cada cambio y cada semana.
- Dependabot para dependencias de npm y para las acciones de GitHub.
- Las acciones de GitHub van fijadas por commit, con permisos de sólo lectura y sin dejar credenciales en el checkout.
- Las dependencias van con versión exacta y `package-lock.json`.

## Qué te toca a vos

**En GitHub**

1. Dejá el repo **privado** si tiene tu configuración.
2. En **Settings → Code security**, activá *Dependabot alerts*, *Dependabot security updates*, *Secret scanning* con *Push protection* y *Private vulnerability reporting*.
3. En **Settings → Branches**, protegé `main`: que pida pull request y que pasen los controles de CI.
4. Activá la verificación en dos pasos en tu cuenta de GitHub.

**Claves**

1. Poné también un límite de gasto en la consola de Anthropic (**Settings → Limits**). El tope de la oficina es una cuenta propia; el de Anthropic es el que vale.
2. Usá una clave de Anthropic sólo para la oficina, para poder revocarla sin afectar otras cosas.
3. El token de GitHub: *fine-grained*, sólo **Contents: Read**, sólo los repos necesarios y con vencimiento.
4. Los tokens de MCP: con el menor permiso que ofrezca el proveedor, idealmente de sólo lectura.
5. Si una clave se filtró o la pegaste en algún chat, revocala y generá otra. No alcanza con borrarla.

**Online**

1. Una contraseña larga y única, de un gestor de contraseñas.
2. Cargá las claves en las variables del servicio, nunca en el código.
3. Revisá `/api/salud` después de cada deploy: tiene que decir `{"ok":true}`.

## Límites conocidos

- Hay una sola contraseña, sin usuarios ni roles. Quien la tenga puede gastar hasta el tope.
- El límite de intentos es global: alguien que la ataque puede demorar tu inicio de sesión (una sesión abierta sigue andando).
- La CSP permite scripts en línea porque Next.js los necesita para la página; la defensa principal contra inyección es que el contenido de los agentes nunca se inserta como HTML.
- Una instrucción escondida en una página, un documento o un repo puede influir en lo que escribe un agente. Por eso todo pasa por tu revisión antes de darse por terminado, y conviene que las herramientas MCP sean de sólo lectura.
- Managed Agents no admite Zero Data Retention: lo que el agente leyó de tus repos queda guardado en Anthropic hasta que lo borres.
- `/api/salud` es pública: dice si falta la contraseña o el disco, para que el deploy se pueda diagnosticar. No muestra valores.
