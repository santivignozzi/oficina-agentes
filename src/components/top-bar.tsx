'use client'

import { LogOut, Moon, Octagon, RotateCcw, Sun, WifiOff } from 'lucide-react'
import type { OfficeMode, OfficeSnapshot } from '@/domain/types'
import { totalTokens } from '@/domain/types'
import { signOut, type Connection } from '@/client/use-office'
import { formatTokens, formatUsd } from './format'
import { Button, cn, Logo } from './ui'
import { OFFICE } from '@/config'

interface Props {
  mode: OfficeMode
  online: boolean
  snapshot: OfficeSnapshot | null
  connection: Connection
  dark: boolean
  onMode(mode: OfficeMode): void
  onToggleTheme(): void
  onStop(): void
  onReset(): void
}

function Kpi({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className="flex shrink-0 flex-col justify-center leading-tight">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn('font-display text-[17px] font-medium', alert ? 'text-warn' : 'text-ink')}>
        {value}
        {hint && <span className="ml-1 font-sans text-xs font-medium text-muted">{hint}</span>}
      </span>
    </div>
  )
}

const MODES: { id: OfficeMode; label: string }[] = [
  { id: 'demo', label: 'Demo' },
  { id: 'live', label: 'En vivo' },
  { id: 'agents', label: 'Agentes' },
]

export function TopBar({ mode, online, snapshot, connection, dark, onMode, onToggleTheme, onStop, onReset }: Props) {
  const metrics = snapshot?.metrics
  const controllable = snapshot?.controllable ?? false
  const billing = snapshot?.billing ?? null

  return (
    <header className="border-b border-line bg-surface">
      <div className="flex min-h-15 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <Logo />
          <h1 className="font-display text-xl font-semibold tracking-tight">{OFFICE.name}</h1>
        </div>

        <div role="radiogroup" aria-label="Modo" className="flex rounded-xl bg-surface-2 p-1">
          {/* En vivo lee el disco de tu Mac: en el servidor no hay nada que mostrar. */}
          {MODES.filter(item => !online || item.id !== 'live').map(item => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              onClick={() => onMode(item.id)}
              className={cn(
                'min-h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold transition-colors max-lg:min-h-11',
                mode === item.id ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:justify-center lg:px-0 lg:pb-0">
          {metrics ? (
            <>
              <Kpi label="Agentes online" value={`${metrics.agentsOnline}/${metrics.agentsTotal}`} />
              <Kpi label="Tareas activas" value={String(metrics.activeTasks)} />
              <Kpi label="Para revisar" value={String(metrics.pendingReviews)} alert={metrics.pendingReviews > 0} />
              <Kpi label="Tokens" value={formatTokens(totalTokens(metrics.tokens))} hint={snapshot?.simulated ? 'simulados' : 'reales'} />
              {billing ? (
                <Kpi
                  label="Gasto del mes"
                  value={formatUsd(billing.spentUsd)}
                  hint={`de ${formatUsd(billing.budgetUsd)}`}
                  alert={billing.spentUsd >= billing.budgetUsd}
                />
              ) : (
                <Kpi
                  label="Costo"
                  value={metrics.costUsd === null ? 'Sin dato' : formatUsd(metrics.costUsd)}
                  hint={metrics.costUsd !== null && snapshot?.simulated ? 'simulado' : undefined}
                />
              )}
            </>
          ) : (
            <span className="text-muted">Conectando…</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {connection !== 'open' && snapshot && (
            <span className="flex items-center gap-1 text-[13px] text-warn">
              <WifiOff className="size-4" aria-hidden="true" /> Reconectando
            </span>
          )}
          {controllable && (
            <>
              {snapshot?.simulated && (
                <Button compact onClick={onReset} aria-label="Reiniciar la demo" title="Reiniciar la demo">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  <span className="max-sm:hidden">Reiniciar</span>
                </Button>
              )}
              <Button compact variant="danger" onClick={onStop} disabled={(metrics?.activeTasks ?? 0) === 0}>
                <Octagon className="size-4" aria-hidden="true" />
                <span className="max-sm:hidden">Detener todo</span>
                <span className="sm:hidden">Detener</span>
              </Button>
            </>
          )}
          <Button
            compact
            variant="ghost"
            onClick={onToggleTheme}
            aria-label={dark ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
            title={dark ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
            className="w-9 max-lg:w-11"
          >
            {dark ? <Sun className="size-4.5" aria-hidden="true" /> : <Moon className="size-4.5" aria-hidden="true" />}
          </Button>
          {online && (
            <Button compact variant="ghost" onClick={() => void signOut()} aria-label="Salir" title="Salir" className="w-9 max-lg:w-11">
              <LogOut className="size-4.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
