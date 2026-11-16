'use client'

import { AlertTriangle, Ban, CheckCircle2, CircleDashed, FileClock, XCircle } from 'lucide-react'
import type { OfficeSnapshot } from '@/domain/types'
import { totalTokens } from '@/domain/types'
import { AGENT_STATUS, formatTokens, formatUsd } from './format'
import { AgentDot, Badge, Button, Card, CardTitle } from './ui'

interface Props {
  snapshot: OfficeSnapshot
  onSelectAgent(id: string): void
  onReview(deliverableId: string): void
}

export function SupervisionPanel({ snapshot, onSelectAgent, onReview }: Props) {
  const { metrics, agents, deliverables, simulated } = snapshot
  const pending = deliverables.filter(item => item.status === 'pending_review')
  const agentOf = (id: string) => agents.find(agent => agent.id === id)
  const skipped = snapshot.live?.skippedRecords ?? 0

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-3">
        <CardTitle>Supervisión</CardTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4 scroll-thin">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted">Esperando tu revisión</h3>
          {pending.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">Nada por revisar. Cuando un agente entregue, aparece acá.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map(item => {
                const agent = agentOf(item.agentId)
                return (
                  <li key={item.id} className="animate-rise rounded-xl border border-warn/40 bg-warn-soft/60 p-2.5">
                    <p className="flex items-start gap-1.5 text-[13px] font-semibold">
                      <FileClock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                      {item.title}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted">
                        {agent?.name ?? 'Agente'} · v{item.revision + 1}
                        {item.simulated && ' · simulada'}
                      </span>
                      <Button compact variant="primary" onClick={() => onReview(item.id)}>
                        {item.reviewable ? 'Revisar' : 'Ver'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {metrics.bottlenecks.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold text-muted">Cuellos de botella</h3>
            <ul className="flex flex-col gap-1.5">
              {metrics.bottlenecks.map(item => (
                <li key={item.id} className="flex items-start gap-1.5 text-[13px]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted">Equipo</h3>
          <ul className="flex flex-col gap-1">
            {agents.map(agent => {
              const status = AGENT_STATUS[agent.status]
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAgent(agent.id)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
                  >
                    <AgentDot name={agent.name} color={agent.appearance.accent} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{agent.name}</span>
                      <span className="block truncate text-xs text-muted">{agent.statusDetail ?? agent.role}</span>
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted">Resultados</h3>
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            <Stat icon={<CircleDashed className="size-4 text-info" aria-hidden="true" />} label="Activas" value={metrics.activeTasks} />
            <Stat icon={<CheckCircle2 className="size-4 text-good" aria-hidden="true" />} label="Finalizadas" value={metrics.finishedTasks} />
            <Stat icon={<XCircle className="size-4 text-bad" aria-hidden="true" />} label="Fallidas" value={metrics.failedTasks} />
            <Stat icon={<Ban className="size-4 text-muted" aria-hidden="true" />} label="Canceladas" value={metrics.cancelledTasks} />
            <div className="col-span-2 rounded-xl bg-surface-2 px-2.5 py-2">
              <dt className="text-xs text-muted">Tokens</dt>
              <dd className="font-semibold">{formatTokens(totalTokens(metrics.tokens))}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {metrics.costUsd === null
              ? 'Sin costo: las sesiones de En vivo no informan precio, así que no se calcula uno.'
              : simulated
                ? `Costo simulado aproximado: ${formatUsd(metrics.costUsd)}, con una tarifa de ejemplo.`
                : `Costo estimado con precios de lista: ${formatUsd(metrics.costUsd)}. El valor final es el que factura Anthropic.`}
          </p>
          {skipped > 0 && (
            <p className="mt-1 text-xs text-warn">
              {skipped} registros de los transcripts no se pudieron leer: puede haber cambiado el formato.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
