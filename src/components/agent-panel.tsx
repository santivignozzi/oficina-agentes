'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Ban, Pause, Play, Plus, X } from 'lucide-react'
import type { OfficeCommand } from '@/domain/commands'
import type { Agent, OfficeEvent, OfficeSnapshot, TaskPriority } from '@/domain/types'
import { totalTokens } from '@/domain/types'
import { isActive } from '@/domain/selectors'
import { AGENT_STATUS, DELIVERABLE_STATUS, PRIORITY, TASK_STATUS, formatClock, formatTokens, formatUsd } from './format'
import { AgentDot, Badge, Button, Card, Progress, cn } from './ui'

type Tab = 'resumen' | 'actividad' | 'tareas' | 'entregas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'entregas', label: 'Entregas' },
]

interface Props {
  agent: Agent
  snapshot: OfficeSnapshot
  onClose(): void
  onCommand(command: OfficeCommand): Promise<boolean>
  onReview(deliverableId: string): void
}

export function AgentPanel({ agent, snapshot, onClose, onCommand, onReview }: Props) {
  const [tab, setTab] = useState<Tab>('resumen')
  const status = AGENT_STATUS[agent.status]

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden max-lg:rounded-b-none">
      <div className="flex items-start gap-3 px-4 pt-3">
        <span className="pt-1 [&>span]:size-9 [&>span]:text-base">
          <AgentDot name={agent.name} color={agent.appearance.accent} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-tight font-medium">{agent.name}</h2>
          <p className="truncate text-[13px] text-muted">{agent.role}</p>
        </div>
        <Button compact variant="ghost" onClick={onClose} aria-label="Cerrar el panel" className="w-9 max-lg:w-11">
          <X className="size-4.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {agent.statusDetail && <span className="min-w-0 truncate text-[13px] text-muted">{agent.statusDetail}</span>}
      </div>

      <div role="tablist" aria-label={`Información de ${agent.name}`} className="mt-2 flex gap-1 border-b border-line px-3">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'min-h-9 cursor-pointer border-b-2 px-2 text-[13px] font-semibold transition-colors max-lg:min-h-11',
              tab === item.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scroll-thin">
        {tab === 'resumen' && <Summary agent={agent} snapshot={snapshot} onCommand={onCommand} onReview={onReview} />}
        {tab === 'actividad' && <Activity agent={agent} events={snapshot.events} />}
        {tab === 'tareas' && <Tasks agent={agent} snapshot={snapshot} />}
        {tab === 'entregas' && <Deliverables agent={agent} snapshot={snapshot} onReview={onReview} />}
      </div>
    </Card>
  )
}

function Summary({ agent, snapshot, onCommand }: Omit<Props, 'onClose'>) {
  const task = snapshot.tasks.find(item => item.id === agent.currentTaskId) ?? null
  const paused = agent.status === 'paused'
  const live = !snapshot.controllable

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">{agent.description}</p>

      <div>
        <h3 className="mb-1 text-xs font-semibold text-muted">Tarea actual</h3>
        {task ? (
          <div className="rounded-xl bg-surface-2 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold">{task.title}</p>
              <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
            </div>
            {task.progress !== null && (
              <div className="mt-2">
                <Progress value={task.progress} color={agent.appearance.accent} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Sin tarea asignada.</p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold text-muted">Herramientas</h3>
        {agent.tools.length === 0 ? (
          <p className="text-[13px] text-muted">Todavía no usó ninguna en lo leído.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {agent.tools.map(tool => (
              <li key={tool} className="rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
                {tool}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-xl bg-surface-2 px-2.5 py-2">
          <dt className="text-xs text-muted">Tokens{snapshot.simulated ? ' simulados' : ''}</dt>
          <dd className="font-semibold">{formatTokens(totalTokens(agent.usage))}</dd>
          <dd className="text-xs text-muted">
            {formatTokens(agent.usage.input)} entrada · {formatTokens(agent.usage.output)} salida
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-2.5 py-2">
          <dt className="text-xs text-muted">Costo{snapshot.simulated ? ' simulado' : snapshot.billing ? ' estimado' : ''}</dt>
          <dd className="font-semibold">{agent.costUsd === null ? 'Sin dato' : formatUsd(agent.costUsd)}</dd>
        </div>
      </dl>

      {live ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
          {snapshot.billing
            ? 'Este agente no puede trabajar hasta que cargues la clave de Anthropic.'
            : 'Sólo lectura: esta sesión se controla desde Claude Code, no desde la oficina.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              compact
              onClick={() => void onCommand({ type: paused ? 'resume_agent' : 'pause_agent', agentId: agent.id })}
              disabled={!paused && agent.status === 'idle'}
            >
              {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              {paused ? 'Reanudar' : 'Pausar'}
            </Button>
            {task && isActive(task) && (
              <Button compact variant="danger" onClick={() => void onCommand({ type: 'cancel_task', taskId: task.id })}>
                <Ban className="size-4" aria-hidden="true" />
                Cancelar tarea
              </Button>
            )}
          </div>
          <AssignForm agent={agent} onCommand={onCommand} />
        </>
      )}
    </div>
  )
}

function AssignForm({ agent, onCommand }: Pick<Props, 'agent' | 'onCommand'>) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const ok = await onCommand({ type: 'assign_task', agentId: agent.id, title, description, priority })
    if (ok) {
      setTitle('')
      setDescription('')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-line p-2.5">
      <h3 className="text-xs font-semibold text-muted">Asignarle una tarea</h3>
      <label className="sr-only" htmlFor="assign-title">
        Título
      </label>
      <input
        id="assign-title"
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder="Título de la tarea"
        maxLength={160}
        className="min-h-10 rounded-lg border border-line-strong bg-bg px-2.5 text-[13px] placeholder:text-muted"
      />
      <label className="sr-only" htmlFor="assign-description">
        Detalle
      </label>
      <textarea
        id="assign-description"
        value={description}
        onChange={event => setDescription(event.target.value)}
        placeholder="Detalle (opcional)"
        rows={2}
        maxLength={2000}
        className="resize-none rounded-lg border border-line-strong bg-bg px-2.5 py-1.5 text-[13px] placeholder:text-muted"
      />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="assign-priority">
          Prioridad
        </label>
        <select
          id="assign-priority"
          value={priority}
          onChange={event => setPriority(event.target.value as TaskPriority)}
          className="min-h-9 flex-1 cursor-pointer rounded-lg border border-line-strong bg-surface px-2 text-[13px] max-lg:min-h-11"
        >
          {Object.entries(PRIORITY).map(([value, label]) => (
            <option key={value} value={value}>
              Prioridad {label.toLowerCase()}
            </option>
          ))}
        </select>
        <Button compact type="submit" variant="primary" disabled={title.trim().length === 0}>
          <Plus className="size-4" aria-hidden="true" />
          Asignar
        </Button>
      </div>
    </form>
  )
}

const CHANNELS: Record<OfficeEvent['channel'], string> = {
  system: 'Sistema',
  log: 'Registro',
  reasoning: 'Razonamiento',
  message: 'Mensaje',
}

function Activity({ agent, events }: { agent: Agent; events: OfficeEvent[] }) {
  const own = useMemo(
    () => events.filter(event => event.agentId === agent.id || event.targetAgentId === agent.id).slice(-60).reverse(),
    [events, agent.id],
  )
  if (own.length === 0) return <p className="text-[13px] text-muted">Todavía no hay actividad de {agent.name}.</p>

  return (
    <ol className="flex flex-col gap-2.5">
      {own.map(event => (
        <li key={event.id} className="text-[13px]">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-semibold">{CHANNELS[event.channel]}</span>
            <span className="font-mono">{formatClock(event.at)}</span>
          </p>
          <p className={cn(event.channel === 'reasoning' && 'text-muted italic')}>{event.text}</p>
        </li>
      ))}
    </ol>
  )
}

function Tasks({ agent, snapshot }: { agent: Agent; snapshot: OfficeSnapshot }) {
  const own = snapshot.tasks.filter(task => task.assigneeId === agent.id).reverse()
  if (own.length === 0) return <p className="text-[13px] text-muted">Sin tareas por ahora.</p>

  return (
    <ul className="flex flex-col gap-2">
      {own.map(task => (
        <li key={task.id} className="rounded-xl bg-surface-2 px-2.5 py-2 text-[13px]">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">{task.title}</span>
            <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
          </div>
          {task.failureReason && (
            <p className={cn('mt-1 text-xs', task.status === 'cancelled' ? 'text-muted' : 'text-bad')}>{task.failureReason}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Deliverables({ agent, snapshot, onReview }: Pick<Props, 'agent' | 'snapshot' | 'onReview'>) {
  const own = snapshot.deliverables.filter(item => item.agentId === agent.id).reverse()
  if (own.length === 0) return <p className="text-[13px] text-muted">Todavía no entregó nada.</p>

  return (
    <ul className="flex flex-col gap-2">
      {own.map(item => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onReview(item.id)}
            className="w-full cursor-pointer rounded-xl bg-surface-2 px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-3"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold">{item.title}</span>
              <Badge tone={DELIVERABLE_STATUS[item.status].tone}>{DELIVERABLE_STATUS[item.status].label}</Badge>
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{item.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
