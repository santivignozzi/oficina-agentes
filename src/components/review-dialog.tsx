'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, MessageSquareReply, X } from 'lucide-react'
import type { OfficeCommand } from '@/domain/commands'
import type { Deliverable, OfficeSnapshot } from '@/domain/types'
import { DELIVERABLE_STATUS } from './format'
import { MarkdownLite } from './markdown-lite'
import { Badge, Button } from './ui'

interface Props {
  deliverable: Deliverable
  snapshot: OfficeSnapshot
  onClose(): void
  onCommand(command: OfficeCommand): Promise<boolean>
}

// <dialog> nativo: atrapa el foco, cierra con Escape y devuelve el foco a quien lo abrió.
export function ReviewDialog({ deliverable, snapshot, onClose, onCommand }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [note, setNote] = useState('')
  const [agentId, setAgentId] = useState('')
  const [missingNote, setMissingNote] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const author = snapshot.agents.find(agent => agent.id === deliverable.agentId)
  const decidable = deliverable.reviewable && deliverable.status === 'pending_review'
  const workers = snapshot.agents.filter(agent => agent.capability !== 'manager')
  const status = DELIVERABLE_STATUS[deliverable.status]

  const act = async (command: OfficeCommand) => {
    if (await onCommand(command)) onClose()
  }

  const withNote = (run: (text: string) => OfficeCommand) => {
    const text = note.trim()
    setMissingNote(text.length === 0)
    if (text.length > 0) void act(run(text))
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="review-title"
      className="m-auto w-[min(680px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-black/50"
    >
      <div className="flex max-h-[calc(100dvh-48px)] flex-col">
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="review-title" className="font-display text-lg leading-tight font-medium">
              {deliverable.title}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <Badge tone={status.tone}>{status.label}</Badge>
              <span>
                {author?.name ?? 'Agente'} · versión {deliverable.revision + 1}
              </span>
              {deliverable.simulated && <Badge tone="accent">Contenido simulado</Badge>}
            </p>
          </div>
          <Button compact variant="ghost" onClick={onClose} aria-label="Cerrar" className="w-9 max-lg:w-11">
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scroll-thin">
          <p className="mb-2 text-[13px] font-medium text-muted">{deliverable.summary}</p>
          <MarkdownLite text={deliverable.body} />
          {deliverable.reviewNote && (
            <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
              <strong className="font-semibold">Tu nota:</strong> {deliverable.reviewNote}
            </p>
          )}
        </div>

        {decidable ? (
          <div className="border-t border-line px-4 py-3">
            <label className="block text-[13px] font-semibold" htmlFor="review-note">
              Nota para el equipo
              <span className="ml-1 font-normal text-muted">(hace falta para rechazar o pedir cambios)</span>
            </label>
            <textarea
              id="review-note"
              value={note}
              onChange={event => {
                setNote(event.target.value)
                setMissingNote(false)
              }}
              rows={2}
              maxLength={2000}
              aria-invalid={missingNote}
              aria-describedby={missingNote ? 'review-note-error' : undefined}
              className="mt-1 block w-full resize-none rounded-xl border border-line-strong bg-bg px-3 py-2 text-sm"
            />
            {missingNote && (
              <p id="review-note-error" className="mt-1 text-[13px] text-bad">
                Escribí qué cambiarías: el agente trabaja con esa nota.
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <label className="mr-auto flex items-center gap-1.5 text-[13px] text-muted">
                <span>Corrige</span>
                <select
                  value={agentId}
                  onChange={event => setAgentId(event.target.value)}
                  className="min-h-9 cursor-pointer rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink max-lg:min-h-11"
                >
                  <option value="">El mismo agente</option>
                  {workers.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="danger"
                onClick={() => withNote(text => ({ type: 'reject', deliverableId: deliverable.id, note: text }))}
              >
                <X className="size-4" aria-hidden="true" />
                Rechazar
              </Button>
              <Button
                onClick={() =>
                  withNote(text => ({ type: 'request_changes', deliverableId: deliverable.id, note: text, agentId: agentId || null }))
                }
              >
                <MessageSquareReply className="size-4" aria-hidden="true" />
                Pedir cambios
              </Button>
              <Button variant="primary" onClick={() => void act({ type: 'approve', deliverableId: deliverable.id })}>
                <Check className="size-4" aria-hidden="true" />
                Aprobar
              </Button>
            </div>
          </div>
        ) : (
          !deliverable.reviewable && (
            <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted">
              Se muestra para leer: la respuesta se da en la sesión de Claude Code.
            </p>
          )
        )}
      </div>
    </dialog>
  )
}
