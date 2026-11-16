import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Agent, Assignment, Deliverable, OfficeEvent, Task } from '@/domain/types'
import { MemoryRepository } from '../engine/memory-repository'

// Guarda el estado en un JSON local: lo que entregan los agentes costó plata y no se
// puede perder por reiniciar el server. La etapa 4 lo reemplaza por Postgres.

interface SavedOffice {
  agents: Agent[]
  tasks: Task[]
  assignments: Assignment[]
  deliverables: Deliverable[]
  events: OfficeEvent[]
}

const SAVE_DELAY_MS = 400

export class FileRepository extends MemoryRepository {
  private timer: ReturnType<typeof setTimeout> | null = null
  private loading = false

  constructor(private file: string) {
    super()
  }

  /** Devuelve `false` si no había nada guardado. */
  load() {
    let saved: SavedOffice
    try {
      saved = JSON.parse(readFileSync(this.file, 'utf8')) as SavedOffice
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      // Se aparta en vez de pisarlo: ahí adentro puede haber entregas pagas.
      renameSync(this.file, `${this.file}.roto`)
      console.error('[agentes] el archivo de estado no se pudo leer y quedó como .roto', error)
      return false
    }
    this.loading = true
    for (const agent of saved.agents) this.agents.set(agent.id, agent)
    for (const task of saved.tasks) this.tasks.set(task.id, task)
    for (const assignment of saved.assignments) this.assignments.set(assignment.id, assignment)
    for (const deliverable of saved.deliverables) this.deliverables.set(deliverable.id, deliverable)
    this.events = saved.events
    this.loading = false
    return true
  }

  // Una entrega no espera la tanda: es lo que se pagó, y un corte justo ahí la perdería.
  async saveDeliverable(deliverable: Deliverable) {
    await super.saveDeliverable(deliverable)
    this.write()
  }

  // Lo mismo con una consigna nueva: ya le dijimos que salió, no puede desaparecer sin aviso.
  async saveTask(task: Task) {
    const isNew = !this.tasks.has(task.id)
    await super.saveTask(task)
    if (isNew) this.write()
  }

  /** Guarda lo que quedó en la tanda antes de que se apague el proceso. */
  flush() {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    this.write()
  }

  protected changed() {
    if (this.loading || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.write()
    }, SAVE_DELAY_MS)
    this.timer.unref()
  }

  private write() {
    const saved: SavedOffice = {
      agents: [...this.agents.values()],
      tasks: [...this.tasks.values()],
      assignments: [...this.assignments.values()],
      deliverables: [...this.deliverables.values()],
      events: this.events,
    }
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
}
