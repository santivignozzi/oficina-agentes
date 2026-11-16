import type { NextRequest } from 'next/server'
import type { OfficeMode } from '@/domain/types'
import { isOnline } from '@/server/access'
import { isAllowed } from '@/server/http'
import { getSource } from '@/server/runtime'
import { onShutdown } from '@/server/shutdown'

const KEEPALIVE_MS = 15_000

function readMode(request: Request): OfficeMode {
  const mode = new URL(request.url).searchParams.get('mode')
  return mode === 'live' || mode === 'agents' ? mode : 'demo'
}

export async function GET(request: NextRequest) {
  const mode = readMode(request)

  // Transcripts privados y entregas pagas: sólo los ve quien tiene acceso.
  if ((mode !== 'demo' || isOnline()) && !isAllowed(request)) {
    return new Response('No tenés acceso a este modo', { status: 403 })
  }
  // En vivo lee el disco de tu Mac: en el servidor no existe.
  if (mode === 'live' && isOnline()) return new Response('En vivo sólo funciona en tu Mac', { status: 404 })

  const source = getSource(mode)
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup() // el navegador cerró: `enqueue` tira y no hay a quién avisarle
        }
      }
      const sendSnapshot = (snapshot: unknown) => send(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)

      const unsubscribe = source.subscribe(sendSnapshot)
      const keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS)
      const cleanup = () => {
        clearInterval(keepalive)
        unsubscribe()
        stopWaiting()
      }
      const close = () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // ya estaba cerrado: pasa si el error de `enqueue` llegó primero
        }
      }
      const stopWaiting = onShutdown(close)

      request.signal.addEventListener('abort', close)

      sendSnapshot(await source.snapshot())
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Con `keep-alive`, el navegador reconectaría por este mismo socket al proceso que se apaga.
      Connection: 'close',
    },
  })
}
