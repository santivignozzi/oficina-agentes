import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { MANAGER, MAX_SUBTASKS, OFFICE, WORKERS, workerById, type WorkerConfig } from '@/config'
import type { AgentCapability } from '@/domain/types'
import type {
  AgentRunContext,
  AgentRunner,
  ConsolidatedDeliverable,
  ConsolidateInput,
  PlanInput,
  PlannedSubtask,
  WorkInput,
  WorkResult,
} from '../ports'
import type { Budget } from './budget'
import { costUsd, searchToolFor, worstCaseUsd, type CallUsage } from './pricing'
import { consolidatePrompt, consolidateSystem, planPrompt, planSystem, workPrompt, workSystem } from './prompts'
import type { RepoWorker } from './repo-worker'

// Ejecutor real. Cada método es una llamada a Claude con streaming, y `ctx` lleva a la
// oficina lo que va pasando. El pensamiento también consume `max_tokens`: por eso los
// topes están holgados respecto de los límites de palabras de los prompts.
const PLAN_TOKENS = 6_000
const WORK_TOKENS = 12_000
const CONSOLIDATE_TOKENS = 12_000

const MAX_SEARCHES = 5
const MCP_BETA = 'mcp-client-2025-11-20'
/** Cuántas veces se retoma un turno que el servidor dejó en pausa. */
const MAX_TURNS = 3

const EXPECTED_CHARS = 3_500
const PROGRESS_EVERY_MS = 1_000
const REASON_EVERY_MS = 2_500
const MIN_REASON_CHARS = 40
const MAX_REASON_CHARS = 220
const CHARS_PER_OUTPUT_TOKEN = 3.5

const planSchema = z.object({
  subtasks: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      description: z.string(),
      capability: z.enum(WORKERS.map(worker => worker.id) as [string, ...string[]]),
      dependsOn: z.array(z.string()),
    }),
  ),
})

/** Búsqueda web y servidores MCP. Con MCP, la llamada va con su beta. */
function toolsFor(search: string | null, searchesLeft: number, mcp: McpServer[]) {
  const tools: Anthropic.Beta.BetaToolUnion[] = []
  if (search) tools.push({ type: search, name: 'web_search', max_uses: searchesLeft } as Anthropic.Beta.BetaToolUnion)
  for (const { definition, allowedTools } of mcp) {
    tools.push({
      type: 'mcp_toolset',
      mcp_server_name: definition.name,
      // Con lista, todo lo demás queda apagado: una herramienta nueva del servidor no se suma sola.
      ...(allowedTools
        ? { default_config: { enabled: false }, configs: Object.fromEntries(allowedTools.map(name => [name, { enabled: true }])) }
        : {}),
    })
  }
  if (tools.length === 0) return {}
  return mcp.length > 0 ? { tools, mcp_servers: mcp.map(server => server.definition), betas: [MCP_BETA] } : { tools }
}

const deliverableSchema = z.object({
  title: z.string(),
  summary: z.string(),
  body: z.string(),
})

/** Qué modelo usa cada uno: la dirección es `manager`, cada agente su id. */
export type ModelChoice = Record<AgentCapability, string>

/** Un servidor MCP listo para mandar: con el token ya leído de su variable. */
export interface McpServer {
  definition: Anthropic.Beta.BetaRequestMCPServerURLDefinition
  /** `null`: todas sus herramientas. */
  allowedTools: string[] | null
}

interface Call {
  capability: AgentCapability
  system: string
  prompt: string
  maxTokens: number
  format?: Anthropic.JSONOutputFormat
  search?: boolean
  mcp?: McpServer[]
  showProgress?: boolean
}

type Message = Anthropic.Beta.BetaMessage

const textOf = (message: Message) =>
  message.content
    .flatMap(block => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim()

const wasCut = (message: Message) => message.stop_reason === 'max_tokens' || message.stop_reason === 'pause_turn'

function sourcesOf(message: Message) {
  const sources = new Map<string, string>()
  for (const block of message.content) {
    if (block.type !== 'text') continue
    for (const citation of block.citations ?? []) {
      if (citation.type === 'web_search_result_location') sources.set(citation.url, citation.title ?? citation.url)
    }
  }
  return [...sources].map(([url, title]) => `- [${title}](${url})`)
}

/** Lo que falla acá lo lee una persona en el panel: nada de volcados de la API. */
export function explain(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return new Error('Anthropic rechazó la clave: revisá ANTHROPIC_API_KEY.')
  if (error instanceof Anthropic.PermissionDeniedError) return new Error('La clave no tiene permiso para usar este modelo.')
  if (error instanceof Anthropic.RateLimitError) return new Error('Anthropic limitó las llamadas. Probá de nuevo en un rato.')
  if (error instanceof Anthropic.APIConnectionError) return new Error('No se pudo conectar con Anthropic.')
  if (error instanceof Anthropic.APIError) {
    // `message` trae el cuerpo crudo; adentro está la frase, como la del crédito agotado.
    const detail = (error.error as { error?: { message?: string } } | undefined)?.error?.message ?? error.message
    return new Error(`Anthropic rechazó la llamada: ${detail}`)
  }
  return error
}

function parseJson<T>(message: Message, schema: z.ZodType<T>) {
  if (wasCut(message)) throw new Error('La respuesta se cortó antes de terminar.')
  const parsed = schema.safeParse(JSON.parse(textOf(message)))
  if (!parsed.success) throw new Error('La respuesta no tiene el formato esperado.')
  return parsed.data
}

export class ClaudeRunner implements AgentRunner {
  constructor(
    private client: Anthropic,
    private models: ModelChoice,
    private budget: Budget,
    /** Con esto el agente de repos lee de verdad los que nombra la tarea. Sin esto, propone a ciegas. */
    private repos: RepoWorker | null = null,
    private mcpServers: McpServer[] = [],
  ) {}

  private mcpOf(worker: WorkerConfig | null) {
    const names = new Set(worker?.tools?.mcp ?? [])
    return this.mcpServers.filter(server => names.has(server.definition.name))
  }

  async plan({ goal }: PlanInput, ctx: AgentRunContext): Promise<PlannedSubtask[]> {
    await ctx.log('Leo la consigna y armo el plan')
    const repos = await this.readableRepos(ctx)
    const message = await this.call(
      {
        capability: MANAGER,
        system: planSystem(repos, MAX_SUBTASKS),
        prompt: planPrompt(goal.description),
        maxTokens: PLAN_TOKENS,
        format: zodOutputFormat(planSchema),
      },
      ctx,
    )
    const { subtasks } = parseJson(message, planSchema)
    if (subtasks.length === 0) throw new Error('El plan vino sin subtareas.')
    if (subtasks.length > MAX_SUBTASKS) await ctx.log(`El plan traía ${subtasks.length} subtareas: quedan las primeras ${MAX_SUBTASKS}.`)
    return subtasks.slice(0, MAX_SUBTASKS)
  }

  async work(input: WorkInput, ctx: AgentRunContext): Promise<WorkResult> {
    const { capability } = input.agent
    const worker = workerById(input.agent.id)
    if (input.revisionNote) await ctx.reason(`Pediste: "${input.revisionNote}". Reviso eso primero.`)
    if (worker?.tools?.githubRepos && this.repos) {
      const repos = await this.repos.pick(input, ctx.signal).catch(error => {
        throw ctx.signal.aborted ? ctx.signal.reason : error
      })
      if (repos.length > 0) return this.repos.work(input, repos, ctx)
      await ctx.log('La tarea no nombra ningún repo que pueda leer: propongo sin ver el código')
    }
    const message = await this.call(
      {
        capability,
        system: workSystem(worker),
        prompt: workPrompt(input),
        maxTokens: WORK_TOKENS,
        search: worker?.tools?.webSearch ?? false,
        mcp: this.mcpOf(worker),
        showProgress: true,
      },
      ctx,
    )
    const text = textOf(message)
    if (!text) throw new Error('El modelo se quedó sin tokens antes de escribir la respuesta.')

    const sources = sourcesOf(message)
    const parts = [text]
    if (wasCut(message)) parts.push('> La respuesta se cortó por el límite de tokens: puede estar incompleta.')
    if (sources.length > 0) parts.push(`## Fuentes\n${sources.join('\n')}`)
    return { output: parts.join('\n\n') }
  }

  async consolidate(input: ConsolidateInput, ctx: AgentRunContext): Promise<ConsolidatedDeliverable> {
    await ctx.log('Junto lo que entregó el equipo')
    const message = await this.call(
      {
        capability: MANAGER,
        system: consolidateSystem(),
        prompt: consolidatePrompt(input),
        maxTokens: CONSOLIDATE_TOKENS,
        format: zodOutputFormat(deliverableSchema),
      },
      ctx,
    )
    return parseJson(message, deliverableSchema)
  }

  /** Si GitHub no responde, la dirección planifica igual y el motivo queda a la vista. */
  private async readableRepos(ctx: AgentRunContext) {
    if (!this.repos) return null
    try {
      return await this.repos.readable(ctx.signal)
    } catch (error) {
      if (ctx.signal.aborted) throw ctx.signal.reason
      await ctx.log(`No pude ver tus repos: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  private async call(call: Call, ctx: AgentRunContext) {
    const model = this.models[call.capability] ?? OFFICE.model
    const searches = call.search ? MAX_SEARCHES : 0
    const release = this.budget.reserve(worstCaseUsd(model, call.system.length + call.prompt.length, call.maxTokens, searches))
    try {
      const message = await this.turns(model, call, ctx)
      if (message.stop_reason === 'refusal') throw new Error('El modelo no quiso hacer esta tarea.')
      // La pausa no retiene la llamada: esperarla acá deja viva la conexión y no pierde lo pagado.
      await ctx.checkpoint()
      return message
    } finally {
      release()
    }
  }

  private async turns(model: string, call: Call, ctx: AgentRunContext) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: call.prompt }]
    const mcp = call.mcp ?? []
    let searches = 0

    for (let turn = 1; ; turn++) {
      const left = MAX_SEARCHES - searches
      const message = await this.turn(
        {
          model,
          max_tokens: call.maxTokens,
          thinking: { type: 'adaptive', display: 'summarized' },
          system: call.system,
          messages,
          ...(call.format ? { output_config: { format: call.format } } : {}),
          ...toolsFor(call.search ? searchToolFor(model) : null, left, mcp),
        },
        call,
        ctx,
      )
      searches += message.usage.server_tool_use?.web_search_requests ?? 0
      if (message.stop_reason !== 'pause_turn' || turn === MAX_TURNS || searches >= MAX_SEARCHES) return message
      // Se retoma reenviando el turno, sin mensaje nuevo: el servidor sigue donde quedó.
      messages.push({ role: 'assistant', content: message.content })
    }
  }

  private async turn(params: Anthropic.Beta.MessageCreateParamsNonStreaming, call: Call, ctx: AgentRunContext) {
    const stream = this.client.beta.messages.stream(params, { signal: ctx.signal })
    let seen: CallUsage | null = null
    let chars = 0
    let lastProgress = 0
    let lastReason = 0
    let told = 0

    const quietly = (work: Promise<void>) => void work.catch(error => console.error('[agentes] no se pudo publicar', error))

    stream.on('streamEvent', event => {
      if (event.type === 'message_start') seen = event.message.usage
      if (event.type === 'message_delta' && seen) seen = { ...seen, output_tokens: event.usage.output_tokens }
    })
    stream.on('thinking', (delta, snapshot) => {
      chars += delta.length
      if (snapshot.length < told) told = 0 // bloque nuevo
      const fresh = snapshot.slice(told).trim()
      const now = Date.now()
      if (fresh.length < MIN_REASON_CHARS || now - lastReason < REASON_EVERY_MS) return
      told = snapshot.length
      lastReason = now
      quietly(ctx.reason(fresh.length > MAX_REASON_CHARS ? `…${fresh.slice(-MAX_REASON_CHARS)}` : fresh))
    })
    stream.on('text', delta => {
      chars += delta.length
      const now = Date.now()
      if (!call.showProgress || now - lastProgress < PROGRESS_EVERY_MS) return
      lastProgress = now
      quietly(ctx.progress(Math.min(0.95, chars / EXPECTED_CHARS)))
    })
    stream.on('contentBlock', block => {
      if (block.type === 'mcp_tool_use') quietly(ctx.log(`Uso ${block.server_name}: ${block.name}`))
      if (block.type !== 'server_tool_use' || block.name !== 'web_search') return
      const { query } = block.input as { query?: unknown }
      if (typeof query === 'string') quietly(ctx.log(`Busco: ${query}`))
    })

    try {
      const message = await stream.finalMessage()
      await this.charge(params.model, message.usage, ctx)
      return message
    } catch (error) {
      // Lo generado hasta el corte igual se factura. El uso llega al final: hasta ahí, se estima.
      const partial = seen as CallUsage | null
      if (partial) {
        const output_tokens = Math.max(partial.output_tokens, Math.ceil(chars / CHARS_PER_OUTPUT_TOKEN))
        await this.charge(params.model, { ...partial, output_tokens }, ctx)
      }
      if (ctx.signal.aborted) throw ctx.signal.reason
      throw explain(error)
    }
  }

  private async charge(model: string, usage: CallUsage, ctx: AgentRunContext) {
    const cost = costUsd(model, usage)
    this.budget.charge(cost)
    await ctx.usage(
      {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
      },
      cost,
    )
  }
}
