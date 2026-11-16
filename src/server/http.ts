import type { NextRequest } from 'next/server'
import { isOnline, isValidSession, SESSION_COOKIE } from './access'

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

export function isLoopbackHost(host: string | null) {
  return host !== null && LOOPBACK.test(host)
}

/**
 * Una web cualquiera puede hacerle un POST a la oficina desde tu navegador. Con agentes
 * reales eso gastaría plata, así que se exige que el pedido salga de la misma oficina.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin === null) return true // no es un navegador
  try {
    const { host } = new URL(origin)
    // Detrás del proxy del servidor, la dirección pública puede llegar en el segundo encabezado.
    return host === request.headers.get('host') || host === request.headers.get('x-forwarded-host')
  } catch {
    return false
  }
}

/** Online entra quien inició sesión; en esta máquina, lo que venga de localhost. */
export function isAllowed(request: NextRequest) {
  if (isOnline()) return isValidSession(request.cookies.get(SESSION_COOKIE)?.value)
  return isLoopbackHost(request.headers.get('host'))
}
