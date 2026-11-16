import type { OfficeCommand } from '@/domain/commands'
import type { OfficeSnapshot } from '@/domain/types'
import type { AgentRunner, OfficeRepository } from '../ports'
import { InlineQueue } from './inline-queue'
import { OfficeState, nowIso, type OfficeProfile } from './office-state'
import { Orchestrator, type ReviewDecision } from './orchestrator'

export type CommandResult = { ok: true } | { ok: false; error: string }

export interface OfficeSetup {
  profile: OfficeProfile
  repo: OfficeRepository
  runner: AgentRunner
  seed(state: OfficeState): Promise<void>
}

/** Una oficina que se puede intervenir: recibe comandos y publica snapshots. */
export class ManagedOffice {
  private state: OfficeState
  private orchestrator: Orchestrator
  private seed: OfficeSetup['seed']
  private ready: Promise<void>

  constructor({ profile, repo, runner, seed }: OfficeSetup) {
    this.state = new OfficeState(repo, profile)
    this.orchestrator = new Orchestrator(this.state, new InlineQueue(), runner)
    this.seed = seed
    this.ready = seed(this.state).then(() => this.orchestrator.restore())
  }

  async snapshot(): Promise<OfficeSnapshot> {
    await this.ready
    return this.state.snapshot()
  }

  subscribe(listener: (snapshot: OfficeSnapshot) => void) {
    return this.state.subscribe(listener)
  }

  async execute(command: OfficeCommand): Promise<CommandResult> {
    await this.ready
    if (!this.state.profile.controllable) return { ok: false, error: 'Esta oficina no recibe comandos.' }
    switch (command.type) {
      case 'submit_goal':
        await this.orchestrator.submitGoal(command.text, command.priority)
        return { ok: true }
      case 'assign_task':
        await this.orchestrator.assignDirect(command.agentId, command.title, command.description, command.priority)
        return { ok: true }
      case 'pause_agent': {
        const agent = await this.state.agent(command.agentId)
        await this.state.pause(command.agentId)
        await this.state.emit({
          type: 'agent.paused',
          channel: 'system',
          text: `Pausaste a ${agent.name}`,
          agentId: agent.id,
        })
        return { ok: true }
      }
      case 'resume_agent': {
        const agent = await this.state.agent(command.agentId)
        await this.state.resume(command.agentId)
        await this.state.emit({
          type: 'agent.resumed',
          channel: 'system',
          text: `${agent.name} volvió a trabajar`,
          agentId: agent.id,
        })
        return { ok: true }
      }
      case 'cancel_task':
        await this.orchestrator.cancelTask(command.taskId)
        return { ok: true }
      case 'reassign_task': {
        const done = await this.orchestrator.reassign(command.taskId, command.agentId)
        return done ? { ok: true } : { ok: false, error: 'Esa tarea ya no se puede reasignar.' }
      }
      case 'approve':
        return this.review(command.deliverableId, 'approved', null, { kind: 'approved' })
      case 'reject':
        return this.review(command.deliverableId, 'rejected', command.note, {
          kind: 'rejected',
          note: command.note,
        })
      case 'request_changes':
        return this.review(command.deliverableId, 'changes_requested', command.note, {
          kind: 'changes',
          note: command.note,
          agentId: command.agentId,
        })
      case 'stop_all':
        await this.orchestrator.stopAll()
        return { ok: true }
      case 'reset':
        // Lo que produjeron agentes reales costó plata: no se borra con un botón.
        if (!this.state.profile.simulated) return { ok: false, error: 'Sólo se reinicia la Demo.' }
        await this.orchestrator.reset()
        this.state.clearPauses()
        await this.state.repo.clear()
        await this.seed(this.state)
        this.state.schedulePublish()
        return { ok: true }
    }
  }

  private async review(
    deliverableId: string,
    status: 'approved' | 'rejected' | 'changes_requested',
    note: string | null,
    decision: ReviewDecision,
  ): Promise<CommandResult> {
    const deliverable = await this.state.repo.getDeliverable(deliverableId)
    if (!deliverable || deliverable.status !== 'pending_review') {
      return { ok: false, error: 'Esa entrega ya no espera revisión.' }
    }
    const agent = await this.state.agent(deliverable.agentId)
    await this.state.repo.saveDeliverable({
      ...deliverable,
      status,
      reviewNote: note,
      reviewedAt: nowIso(),
    })
    const events = {
      approved: { type: 'review.approved', text: `Aprobaste "${deliverable.title}"` },
      rejected: { type: 'review.rejected', text: `Rechazaste "${deliverable.title}"` },
      changes_requested: { type: 'review.changes_requested', text: `Pediste cambios en "${deliverable.title}"` },
    } as const
    await this.state.emit({
      ...events[status],
      channel: 'system',
      agentId: agent.id,
      taskId: deliverable.taskId,
    })
    this.orchestrator.decide(deliverableId, decision)
    return { ok: true }
  }
}
