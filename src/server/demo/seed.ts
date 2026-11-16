import { EMPTY_USAGE } from '@/domain/types'
import { createAgents, MANAGER } from '@/config'
import { estimateCostUsd, newId, type OfficeState } from '../engine/office-state'

const MINUTE = 60_000

// Historial de ejemplo para que el panel no arranque vacío. Es mock y se ve como
// tal: Demo rotula todo como simulado.
// Va en orden: la dirección y los primeros agentes de la configuración.
const HISTORY = [
  { title: 'Ordenar el backlog de la semana', minutesAgo: 95, input: 8_200, output: 2_600 },
  { title: 'Resumir las notas de la última reunión', minutesAgo: 60, input: 12_400, output: 3_900 },
  { title: 'Preparar un primer borrador para revisar', minutesAgo: 25, input: 15_800, output: 6_100 },
]

export async function seedDemo(state: OfficeState) {
  const agents = createAgents()

  for (const [index, item] of HISTORY.entries()) {
    const agent = agents[index]
    if (!agent) continue

    const usage = { ...EMPTY_USAGE, input: item.input, output: item.output }
    const finishedAt = new Date(Date.now() - item.minutesAgo * MINUTE).toISOString()
    const startedAt = new Date(Date.now() - (item.minutesAgo + 12) * MINUTE).toISOString()
    const taskId = newId('t')

    agent.usage = usage
    agent.costUsd = estimateCostUsd(usage)

    await state.repo.saveTask({
      id: taskId,
      title: item.title,
      description: item.title,
      status: 'done',
      priority: 'normal',
      assigneeId: agent.id,
      parentId: null,
      dependsOn: [],
      revision: 0,
      progress: 1,
      output: 'Ejemplo del historial de la Demo.',
      failureReason: null,
      estimatedCostUsd: estimateCostUsd(usage),
      usage,
      createdAt: startedAt,
      startedAt,
      finishedAt,
      updatedAt: finishedAt,
    })
    await state.repo.saveDeliverable({
      id: newId('d'),
      taskId,
      agentId: agent.id,
      title: item.title,
      summary: 'Ejemplo del historial. Simulado.',
      body: '> **Entrega simulada.** Es un ejemplo para que el panel no arranque vacío.',
      status: 'approved',
      simulated: true,
      reviewable: true,
      revision: 0,
      reviewNote: null,
      createdAt: finishedAt,
      reviewedAt: finishedAt,
    })
    await state.repo.appendEvent({
      id: newId('ev'),
      at: finishedAt,
      type: 'review.approved',
      channel: 'system',
      text: `Aprobaste "${item.title}"`,
      agentId: agent.id,
      targetAgentId: null,
      taskId,
    })
  }

  // La dirección arranca en su escritorio para que la oficina no abra con todos en el sofá.
  for (const agent of agents) {
    await state.repo.saveAgent(agent.capability === MANAGER ? { ...agent, location: 'desk' } : agent)
  }
}
