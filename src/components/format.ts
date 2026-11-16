import type { AgentStatus, DeliverableStatus, TaskPriority, TaskStatus } from '@/domain/types'

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info'

export const AGENT_STATUS: Record<AgentStatus, { label: string; tone: Tone }> = {
  idle: { label: 'Libre', tone: 'neutral' },
  working: { label: 'Trabajando', tone: 'good' },
  walking: { label: 'Moviéndose', tone: 'info' },
  meeting: { label: 'En reunión', tone: 'accent' },
  waiting_approval: { label: 'Espera aprobación', tone: 'warn' },
  paused: { label: 'En pausa', tone: 'neutral' },
  offline: { label: 'Sin sesión', tone: 'neutral' },
}

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pendiente', tone: 'neutral' },
  in_progress: { label: 'En curso', tone: 'info' },
  waiting_review: { label: 'Para revisar', tone: 'warn' },
  done: { label: 'Lista', tone: 'good' },
  failed: { label: 'Falló', tone: 'bad' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const DELIVERABLE_STATUS: Record<DeliverableStatus, { label: string; tone: Tone }> = {
  pending_review: { label: 'Para revisar', tone: 'warn' },
  approved: { label: 'Aprobada', tone: 'good' },
  rejected: { label: 'Rechazada', tone: 'bad' },
  changes_requested: { label: 'Con cambios pedidos', tone: 'info' },
  reported: { label: 'Informe', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const PRIORITY: Record<TaskPriority, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' }

const number = new Intl.NumberFormat('es-AR')
const compact = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${compact.format(value / 1_000_000)} M`
  if (value >= 10_000) return `${compact.format(value / 1_000)} k`
  return number.format(value)
}

export function formatUsd(value: number) {
  return `USD ${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatRelative(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}
