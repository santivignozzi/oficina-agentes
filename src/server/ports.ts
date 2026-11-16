import type {
  Agent,
  AgentCapability,
  Assignment,
  Deliverable,
  OfficeEvent,
  Task,
  TokenUsage,
} from '@/domain/types'

// Puertos del motor. Demo y Agentes usan el mismo orquestador y cambian lo que está
// detrás; sumar BullMQ o Postgres tampoco toca el orquestador ni la pantalla.

/** Dónde vive el estado. Asíncrono porque el adaptador real va a ser Postgres. */
export interface OfficeRepository {
  listAgents(): Promise<Agent[]>
  getAgent(id: string): Promise<Agent | null>
  saveAgent(agent: Agent): Promise<void>
  /** Para quien se sacó de `oficina.config.ts`. Su historial queda. */
  removeAgent(id: string): Promise<void>
  listTasks(): Promise<Task[]>
  getTask(id: string): Promise<Task | null>
  saveTask(task: Task): Promise<void>
  listAssignments(): Promise<Assignment[]>
  saveAssignment(assignment: Assignment): Promise<void>
  listDeliverables(): Promise<Deliverable[]>
  getDeliverable(id: string): Promise<Deliverable | null>
  saveDeliverable(deliverable: Deliverable): Promise<void>
  appendEvent(event: OfficeEvent): Promise<void>
  listEvents(limit: number): Promise<OfficeEvent[]>
  clear(): Promise<void>
}

export interface AgentJob {
  taskId: string
  agentId: string
}

/** Cola de trabajos por agente. Cada agente hace una cosa por vez. */
export interface JobQueue {
  enqueue(job: AgentJob): Promise<void>
  /** Saca un trabajo que todavía no arrancó. */
  remove(taskId: string): Promise<void>
  process(handler: (job: AgentJob) => Promise<void>): void
  clear(): Promise<void>
}

/** Lo que el ejecutor puede hacer mientras corre, sin saber de la oficina. */
export interface AgentRunContext {
  /** Se dispara al detener, cancelar o reasignar: corta la llamada en curso. */
  signal: AbortSignal
  log(text: string): Promise<void>
  /** Razonamiento resumido, para el panel del agente. */
  reason(text: string): Promise<void>
  progress(value: number): Promise<void>
  /** Sin `costUsd`, el costo sale de la tarifa de ejemplo de Demo. */
  usage(delta: Partial<TokenUsage>, costUsd?: number): Promise<void>
  /** Espera mientras el agente está en pausa y corta si lo detuvieron. */
  checkpoint(): Promise<void>
  /** Espera respetando pausa y detención. */
  sleep(ms: number): Promise<void>
}

export interface PlannedSubtask {
  key: string
  title: string
  description: string
  capability: AgentCapability
  dependsOn: string[]
}

export interface PlanInput {
  goal: Task
}

export interface WorkInput {
  task: Task
  agent: Agent
  /** Consigna de la que salió. `null` si es una tarea directa. */
  goal: Task | null
  /** Salidas de las tareas de las que depende. */
  context: { title: string; output: string }[]
  /** Lo que pidió cambiar el humano, si es una revisión. */
  revisionNote: string | null
}

export interface WorkResult {
  output: string
}

export interface ConsolidateInput {
  goal: Task
  results: { agentName: string; title: string; output: string; failed: boolean }[]
  revision: number
  revisionNote: string | null
}

export interface ConsolidatedDeliverable {
  title: string
  summary: string
  body: string
}

/**
 * El ejecutor de agentes. `ScriptedRunner` lo simula y `ClaudeRunner` llama al
 * modelo, usando `ctx` a medida que responde.
 */
export interface AgentRunner {
  plan(input: PlanInput, ctx: AgentRunContext): Promise<PlannedSubtask[]>
  work(input: WorkInput, ctx: AgentRunContext): Promise<WorkResult>
  consolidate(input: ConsolidateInput, ctx: AgentRunContext): Promise<ConsolidatedDeliverable>
}
