import type { AgentLocation, AgentMood, AgentStatus } from '@/domain/types'
import type { AppSession } from './app-sessions'
import type { TranscriptView } from './transcript'

// Pasa de lo que dicen los archivos a un estado de agente. Sólo afirma lo que se
// puede sostener con el transcript: si algo es una sospecha, se dice como sospecha.

/** p99 de 5.309 herramientas medidas: 85 s. Pasado esto, algo la está frenando. */
const TOOL_STALE_MS = 120_000
/** Sin registros durante este rato, el modelo ya no está respondiendo. */
const THINKING_STALE_MS = 5 * 60_000
/** Se queda en el escritorio un rato: los turnos se encadenan y no conviene que pasee. */
const LOUNGE_AFTER_MS = 60_000
const ACTIVITY_WINDOW_MS = 60_000
const ACTIVITY_FULL_CALLS = 12

export interface DerivedState {
  status: AgentStatus
  statusDetail: string
  mood: AgentMood
  location: AgentLocation
  activity: number
}

function activityOf(view: TranscriptView, now: number) {
  const recent = view.entries.filter(e => e.kind === 'log' && now - e.at < ACTIVITY_WINDOW_MS).length
  return Math.min(1, recent / ACTIVITY_FULL_CALLS)
}

function ago(ms: number) {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`
}

export function deriveState(view: TranscriptView, session: AppSession, now: number): DerivedState {
  if (session.interruptedAwaitingPerson) {
    return {
      status: 'waiting_approval',
      statusDetail: 'Se interrumpió y te espera en su sesión',
      mood: 'worried',
      location: 'review',
      activity: 0.1,
    }
  }

  if (view.ask) {
    return {
      status: 'waiting_approval',
      statusDetail: view.ask.question,
      mood: 'neutral',
      location: 'review',
      activity: 0.1,
    }
  }

  const age = view.lastRecordAt === null ? Number.POSITIVE_INFINITY : now - view.lastRecordAt
  const oldestTool = view.pendingTools[0]

  if (oldestTool) {
    const waited = now - oldestTool.at
    if (waited > TOOL_STALE_MS) {
      return {
        status: 'working',
        statusDetail: `${oldestTool.summary}: sin respuesta ${ago(waited)}, puede estar esperando tu aprobación`,
        mood: 'worried',
        location: 'desk',
        activity: 0.1,
      }
    }
    return {
      status: 'working',
      statusDetail: oldestTool.summary,
      mood: 'focused',
      location: 'desk',
      activity: Math.max(0.35, activityOf(view, now)),
    }
  }

  if (view.lastEvent !== 'turn_end' && age < THINKING_STALE_MS) {
    return {
      status: 'working',
      statusDetail: 'Pensando',
      mood: 'focused',
      location: 'desk',
      activity: Math.max(0.35, activityOf(view, now)),
    }
  }

  return {
    status: 'idle',
    statusDetail: view.lastRecordAt === null ? 'Sin actividad registrada' : `Última actividad ${ago(age)}`,
    mood: 'neutral',
    location: age > LOUNGE_AFTER_MS ? 'lounge' : 'desk',
    activity: 0,
  }
}
