'use client'

import { useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import { reloadAt } from '@/client/use-office'
import { Button, Card, Logo } from './ui'
import { OFFICE } from '@/config'

export function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || password.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = (await response.json()) as { ok: boolean; error?: string }
      if (result.ok) {
        reloadAt('/?modo=agentes')
        return
      }
      setError(result.error ?? 'No se pudo entrar.')
    } catch {
      setError('No se pudo hablar con el servidor.')
    }
    setBusy(false)
  }

  return (
    <Card className="w-full max-w-sm p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <h1 className="font-display text-xl font-semibold tracking-tight">{OFFICE.name}</h1>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={error !== null}
            aria-describedby={error ? 'login-error' : undefined}
            className="min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-[15px] font-normal"
          />
        </label>
        {error && (
          <p id="login-error" role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy || password.length === 0}>
          <LogIn className="size-4" aria-hidden="true" />
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </Card>
  )
}
