import { EMPTY_USAGE, type Agent } from '@/domain/types'
import config from '../../oficina.config'
import type { AgentTools, RoomStyle, WorkerConfig } from './schema'

// Lo que el resto del código lee de `oficina.config.ts`. Cada agente se sienta en el
// escritorio que lleva su propio id, y la dirección reparte por `capability`, que en
// los agentes es también su id: así un agente nuevo no necesita tocar nada más.

export const OFFICE = config
export const DIRECTOR = config.director
export const WORKERS: WorkerConfig[] = config.agents
export const MANAGER = 'manager'
export const MAX_SUBTASKS = config.maxSubtasks ?? 3

export const workerById = (id: string) => WORKERS.find(worker => worker.id === id) ?? null

export function skillsOf(tools: AgentTools | undefined): string[] {
  const skills: string[] = []
  if (tools?.webSearch) skills.push('Buscar en la web')
  if (tools?.githubRepos) skills.push('Leer tus repos', 'Abrir sus sitios')
  for (const name of tools?.mcp ?? []) skills.push(`Usar ${name}`)
  return skills
}

const BASE = {
  status: 'idle',
  statusDetail: null,
  mood: 'neutral',
  location: 'lounge',
  currentTaskId: null,
  activity: 0,
  usage: EMPTY_USAGE,
  costUsd: 0,
} as const

/** El equipo tal como está en la configuración, todos libres. */
export function createAgents(): Agent[] {
  return [
    {
      ...BASE,
      id: DIRECTOR.id,
      name: DIRECTOR.name,
      role: DIRECTOR.role,
      description: DIRECTOR.description,
      capability: MANAGER,
      tools: ['Planificar', 'Delegar', 'Consolidar', 'Pedir aprobación'],
      deskId: DIRECTOR.id,
      appearance: DIRECTOR.look,
    },
    ...WORKERS.map(worker => ({
      ...BASE,
      id: worker.id,
      name: worker.name,
      role: worker.role,
      description: worker.description,
      capability: worker.id,
      tools: worker.skills ?? [...skillsOf(worker.tools), 'Redactar entregas'],
      deskId: worker.id,
      appearance: worker.look,
    })),
  ]
}

export type { RoomStyle, WorkerConfig }
