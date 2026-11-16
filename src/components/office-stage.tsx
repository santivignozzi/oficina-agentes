'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { OfficeSnapshot } from '@/domain/types'
import type { OfficeGame } from '@/office/game'

interface Props {
  snapshot: OfficeSnapshot | null
  selectedId: string | null
  dark: boolean
  onAgentClick(id: string): void
  onHotspot(id: 'review' | 'board'): void
}

/** Pesos que usa el lienzo: sin esperarlos, Phaser dibuja con la tipografía de reemplazo. */
const CANVAS_FONTS = ['500 12px', '600 12px', '600 13px', '600 15px', '700 20px']

function canvasFontFamily() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--font-figtree').trim()
  return value || 'system-ui, sans-serif'
}

export function OfficeStage({ snapshot, selectedId, dark, onAgentClick, onHotspot }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<OfficeGame | null>(null)
  const [painted, setPainted] = useState(false)

  const agentClicked = useEffectEvent(onAgentClick)
  const hotspotClicked = useEffectEvent(onHotspot)
  const initialDark = useEffectEvent(() => dark)

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return
    let cancelled = false
    let instance: OfficeGame | null = null

    void (async () => {
      const fontFamily = canvasFontFamily()
      await Promise.allSettled(CANVAS_FONTS.map(font => document.fonts.load(`${font} ${fontFamily}`)))
      // Phaser toca `window` al importarse: no puede entrar en el render del servidor.
      const { OfficeGame } = await import('@/office/game')
      if (cancelled) return
      instance = new OfficeGame({
        parent,
        fontFamily,
        dark: initialDark(),
        onAgentClick: id => agentClicked(id),
        onHotspot: id => hotspotClicked(id),
        onReady: () => setPainted(true),
      })
      setGame(instance)
    })()

    return () => {
      cancelled = true
      instance?.destroy()
      setGame(null)
      setPainted(false)
    }
  }, [])

  useEffect(() => {
    if (snapshot) game?.update(snapshot)
  }, [game, snapshot])

  useEffect(() => game?.select(selectedId), [game, selectedId])
  useEffect(() => game?.setDark(dark), [game, dark])

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border-2 shadow-card"
      style={{ borderColor: 'var(--stage-frame)', background: 'var(--stage-sky)', touchAction: 'pan-y' }}
    >
      <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
      {painted && (
        <p className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center sm:hidden">
          <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white">Deslizá para recorrer el edificio</span>
        </p>
      )}
      {!painted && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 text-muted">Armando la oficina…</div>
      )}
    </div>
  )
}
