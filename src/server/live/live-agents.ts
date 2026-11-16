import os from 'node:os'
import path from 'node:path'
import { createAgents, MANAGER } from '@/config'
import { EMPTY_USAGE, type Agent } from '@/domain/types'

/** Carpeta del proyecto cuyas sesiones se muestran. Si no se dice, la carpeta donde corre la oficina. */
export const LIVE_PROJECT_PATH = process.env.AI_OFFICE_LIVE_PROJECT?.trim() || process.cwd()

/** Metadatos de la app de escritorio de Claude en macOS: dan el título real y el id del transcript. */
export const APP_SESSIONS_DIR =
  process.env.AI_OFFICE_SESSIONS_DIR ??
  path.join(os.homedir(), 'Library/Application Support/Claude/claude-code-sessions')

export const TRANSCRIPTS_DIR =
  process.env.AI_OFFICE_TRANSCRIPTS_DIR ?? path.join(os.homedir(), '.claude/projects')

export interface LiveAgentBinding {
  /** Título de la sesión en la app. */
  sessionTitle: string
  agent: Omit<Agent, 'status' | 'statusDetail' | 'mood' | 'location' | 'currentTaskId' | 'activity' | 'usage' | 'costUsd'>
}

// Cada agente de `oficina.config.ts` (sin la dirección) mira la sesión de Claude Code
// que se llame como él: una sesión titulada "Investigación" se ve en ese escritorio.
export const LIVE_AGENTS: LiveAgentBinding[] = createAgents()
  .filter(agent => agent.capability !== MANAGER)
  .map(({ id, name, role, description, capability, deskId, appearance }) => ({
    sessionTitle: name,
    agent: { id, name, role, description, capability, deskId, appearance, tools: [] },
  }))

export const OFFLINE_DEFAULTS = {
  status: 'offline',
  statusDetail: 'Sin sesión abierta',
  mood: 'neutral',
  location: 'lounge',
  currentTaskId: null,
  activity: 0,
  usage: EMPTY_USAGE,
  costUsd: null,
} as const
