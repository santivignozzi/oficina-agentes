import type { Agent, Assignment, Deliverable, OfficeEvent, Task } from '@/domain/types'
import type { OfficeRepository } from '../ports'

const MAX_EVENTS = 400

/** Adaptador en memoria: se pierde al reiniciar el server. `changed` es para quien quiera guardarlo. */
export class MemoryRepository implements OfficeRepository {
  protected agents = new Map<string, Agent>()
  protected tasks = new Map<string, Task>()
  protected assignments = new Map<string, Assignment>()
  protected deliverables = new Map<string, Deliverable>()
  protected events: OfficeEvent[] = []

  protected changed() {}

  async listAgents() {
    return [...this.agents.values()]
  }
  async getAgent(id: string) {
    return this.agents.get(id) ?? null
  }
  async saveAgent(agent: Agent) {
    this.agents.set(agent.id, agent)
    this.changed()
  }
  async removeAgent(id: string) {
    if (this.agents.delete(id)) this.changed()
  }
  async listTasks() {
    return [...this.tasks.values()]
  }
  async getTask(id: string) {
    return this.tasks.get(id) ?? null
  }
  async saveTask(task: Task) {
    this.tasks.set(task.id, task)
    this.changed()
  }
  async listAssignments() {
    return [...this.assignments.values()]
  }
  async saveAssignment(assignment: Assignment) {
    this.assignments.set(assignment.id, assignment)
    this.changed()
  }
  async listDeliverables() {
    return [...this.deliverables.values()]
  }
  async getDeliverable(id: string) {
    return this.deliverables.get(id) ?? null
  }
  async saveDeliverable(deliverable: Deliverable) {
    this.deliverables.set(deliverable.id, deliverable)
    this.changed()
  }
  async appendEvent(event: OfficeEvent) {
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS)
    this.changed()
  }
  async listEvents(limit: number) {
    return this.events.slice(-limit)
  }
  async clear() {
    this.agents.clear()
    this.tasks.clear()
    this.assignments.clear()
    this.deliverables.clear()
    this.events = []
    this.changed()
  }
}
