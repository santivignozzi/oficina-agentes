import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Tone } from './format'

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
}

export function Logo() {
  return (
    <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 21V8l8-5 8 5v13" />
        <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
      </svg>
    </span>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone])}>
      {children}
    </span>
  )
}

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  soft: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'border border-bad/40 bg-bad-soft text-bad hover:brightness-105',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  compact?: boolean
}

export function Button({ variant = 'soft', compact, className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl font-semibold transition-[filter,background-color,color] duration-150 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50',
        compact ? 'min-h-8 px-2.5 text-[13px] max-lg:min-h-11' : 'min-h-10 px-3.5 max-lg:min-h-11',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</section>
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h2 className="font-display text-[15px] font-medium text-ink">{children}</h2>
      {aside}
    </div>
  )
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const percent = Math.round(value * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  )
}

export function AgentDot({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full font-display text-xs font-semibold text-white"
      style={{ background: color }}
    >
      {name.slice(0, 1)}
    </span>
  )
}
