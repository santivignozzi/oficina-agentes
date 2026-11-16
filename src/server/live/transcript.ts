import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { addUsage, EMPTY_USAGE, type TokenUsage } from '@/domain/types'

// Lector incremental del JSONL de una sesión. Sólo mira lo agregado desde la
// lectura anterior, porque un transcript real llega a 25 MB (medido el 2/11).

const MAX_ENTRIES = 200
const MAX_TEXT = 280

const blockSchema = z.looseObject({ type: z.string() })

const assistantSchema = z.object({
  uuid: z.string(),
  timestamp: z.string(),
  isSidechain: z.boolean().nullish(),
  isApiErrorMessage: z.boolean().nullish(),
  message: z.object({
    id: z.string().nullish(),
    model: z.string().nullish(),
    stop_reason: z.string().nullish(),
    usage: z
      .object({
        input_tokens: z.number().nullish(),
        output_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish(),
        cache_creation_input_tokens: z.number().nullish(),
      })
      .nullish(),
    content: z.array(blockSchema),
  }),
})

const userSchema = z.object({
  uuid: z.string(),
  timestamp: z.string(),
  isMeta: z.boolean().nullish(),
  origin: z.object({ kind: z.string() }).nullish(),
  message: z.object({ content: z.union([z.string(), z.array(blockSchema)]) }),
})

const toolUseSchema = z.object({ id: z.string(), name: z.string(), input: z.record(z.string(), z.unknown()) })
const toolResultSchema = z.object({ tool_use_id: z.string() })

const planInputSchema = z.object({
  items: z.array(z.object({ content: z.string(), status: z.string() })).optional(),
  advance: z.boolean().optional(),
  done: z.array(z.number()).optional(),
  start: z.number().optional(),
})

const wrapUpSchema = z.object({ recap: z.string().optional(), ask: z.string().optional() })
const sendMessageSchema = z.object({ to: z.string(), message: z.string(), summary: z.string().optional() })
const askUserSchema = z.object({ questions: z.array(z.object({ question: z.string() })).min(1) })

export type EntryKind = 'log' | 'reasoning' | 'message_out' | 'message_in' | 'prompt' | 'report' | 'ask'

export interface TranscriptEntry {
  id: string
  at: number
  kind: EntryKind
  text: string
  /** `to` de un mensaje saliente o `from` de uno entrante. */
  peer: string | null
}

export interface PendingTool {
  id: string
  name: string
  summary: string
  at: number
}

export interface PlanStep {
  content: string
  status: string
}

export interface TeamTask {
  number: number
  title: string
  at: number
  outcome: 'hecha' | 'trabada' | null
  outcomeAt: number | null
  report: string | null
}

export interface TranscriptView {
  found: boolean
  lastRecordAt: number | null
  /** Último hecho que dice en qué punto del turno está la sesión. */
  lastEvent: 'turn_end' | 'tool_call' | 'user' | null
  pendingTools: PendingTool[]
  usage: TokenUsage
  model: string | null
  plan: PlanStep[]
  planAt: number | null
  /** Pregunta abierta al humano. Se limpia con el próximo mensaje que reciba. */
  ask: { question: string; at: number } | null
  entries: TranscriptEntry[]
  reports: { id: string; at: number; text: string }[]
  teamTasks: TeamTask[]
  toolCounts: Record<string, number>
  skipped: number
}

const clip = (text: string, max = MAX_TEXT) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

const fileName = (value: unknown) => (typeof value === 'string' ? path.basename(value) : 'un archivo')

/**
 * Traduce una llamada a una frase. De Bash se usa sólo la descripción: el comando
 * crudo puede traer un token, y esto termina en una pantalla.
 */
function describeTool(name: string, input: Record<string, unknown>): string | null {
  switch (name) {
    case 'Bash':
      return typeof input.description === 'string' ? clip(input.description, 90) : 'Corriendo un comando'
    case 'Read':
      return `Leyendo ${fileName(input.file_path)}`
    case 'Edit':
    case 'NotebookEdit':
      return `Editando ${fileName(input.file_path)}`
    case 'Write':
      return `Escribiendo ${fileName(input.file_path)}`
    case 'Grep':
    case 'Glob':
      return 'Buscando en el código'
    case 'WebSearch':
      return 'Buscando en la web'
    case 'WebFetch':
      return 'Leyendo una página'
    case 'Skill':
      return typeof input.skill === 'string' ? `Cargando el skill ${input.skill}` : 'Cargando un skill'
    case 'Agent':
      return 'Lanzando un subagente'
    case 'AskUserQuestion':
      return 'Te está preguntando algo'
    // Son el andamiaje de la sesión: no le dicen nada a quien mira la oficina.
    case 'ToolSearch':
    case 'SendMessage':
    case 'mcp__ccd_turn__update_plan':
    case 'mcp__ccd_turn__wrap_up':
      return null
  }
  if (name.startsWith('mcp__Claude_Browser__') || name.startsWith('mcp__claude-in-chrome__')) return 'Usando el navegador'
  if (name.startsWith('mcp__')) return `Usando ${name.split('__').pop()?.replaceAll('_', ' ')}`
  return `Usando ${name}`
}

const TEAM_TASK = /^T(\d+)\s*[—–-]\s*(.+)$/m
const TEAM_REPORT = /^T(\d+)\s+(hecha|trabada)\b/m
const PEER_MESSAGE = /<cross-session-message from="([^"]+)"[^>]*>([\s\S]*?)<\/cross-session-message>/

export class TranscriptReader {
  private offset = 0
  private leftover = ''
  private usageByMessage = new Map<string, TokenUsage>()
  private view: TranscriptView = TranscriptReader.emptyView()

  constructor(readonly file: string) {}

  private static emptyView(): TranscriptView {
    return {
      found: false,
      lastRecordAt: null,
      lastEvent: null,
      pendingTools: [],
      usage: EMPTY_USAGE,
      model: null,
      plan: [],
      planAt: null,
      ask: null,
      entries: [],
      reports: [],
      teamTasks: [],
      toolCounts: {},
      skipped: 0,
    }
  }

  async refresh(): Promise<TranscriptView> {
    let handle: fs.FileHandle
    try {
      handle = await fs.open(this.file, 'r')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { ...TranscriptReader.emptyView(), found: false }
      }
      throw error
    }

    try {
      const { size } = await handle.stat()
      if (size < this.offset) this.reset() // la app lo reescribió: se relee entero
      if (size > this.offset) {
        const buffer = Buffer.alloc(size - this.offset)
        await handle.read(buffer, 0, buffer.length, this.offset)
        this.offset = size
        this.consume(buffer.toString('utf8'))
      }
    } finally {
      await handle.close()
    }

    this.view.found = true
    this.view.usage = [...this.usageByMessage.values()].reduce(addUsage, EMPTY_USAGE)
    return this.view
  }

  private reset() {
    this.offset = 0
    this.leftover = ''
    this.usageByMessage.clear()
    this.view = TranscriptReader.emptyView()
  }

  private consume(chunk: string) {
    const lines = (this.leftover + chunk).split('\n')
    // La última línea puede estar a medio escribir: se guarda para la próxima.
    this.leftover = lines.pop() ?? ''
    for (const line of lines) {
      if (line) this.consumeLine(line)
    }
  }

  private consumeLine(line: string) {
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      this.view.skipped += 1
      return
    }

    const type = z.object({ type: z.string(), timestamp: z.string().optional() }).safeParse(record)
    if (!type.success) {
      this.view.skipped += 1
      return
    }
    if (type.data.timestamp) {
      const at = Date.parse(type.data.timestamp)
      if (!Number.isNaN(at)) this.view.lastRecordAt = Math.max(this.view.lastRecordAt ?? 0, at)
    }

    if (type.data.type === 'assistant') this.consumeAssistant(record)
    if (type.data.type === 'user') this.consumeUser(record)
  }

  private consumeAssistant(record: unknown) {
    const parsed = assistantSchema.safeParse(record)
    if (!parsed.success) {
      this.view.skipped += 1
      return
    }
    const { uuid, timestamp, message, isSidechain, isApiErrorMessage } = parsed.data
    if (isSidechain || isApiErrorMessage || message.model === '<synthetic>') return

    const at = Date.parse(timestamp)
    if (message.model) this.view.model = message.model

    // Cada bloque llega en su propio registro y todos repiten el `usage` del
    // mensaje: 9.197 registros para 3.699 mensajes. Sumarlos da 3,9 veces de más.
    if (message.id && message.usage) {
      const u = message.usage
      this.usageByMessage.set(message.id, {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      })
    }

    for (const [index, block] of message.content.entries()) {
      if (block.type === 'text' && typeof block.text === 'string') {
        this.consumeText(`${uuid}:${index}`, at, block.text)
      } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
        // Llega vacío salvo que la sesión esté en la vista Thinking.
        this.push({ id: `${uuid}:${index}`, at, kind: 'reasoning', text: clip(block.thinking), peer: null })
      } else if (block.type === 'tool_use') {
        this.consumeToolUse(uuid, at, block)
      }
    }

    if (message.stop_reason === 'tool_use') this.view.lastEvent = 'tool_call'
    else if (message.stop_reason) this.view.lastEvent = 'turn_end'
  }

  private consumeText(id: string, at: number, text: string) {
    const clean = text.trim()
    if (!clean) return
    this.push({ id, at, kind: 'reasoning', text: clip(clean), peer: null })
    const report = TEAM_REPORT.exec(clean)
    if (report) this.closeTeamTask(Number(report[1]), report[2], at, clip(clean))
  }

  private consumeToolUse(uuid: string, at: number, block: unknown) {
    const tool = toolUseSchema.safeParse(block)
    if (!tool.success) {
      this.view.skipped += 1
      return
    }
    const { id, name, input } = tool.data
    const shortName = name.startsWith('mcp__') ? (name.split('__').pop() ?? name) : name
    this.view.toolCounts[shortName] = (this.view.toolCounts[shortName] ?? 0) + 1

    const summary = describeTool(name, input)
    this.view.pendingTools.push({ id, name, summary: summary ?? 'Preparando el próximo paso', at })
    if (summary) this.push({ id: `${uuid}:${id}`, at, kind: 'log', text: summary, peer: null })

    if (name === 'mcp__ccd_turn__update_plan') this.consumePlan(input, at)
    if (name === 'mcp__ccd_turn__wrap_up') this.consumeWrapUp(uuid, id, input, at)
    if (name === 'SendMessage') this.consumeSendMessage(uuid, id, input, at)
    if (name === 'AskUserQuestion') {
      const ask = askUserSchema.safeParse(input)
      if (ask.success) this.view.ask = { question: clip(ask.data.questions[0].question), at }
    }
  }

  private consumePlan(input: Record<string, unknown>, at: number) {
    const parsed = planInputSchema.safeParse(input)
    if (!parsed.success) {
      this.view.skipped += 1
      return
    }
    const { items, advance, done, start } = parsed.data
    const plan = items ? items.map(i => ({ content: i.content, status: i.status })) : [...this.view.plan]

    if (advance) {
      const current = plan.findIndex(step => step.status === 'in_progress')
      if (current >= 0) plan[current] = { ...plan[current], status: 'completed' }
      const next = plan.findIndex(step => step.status === 'pending')
      if (next >= 0) plan[next] = { ...plan[next], status: 'in_progress' }
    }
    // `done` y `start` cuentan desde 1.
    for (const position of done ?? []) {
      if (plan[position - 1]) plan[position - 1] = { ...plan[position - 1], status: 'completed' }
    }
    if (start && plan[start - 1]) plan[start - 1] = { ...plan[start - 1], status: 'in_progress' }

    this.view.plan = plan
    this.view.planAt = at
  }

  private consumeWrapUp(uuid: string, id: string, input: Record<string, unknown>, at: number) {
    const parsed = wrapUpSchema.safeParse(input)
    if (!parsed.success) {
      this.view.skipped += 1
      return
    }
    const { recap, ask } = parsed.data
    // `wrap_up` también tilda la lista de tareas.
    this.view.plan = this.view.plan.map(step =>
      step.status === 'in_progress' ? { ...step, status: 'completed' } : step,
    )
    if (recap) {
      const text = recap.trim()
      this.view.reports = [...this.view.reports.slice(-9), { id: `${uuid}:${id}`, at, text }]
      this.push({ id: `${uuid}:${id}:report`, at, kind: 'report', text: clip(text), peer: null })
      const report = TEAM_REPORT.exec(text)
      if (report) this.closeTeamTask(Number(report[1]), report[2], at, clip(text))
    }
    if (ask) {
      this.view.ask = { question: clip(ask), at }
      this.push({ id: `${uuid}:${id}:ask`, at, kind: 'ask', text: clip(ask), peer: null })
    }
  }

  private consumeSendMessage(uuid: string, id: string, input: Record<string, unknown>, at: number) {
    const parsed = sendMessageSchema.safeParse(input)
    if (!parsed.success) {
      this.view.skipped += 1
      return
    }
    const { to, message, summary } = parsed.data
    this.push({ id: `${uuid}:${id}:msg`, at, kind: 'message_out', text: clip(summary ?? message, 140), peer: to })

    const task = TEAM_TASK.exec(message)
    if (task) {
      const number = Number(task[1])
      this.view.teamTasks = [
        ...this.view.teamTasks.filter(t => t.number !== number),
        { number, title: clip(task[2], 120), at, outcome: null, outcomeAt: null, report: null },
      ]
    }
  }

  private closeTeamTask(number: number, outcome: string, at: number, report: string) {
    // El informe vive en el transcript del que la hizo, así que acá se anota aunque
    // la tarea la haya creado otra sesión: `live-office` junta los dos lados.
    const existing = this.view.teamTasks.find(t => t.number === number)
    const closed: TeamTask = {
      number,
      title: existing?.title ?? `T${number}`,
      at: existing?.at ?? at,
      outcome: outcome === 'hecha' ? 'hecha' : 'trabada',
      outcomeAt: at,
      report,
    }
    this.view.teamTasks = [...this.view.teamTasks.filter(t => t.number !== number), closed]
  }

  private consumeUser(record: unknown) {
    const parsed = userSchema.safeParse(record)
    if (!parsed.success) {
      this.view.skipped += 1
      return
    }
    const { uuid, timestamp, message, origin, isMeta } = parsed.data
    if (isMeta) return
    const at = Date.parse(timestamp)
    const blocks = typeof message.content === 'string' ? null : message.content

    if (blocks) {
      for (const block of blocks) {
        const result = toolResultSchema.safeParse(block)
        if (block.type === 'tool_result' && result.success) {
          this.view.pendingTools = this.view.pendingTools.filter(t => t.id !== result.data.tool_use_id)
        }
      }
    }

    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content.flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n')

    if (origin?.kind === 'human' && text.trim()) {
      this.view.ask = null
      this.push({ id: uuid, at, kind: 'prompt', text: clip(text), peer: null })
    } else if (origin?.kind === 'peer') {
      this.view.ask = null
      const peer = PEER_MESSAGE.exec(text)
      this.push({ id: uuid, at, kind: 'message_in', text: clip(peer?.[2] ?? text, 140), peer: peer?.[1] ?? null })
    }

    this.view.lastEvent = 'user'
  }

  private push(entry: TranscriptEntry) {
    this.view.entries = [...this.view.entries.slice(-(MAX_ENTRIES - 1)), entry]
  }
}
