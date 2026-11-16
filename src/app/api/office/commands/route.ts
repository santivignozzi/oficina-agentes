import type { NextRequest } from 'next/server'
import { officeCommandSchema } from '@/domain/commands'
import { isAllowed, isSameOrigin } from '@/server/http'
import { getRuntime } from '@/server/runtime'

export async function POST(request: NextRequest) {
  if (!isAllowed(request) || !isSameOrigin(request)) {
    return Response.json({ ok: false, error: 'No tenés permiso para mandar comandos.' }, { status: 403 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = officeCommandSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'Comando inválido.'
    return Response.json({ ok: false, error }, { status: 400 })
  }

  try {
    const office = new URL(request.url).searchParams.get('mode') === 'agents' ? 'agents' : 'demo'
    const result = await getRuntime()[office].execute(parsed.data)
    return Response.json(result, { status: result.ok ? 200 : 409 })
  } catch (error) {
    console.error('[commands] falló', parsed.data.type, error)
    return Response.json({ ok: false, error: 'No se pudo ejecutar. Mirá la consola del server.' }, { status: 500 })
  }
}
