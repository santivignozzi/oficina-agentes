import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Online, la oficina queda en una dirección pública y gasta con tu clave de Anthropic.
// Por eso el modo lo fija una variable del servidor y no el pedido: el encabezado `Host`
// lo escribe quien llama, y `Host: localhost` no puede alcanzar para entrar.

export const SESSION_COOKIE = 'ai_office_sesion'
export const SESSION_SECONDS = 30 * 24 * 60 * 60

/** Alcanza contra la fuerza bruta porque `/api/acceso` limita los intentos fallidos. */
const MIN_PASSWORD_CHARS = 12

export const isOnline = () => process.env.AI_OFFICE_ONLINE === '1'

const password = () => process.env.AI_OFFICE_PASSWORD?.trim() ?? ''
const hasPassword = () => password().length >= MIN_PASSWORD_CHARS

/** Dónde se guardan entregas y gasto, si el servidor tiene un disco que sobreviva a un deploy. */
export const persistentDir = () => process.env.AI_OFFICE_DATA_DIR?.trim() || process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || null

/** Lo que falta para abrirla a internet. Mejor no arrancar que arrancar sin candado. */
export function setupProblem() {
  if (!isOnline()) return null
  if (!hasPassword()) return `AI_OFFICE_PASSWORD tiene que tener al menos ${MIN_PASSWORD_CHARS} caracteres.`
  if (!persistentDir()) return 'Falta un disco permanente: sin él se perderían las entregas y la cuenta del gasto.'
  return null
}

const digest = (value: string) => createHash('sha256').update(value).digest()

// La firma sale de la contraseña: cambiarla cierra todas las sesiones abiertas.
const signature = (expires: string) => createHmac('sha256', digest(`sesion:${password()}`)).update(expires).digest('hex')

export function passwordMatches(candidate: string) {
  return hasPassword() && timingSafeEqual(digest(candidate), digest(password()))
}

export function newSession() {
  const expires = String(Date.now() + SESSION_SECONDS * 1000)
  return `${expires}.${signature(expires)}`
}

export function isValidSession(token: string | undefined) {
  if (!token || !hasPassword()) return false
  const [expires, received] = token.split('.')
  if (!expires || !received || !(Number(expires) > Date.now())) return false
  const expected = Buffer.from(signature(expires))
  const actual = Buffer.from(received)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
