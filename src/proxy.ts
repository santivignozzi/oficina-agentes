import { NextResponse, type NextRequest } from 'next/server'
import { isOnline, isValidSession, SESSION_COOKIE } from '@/server/access'

const HOME = '/?modo=agentes'
const LOGIN = '/entrar'

export function proxy(request: NextRequest) {
  if (!isOnline()) return NextResponse.next()

  const { pathname, searchParams } = request.nextUrl
  const signedIn = isValidSession(request.cookies.get(SESSION_COOKIE)?.value)
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (pathname === LOGIN) return signedIn ? redirectTo(HOME) : NextResponse.next()
  if (pathname === '/api/acceso') return NextResponse.next()

  if (!signedIn) {
    if (pathname.startsWith('/api/')) return Response.json({ ok: false, error: 'Tenés que volver a entrar.' }, { status: 401 })
    return redirectTo(LOGIN)
  }

  // Online no hay En vivo, y lo que se viene a ver son los agentes reales.
  const mode = searchParams.get('modo')
  if (pathname === '/' && mode !== 'agentes' && mode !== 'demo') return redirectTo(HOME)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|api/salud).*)'],
}
