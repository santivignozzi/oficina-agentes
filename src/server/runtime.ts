import type { OfficeMode, OfficeSnapshot } from '@/domain/types'
import { createAgentOffice } from './agents/agent-office'
import { createDemoOffice } from './demo/demo-office'
import type { ManagedOffice } from './engine/managed-office'
import { LiveOffice } from './live/live-office'

export interface OfficeSource {
  snapshot(): Promise<OfficeSnapshot>
  subscribe(listener: (snapshot: OfficeSnapshot) => void): () => void
}

interface Runtime {
  demo: ManagedOffice
  live: LiveOffice
  agents: ManagedOffice
}

// En desarrollo, Next puede cargar este módulo más de una vez por ruta. Sin el
// global habría una oficina para `commands` y otra distinta para `stream`.
const holder = globalThis as typeof globalThis & { aiOfficeRuntime?: Runtime }

export function getRuntime(): Runtime {
  holder.aiOfficeRuntime ??= { demo: createDemoOffice(), live: new LiveOffice(), agents: createAgentOffice() }
  return holder.aiOfficeRuntime
}

export function getSource(mode: OfficeMode): OfficeSource {
  return getRuntime()[mode]
}
