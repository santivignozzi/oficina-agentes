import type { AgentAppearance } from '@/domain/types'

// Forma de `oficina.config.ts`. Todo lo que cambia de una oficina a otra está acá:
// el resto del código no conoce ningún nombre de agente ni de proyecto.

/** Cómo se ve la sala del agente. Cambia los muebles y lo que sale de su pantalla. */
export type RoomStyle = 'biblioteca' | 'tecnica' | 'creativa'

/** Un servidor MCP remoto. El token nunca va acá: va en la variable que nombra `tokenEnv`. */
export interface McpServerConfig {
  /** Nombre corto, sin espacios. Los agentes lo usan en `tools.mcp`. */
  name: string
  /** URL pública del servidor, con `https://`. */
  url: string
  /** Variable de entorno con el token, si el servidor lo pide. */
  tokenEnv?: string
  /**
   * Las únicas herramientas del servidor que pueden usar los agentes, por nombre. Conviene
   * poner sólo las de lectura: los agentes trabajan sin que nadie apruebe cada llamada.
   * Si falta, pueden usar todas.
   */
  allowedTools?: string[]
}

export interface AgentTools {
  /** Busca en la web. Cada búsqueda cuesta USD 0,01 además de los tokens. */
  webSearch?: boolean
  /**
   * Lee los repos de GitHub que deja el token y abre sus sitios, en un contenedor de
   * Managed Agents. Sólo puede tenerlo un agente.
   */
  githubRepos?: boolean
  /** Nombres de `mcpServers` que puede usar. */
  mcp?: string[]
}

export interface WorkerConfig {
  /** Sin espacios ni acentos: es la clave interna. No la cambies después de usar la oficina. */
  id: string
  /** Cómo se lo ve y se lo nombra en la oficina. */
  name: string
  /** Una o dos palabras debajo del nombre. */
  role: string
  /** Para vos: lo que hace, en una oración. Se ve en su panel. */
  description: string
  /** Para la dirección: cuándo darle trabajo. Decide el reparto, así que conviene ser concreto. */
  whenToUse: string
  /** Su prompt de sistema: cómo trabaja y qué entrega. */
  instructions: string
  /** Lo que se ve en su panel. Si falta, se arma de `tools`. */
  skills?: string[]
  tools?: AgentTools
  /** Modelo propio. Si falta, el de la oficina. */
  model?: string
  room: {
    style: RoomStyle
    /** Cartel de la sala. Si falta, el rol en mayúsculas. */
    label?: string
  }
  look: AgentAppearance
}

export interface DirectorConfig {
  id: string
  name: string
  role: string
  description: string
  /** Se suma a su prompt al planificar y al consolidar. */
  instructions?: string
  model?: string
  look: AgentAppearance
}

export interface OfficeConfig {
  /** Va en el cartel del techo y arriba de la pantalla. */
  name: string
  /** Idioma y tono de todos los agentes. Va en cada prompt. */
  voice: string
  /** Modelo por defecto. Ver docs/INTEGRACIONES.md. */
  model: string
  /** Cuántas subtareas puede armar la dirección por consigna. Cada una es una llamada paga. */
  maxSubtasks?: number
  director: DirectorConfig
  /** Entre 1 y 6. Se ubican de a dos por piso, en el orden de la lista. */
  agents: WorkerConfig[]
  mcpServers?: McpServerConfig[]
}

export const MAX_AGENTS = 6

const ID = /^[a-z][a-z0-9-]*$/
const COLOR = /^#[0-9a-fA-F]{6}$/

/** Falla al arrancar con un mensaje claro, antes de gastar nada. */
export function defineOffice(config: OfficeConfig): OfficeConfig {
  const problems: string[] = []
  const ids = new Set<string>()
  const mcpNames = new Set((config.mcpServers ?? []).map(server => server.name))

  const checkLook = (who: string, look: AgentAppearance) => {
    for (const key of ['skin', 'hair', 'outfit', 'accent'] as const) {
      if (!COLOR.test(look[key])) problems.push(`${who}: look.${key} tiene que ser un color como #1FA08A.`)
    }
    if (look.pants && !COLOR.test(look.pants)) problems.push(`${who}: look.pants tiene que ser un color como #2F3A49.`)
  }
  const checkId = (who: string, id: string) => {
    if (!ID.test(id)) problems.push(`${who}: el id "${id}" va en minúsculas, sin espacios ni acentos.`)
    if (ids.has(id)) problems.push(`${who}: el id "${id}" está repetido.`)
    ids.add(id)
  }

  checkId('director', config.director.id)
  checkLook('director', config.director.look)
  if (config.agents.length < 1 || config.agents.length > MAX_AGENTS) {
    problems.push(`agents: tiene que haber entre 1 y ${MAX_AGENTS} agentes, además de la dirección.`)
  }
  for (const agent of config.agents) {
    const who = `agente ${agent.id}`
    checkId(who, agent.id)
    checkLook(who, agent.look)
    if (!agent.whenToUse.trim()) problems.push(`${who}: falta whenToUse, que es lo que lee la dirección para repartir.`)
    if (!agent.instructions.trim()) problems.push(`${who}: faltan las instrucciones.`)
    for (const name of agent.tools?.mcp ?? []) {
      if (!mcpNames.has(name)) problems.push(`${who}: usa el MCP "${name}", que no está en mcpServers.`)
    }
  }
  if (config.agents.filter(agent => agent.tools?.githubRepos).length > 1) {
    problems.push('Sólo un agente puede tener tools.githubRepos.')
  }
  for (const server of config.mcpServers ?? []) {
    if (!ID.test(server.name)) problems.push(`mcpServers: el nombre "${server.name}" va en minúsculas, sin espacios.`)
    if (!server.url.startsWith('https://')) problems.push(`mcpServers: ${server.name} necesita una URL https://.`)
  }

  if (problems.length > 0) throw new Error(`oficina.config.ts tiene errores:\n- ${problems.join('\n- ')}`)
  return config
}
