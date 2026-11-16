import { randomUUID } from 'node:crypto'
import { computeMetrics } from '@/domain/selectors'
import {
  addUsage,
  type Agent,
  type Assignment,
  type BillingStatus,
  type OfficeEvent,
  type OfficeMode,
  type OfficeSnapshot,
  type Task,
  type TokenUsage,
} from '@/domain/types'
import type { OfficeRepository } from '../ports'

type Listener = (snapshot: OfficeSnapshot) => void
type ResumeState = Pick<Agent, 'status' | 'statusDetail' | 'activity'>

const SNAPSHOT_EVENTS = 160
const PUBLISH_DELAY_MS = 60
/** Sin esto, los cuellos de botella por espera no suben si nadie hace nada. */
const HEARTBEAT_MS = 5_000

// Tarifa de ejemplo por millón de tokens. Es del motor simulado, igual que los
// tokens: la pantalla rotula el costo de Demo como simulado.
const EXAMPLE_PRICE_PER_MTOK = { input: 3, output: 15 }

export function estimateCostUsd(usage: Partial<TokenUsage>): number {
  return ((usage.input ?? 0) * EXAMPLE_PRICE_PER_MTOK.input + (usage.output ?? 0) * EXAMPLE_PRICE_PER_MTOK.output) / 1_000_000
}

/** Lo que distingue a una oficina de otra: el motor es el mismo. */
export interface OfficeProfile {
  mode: Exclude<OfficeMode, 'live'>
  simulated: boolean
  controllable: boolean
  billing(): BillingStatus | null
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`
export const nowIso = () => new Date().toISOString()

/** Lectura y escritura del estado, más la publicación a quien esté mirando. */
export class OfficeState {
  private listeners = new Set<Listener>()
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  /** Agentes en pausa, con el estado al que vuelven. */
  private paused = new Map<string, ResumeState>()
  private lock: Promise<unknown> = Promise.resolve()

  constructor(
    readonly repo: OfficeRepository,
    readonly profile: OfficeProfile,
  ) {
    setInterval(() => this.schedulePublish(), HEARTBEAT_MS).unref()
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  schedulePublish() {
    if (this.publishTimer || this.listeners.size === 0) return
    this.publishTimer = setTimeout(async () => {
      this.publishTimer = null
      const snapshot = await this.snapshot()
      for (const listener of this.listeners) listener(snapshot)
    }, PUBLISH_DELAY_MS)
  }

  async snapshot(): Promise<OfficeSnapshot> {
    const [agents, tasks, assignments, deliverables, events] = await Promise.all([
      this.repo.listAgents(),
      this.repo.listTasks(),
      this.repo.listAssignments(),
      this.repo.listDeliverables(),
      this.repo.listEvents(SNAPSHOT_EVENTS),
    ])
    return {
      mode: this.profile.mode,
      controllable: this.profile.controllable,
      simulated: this.profile.simulated,
      agents,
      tasks,
      assignments,
      deliverables,
      events,
      metrics: computeMetrics(agents, tasks, deliverables, Date.now(), { costKnown: true }),
      live: null,
      billing: this.profile.billing(),
      generatedAt: nowIso(),
    }
  }

  async agent(id: string): Promise<Agent> {
    const agent = await this.repo.getAgent(id)
    if (!agent) throw new Error(`No existe el agente ${id}`)
    return agent
  }

  async task(id: string): Promise<Task> {
    const task = await this.repo.getTask(id)
    if (!task) throw new Error(`No existe la tarea ${id}`)
    return task
  }

  isPaused(agentId: string) {
    return this.paused.has(agentId)
  }

  async pause(agentId: string) {
    await this.exclusive(async () => {
      const agent = await this.agent(agentId)
      if (this.paused.has(agentId)) return
      const { status, statusDetail, activity } = agent
      this.paused.set(agentId, { status, statusDetail, activity })
      await this.repo.saveAgent({ ...agent, status: 'paused', statusDetail: 'En pausa por vos', activity: 0 })
    })
    this.schedulePublish()
  }

  async resume(agentId: string) {
    const resumeTo = this.paused.get(agentId)
    if (!resumeTo) return
    this.paused.delete(agentId)
    await this.patchAgent(agentId, resumeTo)
  }

  clearPauses() {
    this.paused.clear()
  }

  /** Mientras está en pausa, su estado visible no cambia: se guarda para cuando vuelva. */
  async patchAgent(id: string, patch: Partial<Agent>) {
    await this.exclusive(async () => {
      const agent = await this.agent(id)
      const held = this.paused.get(id)
      const visible = { ...patch }
      if (held) {
        const { status, statusDetail, activity } = { ...held, ...patch }
        this.paused.set(id, { status, statusDetail, activity })
        delete visible.status
        delete visible.statusDetail
        delete visible.activity
      }
      await this.repo.saveAgent({ ...agent, ...visible })
    })
    this.schedulePublish()
  }

  async patchTask(id: string, patch: Partial<Task>) {
    await this.exclusive(async () => {
      const task = await this.task(id)
      await this.repo.saveTask({ ...task, ...patch, updatedAt: nowIso() })
    })
    this.schedulePublish()
  }

  async emit(event: Omit<OfficeEvent, 'id' | 'at' | 'agentId' | 'targetAgentId' | 'taskId'> & Partial<OfficeEvent>) {
    await this.repo.appendEvent({
      agentId: null,
      targetAgentId: null,
      taskId: null,
      ...event,
      id: newId('ev'),
      at: nowIso(),
    })
    this.schedulePublish()
  }

  async addUsage(agentId: string, taskId: string, delta: Partial<TokenUsage>, costUsd = estimateCostUsd(delta)) {
    await this.exclusive(async () => {
      const agent = await this.agent(agentId)
      await this.repo.saveAgent({
        ...agent,
        usage: addUsage(agent.usage, delta),
        costUsd: (agent.costUsd ?? 0) + costUsd,
      })
      const task = await this.task(taskId)
      await this.repo.saveTask({
        ...task,
        usage: addUsage(task.usage, delta),
        estimatedCostUsd: (task.estimatedCostUsd ?? 0) + costUsd,
        updatedAt: nowIso(),
      })
    })
    this.schedulePublish()
  }

  async assign(taskId: string, agentId: string, assignedBy: string) {
    const assignment: Assignment = {
      id: newId('as'),
      taskId,
      agentId,
      assignedBy,
      assignedAt: nowIso(),
      releasedAt: null,
      reason: null,
    }
    await this.repo.saveAssignment(assignment)
    await this.patchTask(taskId, { assigneeId: agentId })
  }

  // Leer, cambiar y guardar son pasos separados, y hay varios agentes corriendo a
  // la vez: sin esta fila, un cambio de estado pisa el contador de tokens de otro.
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lock.then(work, work)
    this.lock = run.catch(() => undefined)
    return run
  }

  async releaseAssignments(taskId: string, reason: string) {
    const assignments = await this.repo.listAssignments()
    for (const assignment of assignments) {
      if (assignment.taskId !== taskId || assignment.releasedAt) continue
      await this.repo.saveAssignment({ ...assignment, releasedAt: nowIso(), reason })
    }
  }
}
