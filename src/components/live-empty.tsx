import { Radio } from 'lucide-react'
import type { LiveSourceStatus } from '@/domain/types'

// Dice qué se buscó y qué falló, sin suponer: alguien en otra máquina tiene que
// poder entender por qué no ve nada.
export function LiveEmpty({ live }: { live: LiveSourceStatus }) {
  const reason = !live.sessionsDirFound
    ? 'No se encontró la carpeta de sesiones de la app de Claude en esta máquina.'
    : !live.transcriptsDirFound
      ? 'No se encontró la carpeta de transcripts de Claude Code.'
      : live.sessionsSeen === 0
        ? `La app no tiene sesiones para ${live.projectPath}.`
        : 'Ninguna sesión de ese proyecto se llama Analista o Programador.'

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
        <Radio className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="text-[13px]">
          <p className="font-semibold">No hay agentes conectados</p>
          <p className="text-muted">{reason}</p>
          <p className="text-muted">Cuando abras esas sesiones, aparecen acá solas.</p>
        </div>
      </div>
    </div>
  )
}
