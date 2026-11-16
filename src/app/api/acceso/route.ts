import { NextResponse, type NextRequest } from 'next/server'
import { isOnline, newSession, passwordMatches, SESSION_COOKIE, SESSION_SECONDS, setupProblem } from '@/server/access'
import { isSameOrigin } from '@/server/http'

// El límite es global y no por IP: la IP de un pedido se puede falsificar. Si alguien
// ataca, te puede demorar el login, pero una sesión ya abierta sigue andando.
const WINDOW_MS = 10 * 60_000
const MAX_FAILURES = 20
const FAILURE_DELAY_MS = 600

let failures: number[] = []

const refuse = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status })

export async function POST(request: NextRequest) {
  if (!isOnline()) return refuse('En esta máquina no hace falta contraseña.', 404)
  if (!isSameOrigin(request)) return refuse('Pedido rechazado.', 403)

  const problem = setupProblem()
  if (problem) return refuse(problem, 503)

  const now = Date.now()
  failures = failures.filter(at => now - at < WINDOW_MS)
  if (failures.length >= MAX_FAILURES) return refuse('Demasiados intentos. Probá de nuevo en unos minutos.', 429)

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null
  if (typeof body?.password !== 'string' || !passwordMatches(body.password)) {
    failures.push(now)
    await new Promise(resolve => setTimeout(resolve, FAILURE_DELAY_MS))
    return refuse('Esa no es la contraseña.', 401)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, newSession(), {
    httpOnly: true,
    secure: true,
    // Ninguna otra web puede hacer que el navegador mande la sesión.
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
  return response
}

export function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return refuse('Pedido rechazado.', 403)
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE)
  return response
}
