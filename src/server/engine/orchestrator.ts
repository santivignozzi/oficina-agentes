import { isClosed } from '@/domain/selectors'
import {
  EMPTY_USAGE,
  type Agent,
  type AgentLocation,
  type OfficeEventType,
  type Task,
  type TaskPriority,
} from '@/domain/types'
import type { AgentJob, AgentRunContext, AgentRunner, ConsolidatedDeliverable, JobQueue } from '../ports'
import { newId, nowIso, type OfficeState } from './office-state'
import { FLOORS } from '@/office/layout'

// El grafo del Director: plan → kickoff → work → consolidate → review, y review
// vuelve a work si pedís cambios. Es la forma que tendría en LangGraph; mientras
// sean nodos lineales, un `async` que se lee de arriba abajo alcanza.
//
// Esperar tu revisión no ocupa a nadie: la entrega queda en el mostrador, el agente
// sigue con lo próximo y tu decisión retoma el grafo cuando llega. Así una revisión
// olvidada no frena la cola.

/** Sólo para probar el flujo rápido: `AI_OFFICE_DEMO_SPEED=8`. No acelera al modelo. */
const SPEED = Number(process.env.AI_OFFICE_DEMO_SPEED ?? 1) || 1

// La visual camina con esta misma duración: si se tocan, el personaje llega tarde.
const WALK_MS = 2_600
/**
 * Bajar a la sala de reuniones desde los pisos de arriba, con ascensor de por medio. Con
 * cuatro pisos se midieron 7,5 s; cada piso de más suma lo que tarda la cabina en uno.
 */
const MEETING_WALK_MS = 7_500 + Math.max(0, FLOORS.length - 4) * 1_500
const KICKOFF_MS = 5_000
const CONSOLIDATE_MEETING_MS = 3_500
const HANDOFF_MS = 1_500
const CELEBRATE_MS = 4_000
const REJECTED_MS = 2_000
const SETTLE_MS = 1_400
const STOP_GRACE_MS = 250

const WAITING_REVIEW = {
  status: 'waiting_approval',
  statusDetail: 'Espera tu aprobación',
  activity: 0.1,
  mood: 'neutral',
} as const

const CANCELLED_BY_YOU = 'La cancelaste vos.'
const STOPPED_BY_YOU = 'Detuviste toda la ejecución.'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type StopReason = 'stopped' | 'cancelled' | 'reassigned'

class Interrupted extends Error {
  constructor(readonly reason: StopReason) {
    super(reason)
  }
}

export type ReviewDecision =
  | { kind: 'approved' }
  | { kind: 'rejected'; note: string }
  | { kind: 'changes'; note: string; agentId: string | null }
  | { kind: 'stopped' }

type ChangesDecision = Extract<ReviewDecision, { kind: 'changes' }>

function newTask(input: {
  title: string
  description: string
  priority: TaskPriority
  parentId: string | null
  assigneeId: string | null
  dependsOn?: string[]
  revision?: number
}): Task {
  const at = nowIso()
  return {
    id: newId('t'),
    title: input.title,
    description: input.description,
    status: 'pending',
    priority: input.priority,
    assigneeId: input.assigneeId,
    parentId: input.parentId,
    dependsOn: input.dependsOn ?? [],
    revision: input.revision ?? 0,
    progress: 0,
    output: null,
    failureReason: null,
    estimatedCostUsd: 0,
    usage: EMPTY_USAGE,
    createdAt: at,
    startedAt: null,
    finishedAt: null,
    updatedAt: at,
  }
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))


export class Orchestrator {
  private controllers = new Map<string, AbortController>()
  private queued = new Set<string>()
  /** Agentes ocupados por una reunión o un trabajo: los trabajos esperan su turno. */
  private busy = new Set<string>()
  private settled = new Map<string, () => void>()
  /** Qué hacer con cada entrega cuando decidas. Nadie se queda esperando. */
  private reviews = new Map<string, (decision: ReviewDecision) => void>()
  /** Turnos de la dirección, de a uno. Los cambios que pediste van antes que una consigna nueva. */
  private directorTurns: (() => Promise<void>)[] = []
  private directorRunning = false
  /** Lo que pediste cambiar en una tarea directa, para dárselo tal cual a quien la retome. */
  private revisionNotes = new Map<string, string>()

  constructor(
    private state: OfficeState,
    private queue: JobQueue,
    private runner: AgentRunner,
  ) {
    queue.process(job => this.handleJob(job))
  }

  // ---- Entrada de trabajo ----

  async submitGoal(text: string, priority: TaskPriority) {
    const director = await this.director()
    const title = text.length > 72 ? `${text.slice(0, 70).trimEnd()}…` : text
    const goal = newTask({ title, description: text, priority, parentId: null, assigneeId: director.id })
    await this.state.repo.saveTask(goal)
    await this.state.assign(goal.id, director.id, 'human')
    await this.state.emit({
      type: 'task.created',
      channel: 'system',
      text: `Nueva consigna para ${director.name}: ${title}`,
      agentId: director.id,
      taskId: goal.id,
    })
    this.queueDirector(() => this.runGoal(goal.id))
    return goal
  }

  private queueDirector(turn: () => Promise<void>, first = false) {
    if (first) this.directorTurns.unshift(turn)
    else this.directorTurns.push(turn)
    void this.pumpDirector()
  }

  private async pumpDirector() {
    if (this.directorRunning) return
    this.directorRunning = true
    try {
      for (let turn = this.directorTurns.shift(); turn; turn = this.directorTurns.shift()) {
        await turn().catch(error => console.error('[oficina] falló la consigna', error))
      }
    } finally {
      this.directorRunning = false
    }
  }

  async assignDirect(agentId: string, title: string, description: string, priority: TaskPriority) {
    const agent = await this.state.agent(agentId)
    const task = newTask({ title, description: description || title, priority, parentId: null, assigneeId: agentId })
    await this.state.repo.saveTask(task)
    await this.state.assign(task.id, agentId, 'human')
    await this.state.emit({
      type: 'task.assigned',
      channel: 'system',
      text: `Le asignaste a ${agent.name}: ${title}`,
      agentId,
      taskId: task.id,
    })
    await this.enqueue(task)
    return task
  }

  /** Después de un reinicio: lo que esperaba tu revisión la sigue esperando, sin volver a pagarlo. */
  async restore() {
    const tasks = await this.state.repo.listTasks()
    for (const deliverable of await this.state.repo.listDeliverables()) {
      if (deliverable.status !== 'pending_review') continue
      const { taskId, agentId } = deliverable
      await this.state.patchTask(taskId, { status: 'waiting_review' })
      await this.state.patchAgent(agentId, { ...WAITING_REVIEW, location: 'review', currentTaskId: taskId })
      const isGoal = tasks.some(t => t.parentId === taskId)
      this.awaitDecision(deliverable.id, decision =>
        isGoal ? this.onGoalDecision(taskId, decision) : this.onTaskDecision(taskId, agentId, decision),
      )
    }
  }

  // ---- Grafo del Director ----

  private async runGoal(goalId: string) {
    const goal = await this.state.task(goalId)
    if (goal.status !== 'pending') return // la detuviste antes de que le tocara
    await this.directorTurn(goalId, async (director, ctx) => {
      await this.planAndDelegate(goal, director, ctx)
      await this.consolidateAndDeliver(goalId, director, ctx, null)
    })
  }

  /** Pediste cambios en una consigna: la dirección se los lleva a quien corresponde y vuelve a entregar. */
  private async reviseGoal(goalId: string, decision: ChangesDecision) {
    if (isClosed(await this.state.task(goalId))) return // la cancelaste mientras esperaba turno
    await this.directorTurn(goalId, async (director, ctx) => {
      await this.requestRevision(goalId, director, decision, ctx)
      await this.consolidateAndDeliver(goalId, director, ctx, decision.note)
    })
  }

  /** Un tramo de trabajo de la dirección. Termina al dejar la entrega: tu revisión no la ocupa. */
  private async directorTurn(goalId: string, work: (director: Agent, ctx: AgentRunContext) => Promise<void>) {
    const director = await this.director()
    // El control va antes de esperar a la dirección: si la cancelás mientras tanto, no arranca.
    const controller = new AbortController()
    this.controllers.set(goalId, controller)
    await this.hold(director.id)
    const ctx = this.context(director.id, goalId, controller.signal)

    try {
      await ctx.checkpoint()
      await work(director, ctx)
    } catch (error) {
      if (!(error instanceof Interrupted)) await this.fail(goalId, reasonOf(error))
    } finally {
      this.controllers.delete(goalId)
      this.release(director.id)
      this.settleLater(director.id)
    }
  }

  private async planAndDelegate(goal: Task, director: Agent, ctx: AgentRunContext) {
    await this.state.patchTask(goal.id, { status: 'in_progress', startedAt: nowIso() })
    await this.state.emit({
      type: 'task.started',
      channel: 'system',
      text: `${director.name} tomó la consigna`,
      agentId: director.id,
      taskId: goal.id,
    })
    await this.walk(director.id, 'desk', ctx)
    await this.setWorking(director.id, goal.id, 'Interpretando el objetivo', 0.65)

    const plan = await this.runner.plan({ goal }, ctx)
    const subtasks = await this.createSubtasks(goal, plan, director)
    await this.state.patchTask(goal.id, { progress: 0.15 })

    await this.meeting(director, subtasks, 'Repartiendo el trabajo', KICKOFF_MS, ctx)
    // Primero se despachan: si no, salen de la sala rumbo al lounge y pegan la vuelta.
    await this.dispatchReady(goal.id)
    await this.walk(director.id, 'desk', ctx)
    await this.setWorking(director.id, goal.id, 'Supervisando al equipo', 0.2)
    await Promise.all(subtasks.map(task => this.whenSettled(task.id)))
    await ctx.checkpoint()
  }

  private async createSubtasks(
    goal: Task,
    plan: Awaited<ReturnType<AgentRunner['plan']>>,
    director: Agent,
  ) {
    const agents = await this.state.repo.listAgents()
    const idByKey = new Map<string, string>()
    const subtasks: Task[] = []

    const load = (agent: Agent) => subtasks.filter(t => t.assigneeId === agent.id).length

    for (const planned of plan) {
      // Se reparte entre pares: si no, el segundo de una capacidad nunca recibiría trabajo.
      const peers = agents.filter(a => a.capability === planned.capability).sort((a, b) => load(a) - load(b))
      const assignee = peers[0] ?? director
      const task = newTask({
        title: planned.title,
        description: planned.description,
        priority: goal.priority,
        parentId: goal.id,
        assigneeId: assignee.id,
        dependsOn: planned.dependsOn.flatMap(key => idByKey.get(key) ?? []),
      })
      idByKey.set(planned.key, task.id)
      subtasks.push(task)
      await this.state.repo.saveTask(task)
      await this.state.assign(task.id, assignee.id, director.id)
      await this.state.emit({
        type: 'task.assigned',
        channel: 'system',
        text: `${director.name} le asignó a ${assignee.name}: ${task.title}`,
        agentId: director.id,
        targetAgentId: assignee.id,
        taskId: task.id,
      })
    }
    return subtasks
  }

  /** Reúne a quien esté libre. El que está ocupado sigue con lo suyo. */
  private async meeting(director: Agent, tasks: Task[], topic: string, ms: number, ctx: AgentRunContext) {
    const invited = [...new Set(tasks.flatMap(t => t.assigneeId ?? []))].filter(
      id => id !== director.id && !this.busy.has(id),
    )
    for (const id of invited) this.busy.add(id)
    try {
      await Promise.all(
        [director.id, ...invited].map(id => this.walk(id, 'meeting', ctx, 'Yendo a la sala de reuniones')),
      )
      for (const id of [director.id, ...invited]) {
        await this.state.patchAgent(id, { status: 'meeting', statusDetail: topic, activity: 0.5, mood: 'happy' })
      }
      await ctx.sleep(ms)
    } finally {
      for (const id of invited) {
        this.release(id)
        this.settleLater(id)
      }
    }
  }

  /** Junta lo que hizo el equipo y deja la entrega en el mostrador. */
  private async consolidateAndDeliver(goalId: string, director: Agent, ctx: AgentRunContext, revisionNote: string | null) {
    const tasks = await this.state.repo.listTasks()
    const subtasks = tasks.filter(t => t.parentId === goalId)
    const agents = await this.state.repo.listAgents()
    const goal = await this.state.task(goalId)

    if (!subtasks.some(t => t.status === 'done')) {
      if (subtasks.every(t => t.status === 'cancelled')) {
        await this.cancel(goalId, 'Cancelaste todas sus subtareas.')
        return
      }
      await this.fail(goalId, 'Ninguna subtarea llegó a terminar.')
      await this.state.patchAgent(director.id, { mood: 'sad' })
      return
    }

    if (goal.revision === 0) {
      await this.meeting(director, subtasks, 'Poniendo en común los resultados', CONSOLIDATE_MEETING_MS, ctx)
      await this.walk(director.id, 'desk', ctx)
    }
    await this.setWorking(director.id, goalId, 'Consolidando resultados', 0.7)
    await this.state.patchTask(goalId, { progress: 0.85 })

    const draft = await this.runner.consolidate(
      {
        goal,
        revision: goal.revision,
        revisionNote,
        results: subtasks.map(t => ({
          agentName: agents.find(a => a.id === t.assigneeId)?.name ?? 'Sin asignar',
          title: t.title,
          output: t.output ?? '',
          failed: t.status !== 'done',
        })),
      },
      ctx,
    )
    await this.deliver(goalId, director.id, draft, goal.revision, ctx, decision => this.onGoalDecision(goalId, decision))
  }

  private async onGoalDecision(goalId: string, decision: ReviewDecision) {
    const director = await this.director()
    if (decision.kind !== 'changes') return this.conclude(goalId, director.id, decision)
    // Se marca ya: si la dirección está con otra consigna, no puede seguir figurando para revisar.
    await this.state.patchTask(goalId, { status: 'in_progress', progress: 0.5 })
    this.queueDirector(() => this.reviseGoal(goalId, decision), true)
  }

  private async requestRevision(goalId: string, director: Agent, decision: ChangesDecision, ctx: AgentRunContext) {
    const goal = await this.state.task(goalId)
    const subtasks = (await this.state.repo.listTasks()).filter(t => t.parentId === goalId)
    const revision = goal.revision + 1
    const lastWorker = [...subtasks].reverse().find(t => t.assigneeId !== null)?.assigneeId ?? director.id
    const targetId = decision.agentId ?? lastWorker
    const target = await this.state.agent(targetId)

    await this.state.patchTask(goalId, { status: 'in_progress', revision, progress: 0.5 })
    const task = newTask({
      title: `Aplicar cambios pedidos (versión ${revision + 1})`,
      description: decision.note,
      priority: goal.priority,
      parentId: goalId,
      assigneeId: target.id,
      // Sin esto el agente recibiría el pedido de cambios sin lo que hay que cambiar.
      dependsOn: subtasks.map(t => t.id),
      revision,
    })
    await this.state.repo.saveTask(task)
    await this.state.assign(task.id, target.id, director.id)

    await this.walk(director.id, `handoff:${target.id}`, ctx, `Llevándole los cambios a ${target.name}`)
    await this.state.emit({
      type: 'task.delegated',
      channel: 'system',
      text: `${director.name} le derivó los cambios a ${target.name}`,
      agentId: director.id,
      targetAgentId: target.id,
      taskId: task.id,
    })
    await ctx.sleep(HANDOFF_MS)
    await this.walk(director.id, 'desk', ctx)
    await this.setWorking(director.id, goalId, `Esperando los cambios de ${target.name}`, 0.2)
    await this.enqueue(task)
    await this.whenSettled(task.id)
    await ctx.checkpoint()
  }

  // ---- Revisión ----

  /** Deja la entrega en el mostrador. Lo que sigue lo hace `onDecision`, cuando decidas. */
  private async deliver(
    taskId: string,
    agentId: string,
    draft: ConsolidatedDeliverable,
    revision: number,
    ctx: AgentRunContext,
    onDecision: (decision: ReviewDecision) => Promise<void>,
  ) {
    await this.walk(agentId, 'review', ctx, 'Llevando la entrega a revisión')
    const deliverableId = newId('d')
    // Se escucha antes de mostrarla: una decisión rápida no se puede perder.
    this.awaitDecision(deliverableId, onDecision)
    await this.state.repo.saveDeliverable({
      id: deliverableId,
      taskId,
      agentId,
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      status: 'pending_review',
      simulated: this.state.profile.simulated,
      reviewable: true,
      revision,
      reviewNote: null,
      createdAt: nowIso(),
      reviewedAt: null,
    })
    await this.state.patchTask(taskId, { status: 'waiting_review', progress: 1, output: draft.body })
    await this.state.patchAgent(agentId, WAITING_REVIEW)
    await this.state.emit({
      type: 'task.waiting_review',
      channel: 'system',
      text: `${draft.title}: lista para tu revisión`,
      agentId,
      taskId,
    })
  }

  private awaitDecision(deliverableId: string, onDecision: (decision: ReviewDecision) => Promise<void>) {
    this.reviews.set(deliverableId, decision => {
      onDecision(decision).catch(error => console.error('[oficina] no se pudo aplicar tu decisión', error))
    })
  }

  /** Aprobada, rechazada o detenida. Si quien la entregó está libre, reacciona; si no, sigue con lo suyo. */
  private async conclude(taskId: string, agentId: string, decision: Exclude<ReviewDecision, ChangesDecision>) {
    if (decision.kind === 'approved') await this.finish(taskId)
    if (decision.kind === 'rejected') await this.fail(taskId, `Rechazada: ${decision.note}`)
    // El festejo y la alarma los dibuja la oficina con el evento: acá sólo cambia el estado.
    if (decision.kind === 'stopped' || this.busy.has(agentId)) {
      this.settleLater(agentId)
      return
    }

    this.busy.add(agentId)
    try {
      if (decision.kind === 'approved') {
        await this.state.patchAgent(agentId, { status: 'idle', statusDetail: '¡Aprobada!', mood: 'happy', activity: 0 })
        await delay(CELEBRATE_MS / SPEED)
      } else {
        await this.state.patchAgent(agentId, { status: 'idle', statusDetail: null, mood: 'sad', activity: 0 })
        await delay(REJECTED_MS / SPEED)
      }
    } finally {
      this.release(agentId)
      this.settleLater(agentId)
    }
  }

  // ---- Trabajo de cada agente ----

  private async enqueue(task: Task) {
    if (!task.assigneeId || this.queued.has(task.id)) return
    this.queued.add(task.id)
    await this.queue.enqueue({ taskId: task.id, agentId: task.assigneeId })
  }

  private async dispatchReady(parentId: string) {
    const tasks = await this.state.repo.listTasks()
    const siblings = tasks.filter(t => t.parentId === parentId && t.status === 'pending')
    for (const task of siblings) {
      const deps = tasks.filter(t => task.dependsOn.includes(t.id))
      const blocked = deps.find(d => d.status === 'failed' || d.status === 'cancelled')
      if (blocked) {
        // Si la anterior la cancelaste vos, ésta tampoco es un error: se cae con ella.
        if (blocked.status === 'cancelled') await this.cancel(task.id, `Dependía de "${blocked.title}", que se canceló.`)
        else await this.fail(task.id, `Dependía de "${blocked.title}", que no terminó.`)
        await this.dispatchReady(parentId)
        return
      }
      if (deps.every(d => d.status === 'done')) await this.enqueue(task)
    }
  }

  private async handleJob({ taskId, agentId }: AgentJob) {
    this.queued.delete(taskId)
    const task = await this.state.task(taskId)
    if (isClosed(task) || task.assigneeId !== agentId) return

    // Igual que en la dirección: si la cancelás o reasignás mientras espera, no arranca.
    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    await this.hold(agentId)
    const ctx = this.context(agentId, taskId, controller.signal)

    try {
      await ctx.checkpoint()
      await this.runJob(taskId, agentId, ctx)
    } catch (error) {
      if (!(error instanceof Interrupted)) await this.fail(taskId, reasonOf(error))
      else if (error.reason === 'reassigned') await this.enqueue(await this.state.task(taskId))
    } finally {
      this.controllers.delete(taskId)
      this.release(agentId)
      this.settleLater(agentId)
    }
  }

  private async runJob(taskId: string, agentId: string, ctx: AgentRunContext) {
    const task = await this.state.task(taskId)
    const agent = await this.state.agent(agentId)
    const output = await this.work(task, agent, this.revisionNotes.get(taskId) ?? null, ctx)
    this.revisionNotes.delete(taskId)

    // Una subtarea la revisa la dirección al consolidar; una tarea directa, vos.
    if (task.parentId !== null) {
      await this.finish(taskId, output)
      await this.handoff(task, agent, ctx)
      await this.dispatchReady(task.parentId)
      return
    }

    await this.deliver(
      taskId,
      agentId,
      {
        title: task.title,
        summary: `Tarea directa de ${agent.name}.${this.state.profile.simulated ? ' Simulada.' : ''}`,
        body: output,
      },
      task.revision,
      ctx,
      decision => this.onTaskDecision(taskId, agentId, decision),
    )
  }

  /** Pediste cambios en una tarea directa: vuelve a la cola de quien elegiste, como un trabajo más. */
  private async onTaskDecision(taskId: string, agentId: string, decision: ReviewDecision) {
    if (decision.kind !== 'changes') return this.conclude(taskId, agentId, decision)
    const task = await this.state.task(taskId)
    await this.state.patchTask(taskId, {
      status: 'pending',
      progress: 0,
      revision: task.revision + 1,
      description: `${task.description}\n\nCambio pedido: ${decision.note}`,
    })
    this.revisionNotes.set(taskId, decision.note)
    if (decision.agentId && decision.agentId !== task.assigneeId) await this.moveAssignment(taskId, decision.agentId)
    await this.enqueue(await this.state.task(taskId))
    this.settleLater(agentId)
  }

  private async work(task: Task, agent: Agent, revisionNote: string | null, ctx: AgentRunContext) {
    await this.state.patchTask(task.id, {
      status: 'in_progress',
      startedAt: task.startedAt ?? nowIso(),
      progress: 0,
    })
    await this.state.emit({
      type: 'task.started',
      channel: 'system',
      text: `${agent.name} arrancó: ${task.title}`,
      agentId: agent.id,
      taskId: task.id,
    })
    await this.walk(agent.id, 'desk', ctx)
    await this.setWorking(agent.id, task.id, task.title, 0.9)

    const tasks = await this.state.repo.listTasks()
    const context = tasks
      .filter(t => task.dependsOn.includes(t.id) && t.output)
      .map(t => ({ title: t.title, output: t.output ?? '' }))
    // Después de un reinicio no queda la nota exacta: el pedido está al final de la descripción.
    const note: string | null = revisionNote ?? (task.revision > 0 ? task.description : null)
    const goal = task.parentId ? await this.state.task(task.parentId) : null
    const { output } = await this.runner.work({ task, agent, goal, context, revisionNote: note }, ctx)
    return output
  }

  /** Si lo que sigue lo hace otro agente, se lo lleva caminando. */
  private async handoff(task: Task, agent: Agent, ctx: AgentRunContext) {
    const tasks = await this.state.repo.listTasks()
    const next = tasks.find(t => t.dependsOn.includes(task.id) && t.assigneeId !== agent.id)
    if (!next?.assigneeId) return
    const target = await this.state.agent(next.assigneeId)
    await this.walk(agent.id, `handoff:${target.id}`, ctx, `Llevándole los hallazgos a ${target.name}`)
    await this.state.emit({
      type: 'task.delegated',
      channel: 'system',
      text: `${agent.name} le derivó a ${target.name}: ${next.title}`,
      agentId: agent.id,
      targetAgentId: target.id,
      taskId: next.id,
    })
    await this.state.patchAgent(agent.id, { status: 'meeting', statusDetail: `Charlando con ${target.name}`, mood: 'happy' })
    await ctx.sleep(HANDOFF_MS)
  }

  // ---- Intervención humana ----

  decide(deliverableId: string, decision: ReviewDecision) {
    const resolve = this.reviews.get(deliverableId)
    if (!resolve) return false
    this.reviews.delete(deliverableId)
    resolve(decision)
    return true
  }

  async cancelTask(taskId: string) {
    const task = await this.state.task(taskId)
    if (isClosed(task)) return

    const children = (await this.state.repo.listTasks()).filter(t => t.parentId === taskId && !isClosed(t))
    for (const child of children) await this.cancelTask(child.id)

    // Se corta antes de marcarla: quien espera esta tarea sigue apenas queda cerrada.
    this.controllers.get(taskId)?.abort(new Interrupted('cancelled'))
    await this.queue.remove(taskId)
    this.queued.delete(taskId)
    this.revisionNotes.delete(taskId)
    await this.cancel(taskId, CANCELLED_BY_YOU)
    await this.closePendingReviews(taskId, CANCELLED_BY_YOU)
    if (task.parentId) await this.dispatchReady(task.parentId)
  }

  async reassign(taskId: string, agentId: string) {
    const task = await this.state.task(taskId)
    if (task.status !== 'pending' && task.status !== 'in_progress') return false
    if (task.assigneeId === agentId) return false

    await this.queue.remove(taskId)
    const wasQueued = this.queued.delete(taskId)
    const running = this.controllers.get(taskId)
    await this.moveAssignment(taskId, agentId)
    await this.state.patchTask(taskId, { status: 'pending', progress: 0 })

    if (running) running.abort(new Interrupted('reassigned'))
    else if (wasQueued) await this.enqueue(await this.state.task(taskId))
    return true
  }

  private async moveAssignment(taskId: string, agentId: string) {
    const task = await this.state.task(taskId)
    const from = task.assigneeId ? await this.state.agent(task.assigneeId) : null
    const to = await this.state.agent(agentId)
    await this.state.releaseAssignments(taskId, `Reasignada a ${to.name}`)
    await this.state.assign(taskId, agentId, 'human')
    await this.state.emit({
      type: 'task.reassigned',
      channel: 'system',
      text: `Reasignaste "${task.title}"${from ? ` de ${from.name}` : ''} a ${to.name}`,
      agentId: from?.id ?? null,
      targetAgentId: to.id,
      taskId,
    })
  }

  async stopAll() {
    for (const controller of this.controllers.values()) controller.abort(new Interrupted('stopped'))
    await this.queue.clear()
    this.queued.clear()
    this.directorTurns.length = 0
    this.revisionNotes.clear()
    const tasks = await this.state.repo.listTasks()
    for (const task of tasks) {
      if (!isClosed(task)) await this.cancel(task.id, STOPPED_BY_YOU)
      await this.closePendingReviews(task.id, STOPPED_BY_YOU)
    }
    await this.state.emit({ type: 'execution.stopped', channel: 'system', text: 'Detuviste toda la ejecución' })
  }

  private async closePendingReviews(taskId: string, note: string) {
    const deliverables = await this.state.repo.listDeliverables()
    for (const deliverable of deliverables) {
      if (deliverable.taskId !== taskId || deliverable.status !== 'pending_review') continue
      await this.state.repo.saveDeliverable({
        ...deliverable,
        status: 'cancelled',
        reviewNote: note,
        reviewedAt: nowIso(),
      })
      this.decide(deliverable.id, { kind: 'stopped' })
    }
  }

  /** Olvida todo lo que estaba en curso, para arrancar la Demo de cero. */
  async reset() {
    await this.stopAll()
    await delay(STOP_GRACE_MS) // los `sleep` en curso miran la señal cada 100 ms
    this.reviews.clear()
    this.busy.clear()
    this.settled.clear()
  }

  // ---- Piezas compartidas ----

  private context(agentId: string, taskId: string, signal: AbortSignal): AgentRunContext {
    const checkpoint = async () => {
      for (;;) {
        if (signal.aborted) throw signal.reason
        if (!this.state.isPaused(agentId)) return
        await delay(150)
      }
    }
    return {
      signal,
      checkpoint,
      sleep: async ms => {
        let left = ms / SPEED
        while (left > 0) {
          await checkpoint()
          const slice = Math.min(left, 100)
          await delay(slice)
          left -= slice
        }
        await checkpoint()
      },
      log: text => this.state.emit({ type: 'agent.log', channel: 'log', text, agentId, taskId }),
      reason: text => this.state.emit({ type: 'agent.reasoning', channel: 'reasoning', text, agentId, taskId }),
      progress: value => this.state.patchTask(taskId, { progress: Math.min(1, Math.max(0, value)) }),
      usage: (delta, costUsd) => this.state.addUsage(agentId, taskId, delta, costUsd),
    }
  }

  private async walk(agentId: string, location: AgentLocation, ctx: AgentRunContext, detail = 'Moviéndose') {
    const agent = await this.state.agent(agentId)
    if (agent.location === location) return
    await this.state.patchAgent(agentId, { status: 'walking', statusDetail: detail, location, activity: 0.4 })
    await ctx.sleep(location === 'meeting' ? MEETING_WALK_MS : WALK_MS)
  }

  private async setWorking(agentId: string, taskId: string, detail: string, activity: number) {
    await this.state.patchAgent(agentId, {
      status: 'working',
      statusDetail: detail,
      currentTaskId: taskId,
      mood: activity > 0.5 ? 'focused' : 'neutral',
      activity,
    })
  }

  private async finish(taskId: string, output?: string) {
    await this.close(taskId, { status: 'done', progress: 1, ...(output === undefined ? {} : { output }) }, 'Terminada', task => ({
      type: 'task.finished',
      text: `Terminó: ${task.title}`,
    }))
  }

  private async fail(taskId: string, reason: string) {
    await this.close(taskId, { status: 'failed', failureReason: reason }, reason, task => ({
      type: 'task.failed',
      text: `No se completó "${task.title}": ${reason}`,
    }))
  }

  /** Lo que cancelás no es un error: queda cerrada, con el motivo, y la oficina no hace sonar la alarma. */
  private async cancel(taskId: string, reason: string) {
    await this.close(taskId, { status: 'cancelled', failureReason: reason }, reason, task => ({
      type: 'task.cancelled',
      text: `Se canceló "${task.title}". ${reason}`,
    }))
  }

  /** Una tarea cerrada no se vuelve a cerrar: una cancelada no puede terminar como fallida. */
  private async close(
    taskId: string,
    patch: Partial<Task>,
    releaseReason: string,
    describe: (task: Task) => { type: OfficeEventType; text: string },
  ) {
    const task = await this.state.task(taskId)
    if (isClosed(task)) return
    await this.state.patchTask(taskId, { ...patch, finishedAt: nowIso() })
    await this.state.releaseAssignments(taskId, releaseReason)
    await this.state.emit({ ...describe(task), channel: 'system', agentId: task.assigneeId, taskId })
    this.settled.get(taskId)?.()
    this.settled.delete(taskId)
  }

  private async whenSettled(taskId: string) {
    if (isClosed(await this.state.task(taskId))) return
    await new Promise<void>(resolve => {
      const previous = this.settled.get(taskId)
      this.settled.set(taskId, () => {
        previous?.()
        resolve()
      })
    })
  }

  private async director() {
    const agents = await this.state.repo.listAgents()
    const director = agents.find(a => a.capability === 'manager')
    if (!director) throw new Error('No hay ningún agente con capacidad de dirección')
    return director
  }

  private async hold(agentId: string) {
    while (this.busy.has(agentId)) await delay(120)
    this.busy.add(agentId)
  }

  private release(agentId: string) {
    this.busy.delete(agentId)
  }

  // No se espera: si el agente tiene otro trabajo en cola, tiene que arrancarlo ya.
  private settleLater(agentId: string) {
    this.settle(agentId).catch(error => console.error(`[oficina] no se pudo liberar a ${agentId}`, error))
  }

  /** La última entrega suya que sigue esperando tu decisión. */
  private async awaitingReview(agentId: string) {
    const deliverables = await this.state.repo.listDeliverables()
    return deliverables.filter(d => d.agentId === agentId && d.status === 'pending_review').at(-1) ?? null
  }

  /**
   * Sin trabajo a la vista. Si tiene una entrega sin revisar, te espera al lado; si no,
   * descansa un rato y se va al lounge. Con trabajo en cola no espera: lo arranca.
   */
  private async settle(agentId: string) {
    if (this.busy.has(agentId)) return
    const agent = await this.state.agent(agentId)
    if (agent.location === 'review' && (await this.awaitingReview(agentId))) {
      await this.waitAtReview(agentId)
      return
    }
    if (this.busy.has(agentId)) return

    await this.state.patchAgent(agentId, {
      status: 'idle',
      statusDetail: null,
      currentTaskId: null,
      activity: 0,
    })
    await delay(SETTLE_MS / SPEED)
    const now = await this.state.agent(agentId)
    if (this.busy.has(agentId) || now.status !== 'idle') return

    const waiting = await this.awaitingReview(agentId)
    if (waiting || now.location !== 'lounge') {
      await this.state.patchAgent(agentId, {
        status: 'walking',
        statusDetail: waiting ? 'Volviendo a la mesa de revisión' : 'Yendo al lounge',
        location: waiting ? 'review' : 'lounge',
        mood: 'neutral',
        activity: 0.2,
      })
      await delay(WALK_MS / SPEED)
    }
    const after = await this.state.agent(agentId)
    if (this.busy.has(agentId) || after.status !== 'walking') return
    if (after.location === 'review') await this.waitAtReview(agentId)
    else await this.state.patchAgent(agentId, { status: 'idle', statusDetail: null, activity: 0 })
  }

  private async waitAtReview(agentId: string) {
    const waiting = await this.awaitingReview(agentId)
    if (this.busy.has(agentId)) return
    // Si decidiste mientras volvía, se queda libre ahí mismo.
    if (!waiting) await this.state.patchAgent(agentId, { status: 'idle', statusDetail: null, activity: 0 })
    else await this.state.patchAgent(agentId, { ...WAITING_REVIEW, location: 'review', currentTaskId: waiting.taskId })
  }
}
