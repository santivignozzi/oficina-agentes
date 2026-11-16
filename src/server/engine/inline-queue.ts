import type { AgentJob, JobQueue } from '../ports'

/** Cola por agente dentro del proceso. BullMQ la reemplaza sin cambiar el contrato. */
export class InlineQueue implements JobQueue {
  private lanes = new Map<string, AgentJob[]>()
  private running = new Set<string>()
  private handler: ((job: AgentJob) => Promise<void>) | null = null

  process(handler: (job: AgentJob) => Promise<void>) {
    this.handler = handler
  }

  async enqueue(job: AgentJob) {
    const lane = this.lanes.get(job.agentId) ?? []
    lane.push(job)
    this.lanes.set(job.agentId, lane)
    this.pump(job.agentId)
  }

  async remove(taskId: string) {
    for (const lane of this.lanes.values()) {
      const index = lane.findIndex(job => job.taskId === taskId)
      if (index >= 0) lane.splice(index, 1)
    }
  }

  async clear() {
    this.lanes.clear()
  }

  private pump(agentId: string) {
    if (this.running.has(agentId) || !this.handler) return
    const job = this.lanes.get(agentId)?.shift()
    if (!job) return
    this.running.add(agentId)
    this.handler(job)
      .catch(error => {
        // El handler ya convierte en `failed` lo que sabe manejar; si llega acá
        // es un bug, y dejarlo mudo trabaría a este agente para siempre.
        console.error(`[demo] falló el trabajo ${job.taskId}`, error)
      })
      .finally(() => {
        this.running.delete(agentId)
        this.pump(agentId)
      })
  }
}
