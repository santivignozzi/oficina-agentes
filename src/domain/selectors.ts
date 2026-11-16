import {
  addUsage,
  EMPTY_USAGE,
  type Agent,
  type Bottleneck,
  type Deliverable,
  type OfficeMetrics,
  type Task,
} from './types'

const REVIEW_WAIT_WARNING_MS = 45_000
const PENDING_WAIT_WARNING_MS = 20_000

export function isActive(task: Task): boolean {
  return task.status === 'pending' || task.status === 'in_progress'
}

/** Ya no va a cambiar: terminó, falló o la cancelaste. */
export function isClosed(task: Task): boolean {
  return task.status === 'done' || task.status === 'failed' || task.status === 'cancelled'
}

/**
 * Las subtareas se cuentan una vez: la raíz sólo agrupa. La excepción es una consigna
 * rechazada o cancelada cuando sus subtareas ya habían terminado: el final lo tiene sólo
 * ella, así que si no se contara el panel diría "0 fallidas" después de un rechazo.
 */
function isCountable(task: Task, tasks: Task[]): boolean {
  if (task.parentId !== null) return true
  const children = tasks.filter(t => t.parentId === task.id)
  if (children.length === 0) return true
  const ended = task.status === 'failed' || task.status === 'cancelled'
  return ended && !children.some(t => t.status === task.status)
}

export function findBottlenecks(
  agents: Agent[],
  tasks: Task[],
  deliverables: Deliverable[],
  now: number,
): Bottleneck[] {
  const out: Bottleneck[] = []
  const agentName = (agentId: string | null) => agents.find(a => a.id === agentId)?.name ?? 'alguien'

  for (const deliverable of deliverables) {
    if (deliverable.status !== 'pending_review' || !deliverable.reviewable) continue
    const waited = now - Date.parse(deliverable.createdAt)
    out.push({
      id: `review:${deliverable.id}`,
      severity: waited > REVIEW_WAIT_WARNING_MS ? 'warning' : 'info',
      text: `"${deliverable.title}" espera tu revisión`,
      agentId: deliverable.agentId,
      taskId: deliverable.taskId,
    })
  }

  for (const agent of agents) {
    if (agent.status !== 'paused') continue
    const blocked = tasks.filter(t => t.assigneeId === agent.id && isActive(t)).length
    if (blocked === 0) continue
    out.push({
      id: `paused:${agent.id}`,
      severity: 'warning',
      text: `${agent.name} está en pausa con ${blocked === 1 ? '1 tarea' : `${blocked} tareas`} sin avanzar`,
      agentId: agent.id,
      taskId: null,
    })
  }

  for (const task of tasks) {
    if (task.status !== 'pending' || task.assigneeId === null) continue
    if (now - Date.parse(task.createdAt) < PENDING_WAIT_WARNING_MS) continue
    const waitingOn = tasks.find(t => task.dependsOn.includes(t.id) && t.status !== 'done')
    out.push({
      id: `pending:${task.id}`,
      severity: 'info',
      text: waitingOn
        ? `"${task.title}" espera a "${waitingOn.title}"`
        : `"${task.title}" hace cola con ${agentName(task.assigneeId)}`,
      agentId: task.assigneeId,
      taskId: task.id,
    })
  }

  return out
}

export function computeMetrics(
  agents: Agent[],
  tasks: Task[],
  deliverables: Deliverable[],
  now: number,
  options: { costKnown: boolean },
): OfficeMetrics {
  const countable = tasks.filter(t => isCountable(t, tasks))
  const tokens = agents.reduce((sum, a) => addUsage(sum, a.usage), EMPTY_USAGE)
  return {
    agentsOnline: agents.filter(a => a.status !== 'offline').length,
    agentsTotal: agents.length,
    activeTasks: countable.filter(isActive).length,
    finishedTasks: countable.filter(t => t.status === 'done').length,
    failedTasks: countable.filter(t => t.status === 'failed').length,
    cancelledTasks: countable.filter(t => t.status === 'cancelled').length,
    pendingReviews: deliverables.filter(d => d.status === 'pending_review').length,
    tokens,
    costUsd: options.costKnown ? agents.reduce((sum, a) => sum + (a.costUsd ?? 0), 0) : null,
    bottlenecks: findBottlenecks(agents, tasks, deliverables, now),
  }
}
