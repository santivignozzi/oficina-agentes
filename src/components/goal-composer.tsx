'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Eye, KeyRound, SendHorizontal } from 'lucide-react'
import type { OfficeSnapshot, TaskPriority } from '@/domain/types'
import { formatUsd, PRIORITY } from './format'
import { Button, Card } from './ui'

const EXAMPLE = 'Investigá 5 competidores de mi producto, compará precios y funcionalidades, y prepará una propuesta de mejora.'

interface Props {
  online: boolean
  snapshot: OfficeSnapshot | null
  onSubmit(text: string, priority: TaskPriority): Promise<boolean>
}

export function GoalComposer({ online, snapshot, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [busy, setBusy] = useState(false)

  if (snapshot?.billing && !snapshot.billing.configured) {
    return (
      <Card className="flex items-start gap-3 px-4 py-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[13px] text-muted">
          <strong className="font-semibold text-ink">Falta la clave de Anthropic.</strong>{' '}
          {online ? (
            <>
              Cargá <code className="font-mono">ANTHROPIC_API_KEY</code> en las variables del servidor.
            </>
          ) : (
            <>
              Copiá <code className="font-mono">.env.example</code> como <code className="font-mono">.env.local</code>, poné tu{' '}
              <code className="font-mono">ANTHROPIC_API_KEY</code> y reiniciá el servidor.
            </>
          )}{' '}
          Hasta entonces no se hace ninguna llamada ni se gasta nada. El tope de este mes es {formatUsd(snapshot.billing.budgetUsd)}.
        </p>
      </Card>
    )
  }

  if (snapshot && !snapshot.controllable) {
    return (
      <Card className="flex items-start gap-3 px-4 py-3">
        <Eye className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[13px] text-muted">
          <strong className="font-semibold text-ink">En vivo es sólo lectura.</strong> Analista y Programador son sesiones de Claude Code: la oficina
          lee lo que van escribiendo en sus transcripts, pero esas sesiones no reciben mensajes desde afuera. Para pedirles algo, escribiles en su sesión.
        </p>
      </Card>
    )
  }

  const director = snapshot?.agents.find(agent => agent.capability === 'manager')?.name ?? 'la dirección'

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy || text.trim().length === 0) return
    setBusy(true)
    const ok = await onSubmit(text.trim(), priority)
    setBusy(false)
    if (ok) setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 p-2.5">
        <label className="min-w-0 flex-1 basis-72">
          <span className="sr-only">Consigna para el equipo</span>
          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="¿Qué necesitás que haga el equipo?"
            className="block max-h-24 min-h-11 w-full resize-none rounded-xl border border-line-strong bg-bg px-3 py-2 text-[15px] [field-sizing:content] placeholder:text-muted"
          />
        </label>
        <div className="flex items-center gap-2 max-sm:w-full max-sm:flex-wrap">
          {text.length === 0 && (
            <Button compact variant="ghost" onClick={() => setText(EXAMPLE)} className="whitespace-nowrap">
              Usar ejemplo
            </Button>
          )}
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className="max-sm:sr-only">Prioridad</span>
            <select
              value={priority}
              onChange={event => setPriority(event.target.value as TaskPriority)}
              className="min-h-10 cursor-pointer rounded-xl border border-line-strong bg-surface px-2 text-[13px] font-medium text-ink max-lg:min-h-11"
            >
              {Object.entries(PRIORITY).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={busy || text.trim().length === 0} className="whitespace-nowrap max-sm:flex-1">
            <SendHorizontal className="size-4" aria-hidden="true" />
            Enviar a {director}
          </Button>
        </div>
      </form>
    </Card>
  )
}
