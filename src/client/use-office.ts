'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { OfficeCommand } from '@/domain/commands'
import type { OfficeMode, OfficeSnapshot } from '@/domain/types'

export type Connection = 'connecting' | 'open' | 'lost'
export type CommandResult = { ok: boolean; error?: string }

const MODE_EVENT = 'ai-office:modo'
const MODE_PARAMS: Record<OfficeMode, string> = { demo: 'demo', live: 'en-vivo', agents: 'agentes' }
const RETRY_MS = 3_000

function readMode(): OfficeMode {
  const param = new URLSearchParams(window.location.search).get('modo')
  if (param === MODE_PARAMS.live) return 'live'
  return param === MODE_PARAMS.agents ? 'agents' : 'demo'
}

function subscribeMode(notify: () => void) {
  window.addEventListener('popstate', notify)
  window.addEventListener(MODE_EVENT, notify)
  return () => {
    window.removeEventListener('popstate', notify)
    window.removeEventListener(MODE_EVENT, notify)
  }
}

/** El modo vive en la URL: se puede compartir el enlace o recargar sin perderlo. */
export function useOfficeMode() {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => 'demo' as OfficeMode)
  const setMode = useCallback((next: OfficeMode) => {
    const url = new URL(window.location.href)
    url.searchParams.set('modo', MODE_PARAMS[next])
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new Event(MODE_EVENT))
  }, [])
  return [mode, setMode] as const
}

interface StreamState {
  mode: OfficeMode
  snapshot: OfficeSnapshot | null
  connection: Connection
}

export function useOfficeStream(mode: OfficeMode) {
  const [state, setState] = useState<StreamState>({ mode, snapshot: null, connection: 'connecting' })

  useEffect(() => {
    let source: EventSource
    let retry: ReturnType<typeof setTimeout> | undefined
    const update = (patch: Partial<StreamState>) =>
      setState(current => ({ ...(current.mode === mode ? current : { snapshot: null, connection: 'connecting' }), ...patch, mode }))

    const open = () => {
      source = new EventSource(`/api/office/stream?mode=${mode}`)
      source.addEventListener('snapshot', event => {
        update({ snapshot: JSON.parse(event.data as string) as OfficeSnapshot, connection: 'open' })
      })
      // EventSource reconecta solo si se corta la red. Si el servidor responde con un
      // error, como durante un deploy, abandona: ahí hay que volver a abrirlo a mano.
      source.onerror = () => {
        const closed = source.readyState === EventSource.CLOSED
        update({ connection: closed ? 'lost' : 'connecting' })
        if (closed) retry = setTimeout(open, RETRY_MS)
      }
    }

    open()
    return () => {
      clearTimeout(retry)
      source.close()
    }
  }, [mode])

  // Mientras llega el primer dato del modo nuevo no se muestra el anterior.
  return state.mode === mode ? state : { mode, snapshot: null, connection: 'connecting' as Connection }
}

export async function sendCommand(mode: OfficeMode, command: OfficeCommand): Promise<CommandResult> {
  try {
    const response = await fetch(`/api/office/commands?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    })
    if (response.status === 401) reloadAt('/entrar')
    return (await response.json()) as CommandResult
  } catch {
    return { ok: false, error: 'No se pudo hablar con el servidor.' }
  }
}

/** Recarga completa a propósito: cambió la sesión y el servidor tiene que volver a decidir. */
export function reloadAt(path: string) {
  window.location.href = path
}

export async function signOut() {
  await fetch('/api/acceso', { method: 'DELETE' }).catch(() => undefined)
  reloadAt('/entrar')
}
