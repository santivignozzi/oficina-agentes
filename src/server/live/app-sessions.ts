import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// La app de escritorio guarda un `local_<id>.json` por sesión. Se usa por encima
// del transcript porque el título ahí está al día: el 2/11 la app ya decía
// "Analista" mientras el JSONL seguía con "Resultados extraños en búsqueda".

const sessionSchema = z.object({
  sessionId: z.string(),
  cliSessionId: z.string(),
  cwd: z.string(),
  title: z.string().nullish(),
  isArchived: z.boolean().nullish(),
  model: z.string().nullish(),
  effort: z.string().nullish(),
  permissionMode: z.string().nullish(),
  completedTurns: z.number().nullish(),
  lastTurnReport: z.string().nullish(),
  interruptedAwaitingPerson: z.unknown(),
  lastActivityAt: z.number().nullish(),
})

export type AppSession = z.infer<typeof sessionSchema>

interface CacheEntry {
  mtimeMs: number
  session: AppSession | null
}

const cache = new Map<string, CacheEntry>()

async function listSessionFiles(dir: string, depth = 0): Promise<string[]> {
  // Las sesiones viven en <organización>/<usuario>/local_*.json.
  if (depth > 3) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listSessionFiles(full, depth + 1)
      return entry.name.startsWith('local_') && entry.name.endsWith('.json') ? [full] : []
    }),
  )
  return nested.flat()
}

async function readSession(file: string): Promise<AppSession | null> {
  const stat = await fs.stat(file)
  const cached = cache.get(file)
  if (cached?.mtimeMs === stat.mtimeMs) return cached.session

  const parsed = sessionSchema.safeParse(JSON.parse(await fs.readFile(file, 'utf8')))
  // Un archivo con otra forma no se muestra: una sesión a medias confunde más que
  // una ausente. Queda contado en `skippedRecords` del lector de transcripts.
  const session = parsed.success ? parsed.data : null
  cache.set(file, { mtimeMs: stat.mtimeMs, session })
  return session
}

export interface AppSessionsResult {
  dirFound: boolean
  sessions: AppSession[]
}

export async function listProjectSessions(sessionsDir: string, projectPath: string): Promise<AppSessionsResult> {
  let files: string[]
  try {
    files = await listSessionFiles(sessionsDir)
  } catch (error) {
    if (isNotFound(error)) return { dirFound: false, sessions: [] }
    throw error
  }

  const results = await Promise.all(
    files.map(file =>
      readSession(file).catch(error => {
        // La app reescribe estos archivos: una lectura a medio guardar se reintenta
        // en la próxima vuelta.
        if (error instanceof SyntaxError || isNotFound(error)) return null
        throw error
      }),
    ),
  )

  return {
    dirFound: true,
    sessions: results.filter((s): s is AppSession => s !== null && s.cwd === projectPath),
  }
}

function isNotFound(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Busca la sesión viva con ese título; si hay varias, la última que tuvo actividad. */
export function findSessionByTitle(sessions: AppSession[], title: string): AppSession | null {
  const wanted = title.toLowerCase()
  const matches = sessions
    .filter(s => !s.isArchived && s.title?.trim().toLowerCase() === wanted)
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
  return matches[0] ?? null
}

/** Claude Code nombra la carpeta del proyecto cambiando lo no alfanumérico por `-`. */
export function transcriptPath(transcriptsDir: string, session: AppSession) {
  const slug = session.cwd.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(transcriptsDir, slug, `${session.cliSessionId}.jsonl`)
}
