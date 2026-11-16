# Oficina de agentes

Una oficina 2D donde cada personaje es un agente de Claude. Quien recibe este repo arma su propio equipo: el equipo, el diseño y las integraciones salen de `oficina.config.ts`.

## Si la persona recién llega o quiere cambiar su oficina

Usá el skill `configurar-oficina` (`.claude/skills/configurar-oficina/SKILL.md`). Hace la entrevista paso a paso: para qué la quiere, qué agentes, cómo se ven, cómo funcionan, qué modelos y servidores MCP conectar, y cómo ponerla online. Activalo también ante pedidos como "configurá mi oficina", "sumá un agente", "conectá Notion" o "¿cómo la pongo online?".

## Reglas del repo

- Para cambiar el equipo, tocá sólo `oficina.config.ts`. Ningún otro archivo nombra agentes: el edificio, los prompts, la demo y el modo Agentes salen de ahí.
- Las claves van en `.env.local` o en las variables del servidor. Nunca en el código ni en el chat.
- La interfaz está en español. Los comentarios del código también.
- Antes de dar algo por terminado: `npm run typecheck`, `npm run lint` y, si cambió algo visible, mirar la oficina en `http://127.0.0.1:3011` con `npm run dev`.
- La arquitectura está en `docs/ARQUITECTURA.md`; modelos, MCP y costos, en `docs/INTEGRACIONES.md`; lo que protege el código y lo que le toca a la persona, en `SECURITY.md`.

## Seguridad

- Nunca pidas, muestres ni escribas una clave o un token. Si la persona pega uno en el chat, decile que lo revoque y genere otro.
- Lo que escriben los agentes no se inserta nunca como HTML ni como enlace. No sumes `dangerouslySetInnerHTML`, `innerHTML` ni renderizado de Markdown con HTML.
- No relajes la política de seguridad de `next.config.ts`, la cookie de sesión ni los controles de `src/server/http.ts` y `src/server/access.ts` sin explicarle a la persona qué riesgo abre.
- Para servidores MCP, recomendá tokens de sólo lectura y completá `allowedTools`.
- Las dependencias van con versión exacta. Después de sumar o actualizar una, corré `npm audit`.

@AGENTS.md
