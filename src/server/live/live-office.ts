import { promises as fs } from 'node:fs'
import { workerById } from '@/config'
import { computeMetrics } from '@/domain/selectors'
import {
  EMPTY_USAGE,
  type Agent,
  type Assignment,
  type Deliverable,
  type LiveSourceStatus,
  type OfficeEvent,
  type OfficeEventType,
  type OfficeSnapshot,
  type Task,
  type TaskStatus,
} from '@/domain/types'
import { findSessionByTitle, listProjectSessions, transcriptPath, type AppSession } from './app-sessions'
import { deriveState } from './derive'
import {
  APP_SESSIONS_DIR,
  LIVE_AGENTS,
  LIVE_PROJECT_PATH,
  OFFLINE_DEFAULTS,
  TRANSCRIPTS_DIR,
  type LiveAgentBinding,
} from './live-agents'
import { TranscriptReader, type EntryKind, type TeamTask, type TranscriptView } from './transcript'

const POLL_MS = 1_500
const SNAPSHOT_EVENTS = 160
const MAX_TOOLS_SHOWN = 8

interface Bound {
  binding: LiveAgentBinding
  session: AppSession | null
  view: TranscriptView | null
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** Oficina de sólo lectura: arma el mismo contrato que la Demo a partir del disco. */
export class LiveOffice {
  private readers = new Map<string, TranscriptReader>()
  private listeners = new Set<(snapshot: OfficeSnapshot) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastFingerprint = ''

  subscribe(listener: (snapshot: OfficeSnapshot) => void) {
    this.listeners.add(listener)
    this.timer ??= setInterval(() => void this.tick(), POLL_MS)
    return () => {
      this.listeners.delete(listener)
      // Sin nadie mirando no se toca el disco.
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  private async tick() {
    try {
      const snapshot = await this.snapshot()
      // Sin `generatedAt`: cambia en cada vuelta y haría parecer que siempre hay novedades.
      const fingerprint = JSON.stringify({ ...snapshot, generatedAt: null })
      if (fingerprint === this.lastFingerprint) return
      this.lastFingerprint = fingerprint
      for (const listener of this.listeners) listener(snapshot)
    } catch (error) {
      // Una vuelta fallida no tumba la vista: la próxima lectura reintenta.
      console.error('[live] no se pudo leer el estado', error)
    }
  }

  async snapshot(): Promise<OfficeSnapshot> {
    const now = Date.now()
    const { dirFound, sessions } = await listProjectSessions(APP_SESSIONS_DIR, LIVE_PROJECT_PATH)
    const bound = await Promise.all(LIVE_AGENTS.map(binding => this.bind(binding, sessions)))

    const agents = bound.map(b => buildAgent(b, now))
    const peers = new Map(
      bound.flatMap(({ binding, session }) => [
        [binding.agent.id, binding.agent.id],
        [binding.sessionTitle.toLowerCase(), binding.agent.id],
        ...(session ? ([[session.sessionId, binding.agent.id]] as const) : []),
      ]),
    )

    const tasks = bound.flatMap(b => planTasks(b))
    const teamTasks = mergeTeamTasks(bound)
    tasks.push(...teamTasks.tasks)
    const deliverables = bound.flatMap(b => buildDeliverables(b))
    const events = bound
      .flatMap(b => buildEvents(b, peers))
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-SNAPSHOT_EVENTS)

    for (const agent of agents) {
      agent.currentTaskId =
        tasks.find(t => t.assigneeId === agent.id && t.status === 'in_progress' && t.parentId !== null)?.id ??
        tasks.find(t => t.assigneeId === agent.id && t.status === 'in_progress')?.id ??
        null
    }

    return {
      mode: 'live',
      controllable: false,
      simulated: false,
      agents,
      tasks,
      assignments: teamTasks.assignments,
      deliverables,
      events,
      metrics: computeMetrics(agents, tasks, deliverables, now, { costKnown: false }),
      live: await this.sourceStatus(dirFound, sessions.length, bound),
      billing: null,
      generatedAt: new Date(now).toISOString(),
    }
  }

  private async bind(binding: LiveAgentBinding, sessions: AppSession[]): Promise<Bound> {
    const session = findSessionByTitle(sessions, binding.sessionTitle)
    if (!session) return { binding, session: null, view: null }

    const file = transcriptPath(TRANSCRIPTS_DIR, session)
    let reader = this.readers.get(file)
    if (!reader) {
      reader = new TranscriptReader(file)
      this.readers.set(file, reader)
    }
    return { binding, session, view: await reader.refresh() }
  }

  private async sourceStatus(dirFound: boolean, seen: number, bound: Bound[]): Promise<LiveSourceStatus> {
    const transcriptsDirFound = await fs.stat(TRANSCRIPTS_DIR).then(
      () => true,
      () => false,
    )
    return {
      projectPath: LIVE_PROJECT_PATH,
      sessionsDirFound: dirFound,
      transcriptsDirFound,
      sessionsSeen: seen,
      bindings: bound.map(({ binding, session, view }) => ({
        agentId: binding.agent.id,
        title: binding.sessionTitle,
        sessionTitle: session?.title ?? null,
        sessionId: session?.sessionId ?? null,
        lastRecordAt: iso(view?.lastRecordAt ?? null),
        transcriptMissing: session !== null && view?.found === false,
      })),
      skippedRecords: bound.reduce((sum, b) => sum + (b.view?.skipped ?? 0), 0),
    }
  }
}

function buildAgent({ binding, session, view }: Bound, now: number): Agent {
  if (!session || !view?.found) return { ...binding.agent, ...OFFLINE_DEFAULTS }

  const tools = Object.entries(view.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOOLS_SHOWN)
    .map(([name]) => name)

  return {
    ...binding.agent,
    ...deriveState(view, session, now),
    tools,
    usage: view.usage,
    currentTaskId: null,
    costUsd: null, // hay tokens reales pero no un costo real: no se inventa
  }
}

function emptyTask(id: string, title: string, assigneeId: string, at: string): Task {
  return {
    id,
    title,
    description: title,
    status: 'pending',
    priority: 'normal',
    assigneeId,
    parentId: null,
    dependsOn: [],
    revision: 0,
    progress: null,
    output: null,
    failureReason: null,
    estimatedCostUsd: null,
    usage: EMPTY_USAGE,
    createdAt: at,
    startedAt: at,
    finishedAt: null,
    updatedAt: at,
  }
}

/** La lista de pasos de la sesión. Un turno cerrado no deja pendientes vigentes. */
function planTasks({ binding, view }: Bound): Task[] {
  if (!view || view.planAt === null) return []
  const at = iso(view.planAt) ?? ''
  const turnOpen = view.lastEvent !== 'turn_end'
  const completed = view.plan.filter(step => step.status === 'completed').length
  const statusOf: Record<string, TaskStatus> = {
    completed: 'done',
    in_progress: 'in_progress',
    pending: 'pending',
  }

  return view.plan.flatMap((step, index) => {
    const status = statusOf[step.status] ?? 'pending'
    if (!turnOpen && status !== 'done') return []
    return {
      ...emptyTask(`${binding.agent.id}:paso:${index}`, step.content, binding.agent.id, at),
      status,
      progress: status === 'done' ? 1 : status === 'in_progress' ? completed / view.plan.length : 0,
      finishedAt: status === 'done' ? at : null,
    }
  })
}

/**
 * Las tareas `T3` las crea el Analista y las cierra el informe del Programador, y
 * cada mitad queda en un transcript distinto: acá se juntan.
 */
function mergeTeamTasks(bound: Bound[]) {
  const byNumber = new Map<number, { task: TeamTask; ownerId: string; fromId: string | null }>()

  for (const { binding, view } of bound) {
    for (const task of view?.teamTasks ?? []) {
      const known = byNumber.get(task.number)
      const created = task.outcome === null
      if (!known) {
        byNumber.set(task.number, {
          task,
          ownerId: created ? executorOf(bound, binding.agent.id) : binding.agent.id,
          fromId: created ? binding.agent.id : null,
        })
        continue
      }
      byNumber.set(task.number, {
        task: {
          ...known.task,
          title: created ? task.title : known.task.title,
          at: Math.min(known.task.at, task.at),
          outcome: known.task.outcome ?? task.outcome,
          outcomeAt: known.task.outcomeAt ?? task.outcomeAt,
          report: known.task.report ?? task.report,
        },
        ownerId: created ? known.ownerId : binding.agent.id,
        fromId: known.fromId ?? (created ? binding.agent.id : null),
      })
    }
  }

  const tasks: Task[] = []
  const assignments: Assignment[] = []

  for (const { task, ownerId, fromId } of byNumber.values()) {
    const at = iso(task.at) ?? ''
    const id = `equipo:T${task.number}`
    const finishedAt = iso(task.outcomeAt)
    tasks.push({
      ...emptyTask(id, `T${task.number}: ${task.title}`, ownerId, at),
      status: task.outcome === 'hecha' ? 'done' : task.outcome === 'trabada' ? 'failed' : 'in_progress',
      output: task.report,
      failureReason: task.outcome === 'trabada' ? task.report : null,
      finishedAt,
      updatedAt: finishedAt ?? at,
    })
    assignments.push({
      id: `as:${id}`,
      taskId: id,
      agentId: ownerId,
      assignedBy: fromId ?? ownerId,
      assignedAt: at,
      releasedAt: finishedAt,
      reason: null,
    })
  }
  return { tasks, assignments }
}

/** Quién ejecuta lo que pide otro: el primero con sala técnica, y si no hay, el primero que no sea quien lo pide. */
function executorOf(bound: Bound[], senderId: string) {
  const others = bound.filter(b => b.binding.agent.id !== senderId)
  const technical = others.find(b => workerById(b.binding.agent.id)?.room.style === 'tecnica')
  return (technical ?? others[0])?.binding.agent.id ?? senderId
}

function buildDeliverables({ binding, view }: Bound): Deliverable[] {
  if (!view) return []
  const agentId = binding.agent.id

  const reports: Deliverable[] = view.reports.map((report, index) => ({
    id: report.id,
    taskId: `${agentId}:informe:${index}`,
    agentId,
    title: `Informe de ${binding.agent.name}`,
    summary: report.text,
    body: report.text,
    status: 'reported',
    simulated: false,
    reviewable: false,
    revision: 0,
    reviewNote: null,
    createdAt: iso(report.at) ?? '',
    reviewedAt: null,
  }))

  if (view.ask) {
    reports.push({
      id: `${agentId}:pregunta:${view.ask.at}`,
      taskId: `${agentId}:pregunta`,
      agentId,
      title: `${binding.agent.name} te pregunta`,
      summary: view.ask.question,
      body: view.ask.question,
      status: 'pending_review',
      simulated: false,
      reviewable: false,
      revision: 0,
      reviewNote: null,
      createdAt: iso(view.ask.at) ?? '',
      reviewedAt: null,
    })
  }
  return reports
}

const EVENT_BY_KIND: Record<EntryKind, { type: OfficeEventType; channel: OfficeEvent['channel'] }> = {
  log: { type: 'agent.log', channel: 'log' },
  reasoning: { type: 'agent.reasoning', channel: 'reasoning' },
  message_out: { type: 'agent.message', channel: 'message' },
  message_in: { type: 'agent.message', channel: 'message' },
  prompt: { type: 'task.created', channel: 'system' },
  report: { type: 'task.finished', channel: 'system' },
  ask: { type: 'task.waiting_review', channel: 'system' },
}

function buildEvents({ binding, view }: Bound, peers: Map<string, string>): OfficeEvent[] {
  if (!view) return []
  const agentId = binding.agent.id
  const name = binding.agent.name

  return view.entries.flatMap(entry => {
    const peerId = entry.peer ? (peers.get(entry.peer) ?? peers.get(entry.peer.toLowerCase()) ?? null) : null
    // Un mensaje entre los dos agentes está en los dos transcripts: se cuenta el saliente.
    if (entry.kind === 'message_in' && peerId) return []

    const text =
      entry.kind === 'prompt'
        ? `Le pediste a ${name}: ${entry.text}`
        : entry.kind === 'ask'
          ? `${name} te pregunta: ${entry.text}`
          : entry.kind === 'report'
            ? `${name} cerró el turno: ${entry.text}`
            : entry.text

    return {
      id: entry.id,
      at: iso(entry.at) ?? '',
      ...EVENT_BY_KIND[entry.kind],
      text,
      agentId,
      targetAgentId: entry.kind === 'message_out' ? peerId : null,
      taskId: null,
    }
  })
}
