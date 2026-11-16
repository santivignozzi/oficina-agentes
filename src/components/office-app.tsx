'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { OfficeCommand } from '@/domain/commands'
import type { OfficeMode, TaskPriority } from '@/domain/types'
import { sendCommand, useOfficeMode, useOfficeStream } from '@/client/use-office'
import { useTheme } from '@/client/use-theme'
import { AgentPanel } from './agent-panel'
import { Dock } from './dock'
import { GoalComposer } from './goal-composer'
import { LiveEmpty } from './live-empty'
import { OfficeStage } from './office-stage'
import { ReviewDialog } from './review-dialog'
import { SupervisionPanel } from './supervision-panel'
import { TopBar } from './top-bar'
import { Button, Card, cn } from './ui'

const NOTICE_MS = 6000

export function OfficeApp({ online }: { online: boolean }) {
  const [mode, setMode] = useOfficeMode()
  const { snapshot, connection } = useOfficeStream(mode)
  const [theme, toggleTheme] = useTheme()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const run = useCallback(
    async (command: OfficeCommand) => {
      const result = await sendCommand(mode, command)
      if (!result.ok) setNotice(result.error ?? 'No se pudo hacer.')
      return result.ok
    },
    [mode],
  )

  const changeMode = (next: OfficeMode) => {
    setSelectedId(null)
    setReviewId(null)
    setMode(next)
  }

  const selectAgent = useCallback((id: string) => setSelectedId(current => (current === id ? null : id)), [])

  const onHotspot = useCallback(
    (id: 'review' | 'board') => {
      if (id === 'review') {
        const pending = snapshot?.deliverables.find(item => item.status === 'pending_review')
        if (pending) setReviewId(pending.id)
      }
      if (id === 'board') setSelectedId(null)
    },
    [snapshot],
  )

  const agent = snapshot?.agents.find(item => item.id === selectedId) ?? null
  const reviewing = snapshot?.deliverables.find(item => item.id === reviewId) ?? null
  const noAgents = snapshot?.live && snapshot.agents.every(item => item.status === 'offline')

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <TopBar
        mode={mode}
        online={online}
        snapshot={snapshot}
        connection={connection}
        dark={theme === 'dark'}
        onMode={changeMode}
        onToggleTheme={toggleTheme}
        onStop={() => void run({ type: 'stop_all' })}
        onReset={() => void run({ type: 'reset' })}
      />

      {/* En el celular se apila en el orden del documento; en escritorio cada pieza va a su celda. */}
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)_auto_168px]">
        <div className="relative h-[46dvh] max-h-90 min-h-64 min-w-0 lg:col-start-1 lg:row-start-1 lg:h-auto lg:max-h-none lg:min-h-0">
          <OfficeStage
            snapshot={snapshot}
            selectedId={selectedId}
            dark={theme === 'dark'}
            onAgentClick={selectAgent}
            onHotspot={onHotspot}
          />
          {noAgents && snapshot.live && <LiveEmpty live={snapshot.live} />}
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <GoalComposer online={online} snapshot={snapshot} onSubmit={(text, priority: TaskPriority) => run({ type: 'submit_goal', text, priority })} />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col lg:col-start-2 lg:row-span-3 lg:row-start-1" aria-label="Detalle">
          {snapshot ? (
            <>
              <div className={cn('min-h-0 flex-1', agent && 'lg:hidden')}>
                <SupervisionPanel snapshot={snapshot} onSelectAgent={selectAgent} onReview={setReviewId} />
              </div>
              {agent && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar el panel del agente"
                    onClick={() => setSelectedId(null)}
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                  />
                  <div className="z-40 min-h-0 flex-1 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:h-[78dvh] animate-rise">
                    <AgentPanel
                      key={agent.id}
                      agent={agent}
                      snapshot={snapshot}
                      onClose={() => setSelectedId(null)}
                      onCommand={run}
                      onReview={setReviewId}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <Card className="h-full p-4 text-muted">Conectando con la oficina…</Card>
          )}
        </aside>

        {snapshot && (
          <div className="min-h-0 min-w-0 lg:col-start-1 lg:row-start-3">
            <Dock snapshot={snapshot} onCommand={run} />
          </div>
        )}
      </main>

      {reviewing && snapshot && (
        <ReviewDialog
          key={`${reviewing.id}-${reviewing.revision}`}
          deliverable={reviewing}
          snapshot={snapshot}
          onClose={() => setReviewId(null)}
          onCommand={run}
        />
      )}

      {notice && (
        <div role="alert" className="fixed inset-x-3 bottom-3 z-50 flex justify-center">
          <div className="flex max-w-lg items-center gap-2 rounded-xl border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad shadow-card">
            <span>{notice}</span>
            <Button compact variant="ghost" onClick={() => setNotice(null)} aria-label="Cerrar el aviso" className="w-8">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
