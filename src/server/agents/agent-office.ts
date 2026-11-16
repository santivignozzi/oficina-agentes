import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createAgents, DIRECTOR, MANAGER, OFFICE, WORKERS } from '@/config'
import { isClosed } from '@/domain/selectors'
import { ManagedOffice } from '../engine/managed-office'
import { nowIso, type OfficeState } from '../engine/office-state'
import { isOnline, persistentDir } from '../access'
import { onShutdown } from '../shutdown'
import { Budget } from './budget'
import { ClaudeRunner, type McpServer, type ModelChoice } from './claude-runner'
import { FileRepository } from './file-repository'
import { PRICED_MODELS } from './pricing'
import { RepoWorker } from './repo-worker'

// La oficina con agentes reales. Sin `ANTHROPIC_API_KEY` se ve pero no recibe comandos,
// así que no hay forma de gastar por accidente. El equipo sale de `oficina.config.ts`;
// las claves y los topes, de variables de entorno: ver `.env.example`.

/** Sin tope no se arranca: olvidarse la variable no puede significar gasto sin límite. */
const DEFAULT_BUDGET_USD = 5
/** Con margen: una sesión medida que leyó dos repos y sus sitios costó USD 0,14. */
const DEFAULT_SESSION_CAP_USD = 1

const REPO_TOOLS = ['Leer tus repos', 'Abrir sus sitios', 'Proponer cambios']

/** `AI_OFFICE_MODEL` pisa el de la configuración para todos; `AI_OFFICE_MODEL_<ID>`, para uno. */
function chooseModels(): ModelChoice {
  const envFor = (id: string) => process.env[`AI_OFFICE_MODEL_${id.toUpperCase().replaceAll('-', '_')}`]?.trim()
  const all = process.env.AI_OFFICE_MODEL?.trim()
  return {
    [MANAGER]: envFor(DIRECTOR.id) || envFor(MANAGER) || all || DIRECTOR.model || OFFICE.model,
    ...Object.fromEntries(WORKERS.map(worker => [worker.id, envFor(worker.id) || all || worker.model || OFFICE.model])),
  }
}

/** Los servidores con su token. Uno que pide token y no lo tiene no se manda: fallaría igual. */
function mcpServers(): McpServer[] {
  const ready: McpServer[] = []
  for (const server of OFFICE.mcpServers ?? []) {
    const token = server.tokenEnv ? process.env[server.tokenEnv]?.trim() : undefined
    if (server.tokenEnv && !token) {
      console.warn(`[agentes] ${server.name}: falta ${server.tokenEnv}, así que nadie lo usa.`)
      continue
    }
    ready.push({
      definition: { type: 'url', name: server.name, url: server.url, ...(token ? { authorization_token: token } : {}) },
      allowedTools: server.allowedTools ?? null,
    })
  }
  return ready
}

/** Una URL para pruebas locales. Online se ignora: una variable mal puesta no puede desviar las claves. */
function testUrl(name: string) {
  const value = process.env[name]?.trim()
  if (!value) return null
  if (isOnline()) {
    console.warn(`[agentes] ${name} se ignora online.`)
    return null
  }
  return value
}

const positive = (name: string, fallback: number) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const INTERRUPTED = 'Se reinició el servidor antes de que terminara.'

/** Al reiniciar se pierde lo que estaba en curso: se dice, y lo que espera tu revisión queda intacto. */
async function closeInterrupted(state: OfficeState) {
  const { repo } = state
  const at = nowIso()
  const deliverables = await repo.listDeliverables()
  const waiting = new Set(deliverables.filter(d => d.status === 'pending_review').map(d => d.taskId))

  for (const agent of await repo.listAgents()) {
    await repo.saveAgent({ ...agent, status: 'idle', statusDetail: null, location: 'lounge', currentTaskId: null, activity: 0 })
  }
  for (const task of await repo.listTasks()) {
    if (isClosed(task) || waiting.has(task.id)) continue
    await repo.saveTask({ ...task, status: 'failed', failureReason: INTERRUPTED, finishedAt: at, updatedAt: at })
    await state.emit({ type: 'task.failed', channel: 'system', text: `No se completó "${task.title}": ${INTERRUPTED}`, taskId: task.id })
  }
  for (const assignment of await repo.listAssignments()) {
    if (assignment.releasedAt || waiting.has(assignment.taskId)) continue
    await repo.saveAssignment({ ...assignment, releasedAt: at, reason: INTERRUPTED })
  }
}

/**
 * Quien se sacó de la configuración deja de existir, pero no su trabajo: lo que tenía a su
 * nombre pasa a la dirección. Si no, una entrega que esperaba tu revisión no se podría cerrar.
 */
async function handOver(state: OfficeState, gone: Set<string>, to: string) {
  const { repo } = state
  for (const task of await repo.listTasks()) {
    if (task.assigneeId && gone.has(task.assigneeId)) await repo.saveTask({ ...task, assigneeId: to })
  }
  for (const deliverable of await repo.listDeliverables()) {
    if (gone.has(deliverable.agentId)) await repo.saveDeliverable({ ...deliverable, agentId: to })
  }
  for (const assignment of await repo.listAssignments()) {
    if (gone.has(assignment.agentId)) await repo.saveAssignment({ ...assignment, agentId: to })
  }
  for (const id of gone) await repo.removeAgent(id)
}

export function createAgentOffice() {
  const dataDir = persistentDir() ?? join(process.cwd(), '.data')
  const models = chooseModels()
  // Un modelo sin precio no corre: el tope de gasto no podría contarlo. La oficina se ve igual.
  const unpriced = Object.entries(models).filter(([, model]) => !PRICED_MODELS.includes(model))
  for (const [who, model] of unpriced) {
    console.error(`[agentes] ${who} usa ${model}, que no tiene precio cargado. Usá ${PRICED_MODELS.join(', ')} o sumalo en server/agents/pricing.ts.`)
  }
  const apiKey = unpriced.length === 0 ? process.env.ANTHROPIC_API_KEY?.trim() || null : null
  const budget = new Budget(positive('AI_OFFICE_BUDGET_USD', DEFAULT_BUDGET_USD), join(dataDir, 'gasto.json'))
  const repo = new FileRepository(join(dataDir, 'oficina.json'))
  onShutdown(() => repo.flush())

  // `baseURL` y `authToken` van explícitos: las variables del entorno del SDK podrían
  // mandar la clave a otro servidor. `AI_OFFICE_API_URL` existe para probar sin gastar
  // contra un servidor falso, y sólo en esta máquina: online la clave va siempre a Anthropic.
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: testUrl('AI_OFFICE_API_URL') ?? 'https://api.anthropic.com',
  })

  // Qué repos lee el agente que tiene `githubRepos` lo decide este token: los que elijas
  // al crearlo en GitHub. `AI_OFFICE_GITHUB_API_URL`, igual que la de Anthropic, existe sólo para probar.
  const githubToken = process.env.AI_OFFICE_GITHUB_TOKEN?.trim() || null
  const reader = WORKERS.find(w => w.tools?.githubRepos) ?? null
  const worker =
    apiKey && githubToken && reader
      ? new RepoWorker({
          worker: reader,
          client,
          model: models[reader.id],
          budget,
          setupFile: join(dataDir, 'agente-repo.json'),
          token: githubToken,
          capUsd: positive('AI_OFFICE_REPO_SESSION_USD', DEFAULT_SESSION_CAP_USD),
          githubApi: testUrl('AI_OFFICE_GITHUB_API_URL') ?? 'https://api.github.com',
        })
      : null

  return new ManagedOffice({
    profile: {
      mode: 'agents',
      simulated: false,
      controllable: apiKey !== null,
      billing: () => ({ configured: apiKey !== null, models, budgetUsd: budget.limitUsd, spentUsd: budget.spentUsd }),
    },
    repo,
    runner: new ClaudeRunner(client, models, budget, worker, mcpServers()),
    seed: async state => {
      if (repo.load()) await closeInterrupted(state)
      void worker?.closeOrphans().catch(error => console.error('[agentes] no se pudieron cerrar las sesiones abiertas', error))
      // Se compara por id: un agente sumado después de la primera corrida también entra.
      const known = new Map((await repo.listAgents()).map(agent => [agent.id, agent]))
      // Lo que dice la configuración se pisa siempre: nombre, rol, aspecto y herramientas.
      // El estado y el consumo guardados se conservan.
      const team = createAgents()
      const gone = [...known.keys()].filter(id => !team.some(agent => agent.id === id))
      if (gone.length > 0) await handOver(state, new Set(gone), DIRECTOR.id)
      for (const agent of team) {
        const saved = known.get(agent.id)
        const { name, role, description, capability, deskId, appearance } = agent
        const tools = reader && agent.id === reader.id && !worker ? agent.tools.filter(t => !REPO_TOOLS.includes(t)) : agent.tools
        await repo.saveAgent(saved ? { ...saved, name, role, description, capability, deskId, appearance, tools } : { ...agent, tools })
      }
    },
  })
}
