'use client'

import { useMemo } from 'react'
import { Ban } from 'lucide-react'
import type { OfficeCommand } from '@/domain/commands'
import type { OfficeEvent, OfficeSnapshot, Task } from '@/domain/types'
import { isActive } from '@/domain/selectors'
import { TASK_STATUS, formatClock } from './format'
import { AgentDot, Badge, Button, Card, CardTitle, Progress, cn } from './ui'

interface Props {
  snapshot: OfficeSnapshot
  onCommand(command: OfficeCommand): Promise<boolean>
}

export function Dock({ snapshot, onCommand }: Props) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <TaskList snapshot={snapshot} onCommand={onCommand} />
      <ActivityFeed snapshot={snapshot} />
    </div>
  )
}

function TaskList({ snapshot, onCommand }: Props) {
  const tasks = useMemo(() => {
    // Primero lo que está vivo; lo terminado queda abajo, lo más nuevo arriba.
    const items = [...snapshot.tasks].reverse()
    return [...items.filter(isActive), ...items.filter(task => !isActive(task))]
  }, [snapshot.tasks])

  const activeCount = snapshot.metrics.activeTasks

  return (
    <Card className="flex min-h-0 flex-col max-md:max-h-96">
      <div className="px-3.5 pt-2.5">
        <CardTitle aside={<span className="text-xs text-muted">{activeCount} activas</span>}>Tareas</CardTitle>
      </div>
      {tasks.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px] text-muted">Todavía no hay tareas.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2 scroll-thin">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} snapshot={snapshot} onCommand={onCommand} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function TaskRow({ task, snapshot, onCommand }: Props & { task: Task }) {
  const assignee = snapshot.agents.find(agent => agent.id === task.assigneeId)
  const status = TASK_STATUS[task.status]
  const canManage = snapshot.controllable && isActive(task)
  // Una consigna con subtareas la coordina la dirección: lo que se reasigna son sus partes.
  const groups = snapshot.tasks.some(item => item.parentId === task.id)
  const others = groups ? [] : snapshot.agents.filter(agent => agent.id !== task.assigneeId && agent.capability !== 'manager')

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1 hover:bg-surface-2">
      {assignee ? <AgentDot name={assignee.name} color={assignee.appearance.accent} /> : <span className="size-6 shrink-0" />}
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-[13px] font-medium" title={task.title}>
          {task.title}
        </p>
        {task.status === 'in_progress' && task.progress !== null && (
          <Progress value={task.progress} color={assignee?.appearance.accent} />
        )}
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      {canManage && (
        <>
          {others.length > 0 && (
            <label className="contents">
              <span className="sr-only">Reasignar «{task.title}»</span>
              <select
                value=""
                onChange={event => void onCommand({ type: 'reassign_task', taskId: task.id, agentId: event.target.value })}
                className="min-h-7 w-24 cursor-pointer rounded-lg border border-line-strong bg-surface px-1 text-xs text-muted max-lg:min-h-11"
              >
                <option value="">Reasignar</option>
                {others.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            compact
            variant="ghost"
            onClick={() => void onCommand({ type: 'cancel_task', taskId: task.id })}
            aria-label={`Cancelar «${task.title}»`}
            title="Cancelar tarea"
            className="min-h-7 w-7 px-0 max-lg:w-11"
          >
            <Ban className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </li>
  )
}

function ActivityFeed({ snapshot }: { snapshot: OfficeSnapshot }) {
  const events = useMemo(
    () => snapshot.events.filter(event => event.channel !== 'reasoning').slice(-40).reverse(),
    [snapshot.events],
  )
  // Los avisos del sistema ya nombran a quien corresponde; el registro está en primera persona.
  const nameOf = (event: OfficeEvent) =>
    event.channel === 'log' ? snapshot.agents.find(agent => agent.id === event.agentId) : undefined

  return (
    <Card className="flex min-h-0 flex-col max-md:max-h-80">
      <div className="px-3.5 pt-2.5">
        <CardTitle>Actividad</CardTitle>
      </div>
      {events.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px] text-muted">Sin movimiento todavía.</p>
      ) : (
        <ol aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-1 pb-2 scroll-thin">
          {events.map(event => {
            const agent = nameOf(event)
            return (
              <li key={event.id} className="flex gap-2 py-0.5 text-[13px]">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted">{formatClock(event.at).slice(0, 5)}</span>
                <span className={cn('min-w-0', event.channel === 'system' && 'text-muted')}>
                  {agent && (
                    <strong className="font-semibold" style={{ color: 'var(--ink)' }}>
                      {agent.name}{' '}
                    </strong>
                  )}
                  {event.text}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
