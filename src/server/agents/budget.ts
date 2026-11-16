import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Tope de gasto mensual. Vive en un archivo para que reiniciar el server no lo ponga
// en cero, y reserva antes de cada llamada para que dos agentes en paralelo no lo
// pasen entre los dos.

interface Ledger {
  month: string
  spentUsd: number
  /** Sesiones sin cerrar y lo que tienen apartado. Sobreviven a un reinicio: la sesión también. */
  open: Record<string, number>
}

export class BudgetExceeded extends Error {}

const currentMonth = () => new Date().toISOString().slice(0, 7)

function readLedger(file: string): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Ledger>
    if (typeof parsed.month === 'string' && typeof parsed.spentUsd === 'number') {
      return { month: parsed.month, spentUsd: parsed.spentUsd, open: parsed.open ?? {} }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[agentes] no se pudo leer el gasto del mes', error)
  }
  return { month: currentMonth(), spentUsd: 0, open: {} }
}

export class Budget {
  private ledger: Ledger
  private held = 0

  constructor(
    readonly limitUsd: number,
    private file: string,
  ) {
    this.ledger = readLedger(file)
  }

  get spentUsd() {
    this.roll()
    return this.ledger.spentUsd
  }

  get openSessions() {
    return Object.keys(this.ledger.open)
  }

  /** Aparta `usd` mientras dura la llamada. Devuelve cómo soltarlo. */
  reserve(usd: number) {
    const open = Object.values(this.ledger.open).reduce((sum, value) => sum + value, 0)
    const free = this.limitUsd - this.spentUsd - this.held - open
    if (usd > free) {
      throw new BudgetExceeded(
        `Tope de gasto: llevás USD ${this.spentUsd.toFixed(2)} de USD ${this.limitUsd.toFixed(2)} este mes y esta llamada puede costar hasta USD ${usd.toFixed(2)}. Subí AI_OFFICE_BUDGET_USD para seguir.`,
      )
    }
    this.held += usd
    let released = false
    return () => {
      if (released) return
      released = true
      this.held -= usd
    }
  }

  charge(usd: number) {
    this.roll()
    this.ledger.spentUsd += usd
    this.save()
  }

  /** Deja `usd` apartado en el archivo mientras la sesión siga abierta. */
  hold(sessionId: string, usd: number) {
    this.ledger.open[sessionId] = usd
    this.save()
  }

  /** Cierra la sesión con lo que gastó. Sin ese dato, cuenta todo lo apartado. */
  close(sessionId: string, spentUsd: number | null) {
    const usd = spentUsd ?? this.ledger.open[sessionId] ?? 0
    delete this.ledger.open[sessionId]
    this.charge(usd)
    return usd
  }

  private roll() {
    if (this.ledger.month === currentMonth()) return
    this.ledger = { month: currentMonth(), spentUsd: 0, open: this.ledger.open }
    this.save()
  }

  // Sincrónico y con rename: un corte a mitad de escritura no puede dejar el gasto en cero.
  private save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.ledger), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
}
