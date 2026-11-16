// Contrato de estado de la oficina. Demo, En vivo y Agentes producen exactamente
// esto, y la pantalla no sabe de dónde vino: por eso nada de acá depende del motor.

export type OfficeMode = 'demo' | 'live' | 'agents'

/** `cancelled` lo decidiste vos: no es un error y la oficina no lo trata como tal. */
export type TaskStatus = 'pending' | 'in_progress' | 'waiting_review' | 'done' | 'failed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high'

export type AgentStatus =
  | 'idle'
  | 'working'
  | 'walking'
  | 'meeting'
  | 'waiting_approval'
  | 'paused'
  | 'offline'

export type AgentMood = 'neutral' | 'focused' | 'happy' | 'worried' | 'sad'

/**
 * Por esto reparte la dirección. La dirección es `manager`; cada agente lleva su id de
 * `oficina.config.ts`.
 */
export type AgentCapability = string

/** Dónde está el agente. `handoff:<id>` es parado al lado del escritorio de otro. */
export type AgentLocation = 'desk' | 'meeting' | 'lounge' | 'review' | `handoff:${string}`

export type HairStyle = 'bob' | 'curly' | 'short' | 'bun' | 'buzz' | 'long'
export type OutfitStyle = 'blazer' | 'sweater' | 'hoodie' | 'shirt'
export type Accessory = 'glasses' | 'headset' | 'none'

export interface AgentAppearance {
  skin: string
  hair: string
  hairStyle: HairStyle
  outfit: string
  outfitStyle: OutfitStyle
  /** Si no está, sale del estilo de ropa. */
  pants?: string
  accessory: Accessory
  /** Color que identifica al agente en la oficina y en los paneles. */
  accent: string
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  capability: AgentCapability
  tools: string[]
  appearance: AgentAppearance
  /** Escritorio del plano. Se refiere a `DESKS` en `office/layout.ts`. */
  deskId: string
  status: AgentStatus
  /** Frase corta para el globo y el panel: qué está pasando ahora. */
  statusDetail: string | null
  mood: AgentMood
  location: AgentLocation
  currentTaskId: string | null
  /** 0 a 1. Mueve la velocidad de tipeo y las partículas. */
  activity: number
  usage: TokenUsage
  /** `null` si no hay un costo que se pueda sostener con datos. */
  costUsd: number | null
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  /** Consigna de la que salió. `null` si es la raíz o una tarea directa. */
  parentId: string | null
  dependsOn: string[]
  /** Cuántas veces se pidieron cambios. */
  revision: number
  /** 0 a 1. `null` si la fuente no permite estimarlo. */
  progress: number | null
  output: string | null
  failureReason: string | null
  estimatedCostUsd: number | null
  usage: TokenUsage
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
}

export interface Assignment {
  id: string
  taskId: string
  agentId: string
  /** `human` o el id del agente que la asignó. */
  assignedBy: string
  assignedAt: string
  releasedAt: string | null
  reason: string | null
}

export type EventChannel = 'system' | 'log' | 'reasoning' | 'message'

export type OfficeEventType =
  | 'task.created'
  | 'task.assigned'
  | 'task.started'
  | 'task.delegated'
  | 'task.finished'
  | 'task.failed'
  | 'task.cancelled'
  | 'task.reassigned'
  | 'task.waiting_review'
  | 'review.approved'
  | 'review.rejected'
  | 'review.changes_requested'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.log'
  | 'agent.reasoning'
  | 'agent.message'
  | 'execution.stopped'

export interface OfficeEvent {
  id: string
  at: string
  type: OfficeEventType
  channel: EventChannel
  text: string
  agentId: string | null
  targetAgentId: string | null
  taskId: string | null
}

/**
 * `reported` es un informe que nadie revisa: en En vivo no se aprueba nada desde acá.
 * `cancelled` es una entrega que se cayó porque cancelaste o detuviste su tarea.
 */
export type DeliverableStatus = 'pending_review' | 'approved' | 'rejected' | 'changes_requested' | 'reported' | 'cancelled'

export interface Deliverable {
  id: string
  taskId: string
  agentId: string
  title: string
  summary: string
  /** Markdown. */
  body: string
  status: DeliverableStatus
  /** `true` en Demo: lo simulado se rotula como simulado. */
  simulated: boolean
  /** En En vivo es `false`: sólo se lee. */
  reviewable: boolean
  revision: number
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface Bottleneck {
  id: string
  severity: 'info' | 'warning'
  text: string
  agentId: string | null
  taskId: string | null
}

export interface OfficeMetrics {
  agentsOnline: number
  agentsTotal: number
  activeTasks: number
  finishedTasks: number
  failedTasks: number
  cancelledTasks: number
  pendingReviews: number
  tokens: TokenUsage
  /** `null` si la fuente no da un costo que se pueda sostener. */
  costUsd: number | null
  bottlenecks: Bottleneck[]
}

/** Qué vio el lector de En vivo. Permite explicar un estado vacío sin adivinar. */
export interface LiveSourceStatus {
  projectPath: string
  sessionsDirFound: boolean
  transcriptsDirFound: boolean
  /** Sesiones del proyecto que conoce la app. */
  sessionsSeen: number
  bindings: {
    agentId: string
    title: string
    sessionTitle: string | null
    sessionId: string | null
    lastRecordAt: string | null
    transcriptMissing: boolean
  }[]
  /** Registros que no se pudieron interpretar: si crece, cambió el formato. */
  skippedRecords: number
}

/** Lo que cuesta el modo Agentes. Es la única fuente que gasta plata de verdad. */
export interface BillingStatus {
  /** `false` si falta la clave: la oficina se ve pero no recibe comandos. */
  configured: boolean
  models: Record<AgentCapability, string>
  /** Tope del mes. Con el tope alcanzado, los agentes dejan de llamar al modelo. */
  budgetUsd: number
  spentUsd: number
}

export interface OfficeSnapshot {
  mode: OfficeMode
  /** `false` en En vivo y en Agentes sin clave: la pantalla esconde los controles y explica por qué. */
  controllable: boolean
  simulated: boolean
  agents: Agent[]
  tasks: Task[]
  assignments: Assignment[]
  deliverables: Deliverable[]
  /** Los más nuevos al final. */
  events: OfficeEvent[]
  metrics: OfficeMetrics
  live: LiveSourceStatus | null
  billing: BillingStatus | null
  generatedAt: string
}

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export function addUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  return {
    input: a.input + (b.input ?? 0),
    output: a.output + (b.output ?? 0),
    cacheRead: a.cacheRead + (b.cacheRead ?? 0),
    cacheWrite: a.cacheWrite + (b.cacheWrite ?? 0),
  }
}

export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}
