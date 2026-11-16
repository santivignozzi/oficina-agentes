import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import type { BetaManagedAgentsStreamSessionEvents } from '@anthropic-ai/sdk/resources/beta/sessions/events'
import type { AgentRunContext, WorkInput, WorkResult } from '../ports'
import type { Budget } from './budget'
import { explain } from './claude-runner'
import type { WorkerConfig } from '@/config'
import { repoPrompt, repoSystem, type RepoInfo } from './prompts'

// El agente que lee repos, con un agente de verdad: Managed Agents clona los repos en un contenedor de Anthropic
// y corre ahí las herramientas. Acá sólo se abre la sesión, se la sigue y se cuenta el gasto.
// El token de GitHub no entra al contenedor: lo inyecta un proxy del lado de Anthropic.
// Qué repos puede leer lo decide el token, no una lista de acá.

/** La lista de GitHub se pide de nuevo cada tanto: un repo sumado al token aparece solo. */
const REPOS_TTL_MS = 5 * 60_000
/** Los más recientes. Es lo que ve la dirección en cada plan, y cada línea se paga. */
const MAX_REPOS = 50
const SITE_CHECK_MS = 5_000

/** La API frena antes de cada pedido al modelo, pero el que cruza el tope se completa: el doble lo cubre. */
const WORST_CASE_FACTOR = 2
const MAX_SESSION_MS = 30 * 60_000
const MAX_DROPS = 20
const RECONNECT_MS = 2_000
/** El estado consultable llega un poco después que el evento de fin. */
const STOP_CHECKS = 20
const STOP_CHECK_MS = 500

/** Sin medir: sólo mueve la barra de avance hasta que haya una corrida real. */
const EXPECTED_TOOL_CALLS = 30
const MAX_REASON_CHARS = 220
const MAX_DETAIL_CHARS = 100

const VERBS: Record<string, string> = { read: 'Leo', glob: 'Busco archivos', grep: 'Busco', bash: 'Corro' }

/** Lo que tiene que revisar la persona según lo que contestó GitHub. */
const REPO_ERRORS: Record<string, string> = {
  repository_authentication_error: 'GitHub rechazó el token: puede estar vencido o mal copiado en AI_OFFICE_GITHUB_TOKEN.',
  repository_forbidden_error: 'El token no tiene permiso sobre el repo: revisá que tenga Contents en Read-only.',
  repository_not_found_error: 'Con este token GitHub no ve el repo: revisá que esté elegido en Repository access.',
  repository_clone_error: 'GitHub dejó entrar, pero no se pudo clonar.',
  repository_checkout_error: 'No existe la rama que se pidió.',
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const usd = (value: number) => `USD ${value.toFixed(2)}`

interface Setup {
  agentId: string
  environmentId: string
  fingerprint: string
}

type Ending =
  | { kind: 'finished'; stop: 'end_turn' | 'budget_reached' | 'retries_exhausted' | 'terminated' }
  | { kind: 'refused'; category: string | null }
  | { kind: 'no_repo'; detail: string }

interface Run {
  /** El último mensaje del agente. Si terminó bien, es el informe. */
  report: string | null
  problem: string | null
  toolCalls: number
}

function describe(name: string, input: Record<string, unknown>) {
  const detail = [input.file_path, input.pattern, input.command].find(value => typeof value === 'string') as string | undefined
  const verb = VERBS[name] ?? name
  return detail ? `${verb}: ${detail.slice(0, MAX_DETAIL_CHARS)}` : verb
}

/** El nombre tal cual, sin pegarse a otro: `tienda` no es `tienda-web`. */
function mentions(text: string, name: string) {
  const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w.-])${escaped}($|[^\\w.-]|\\.(?=\\s|$))`).test(text.toLowerCase())
}

/**
 * Los hosts a los que tiene que llegar el navegador. Muchos sitios redirigen a su dominio
 * propio, como `tienda.vercel.app` a `tienda.com`: sin el destino, no abre.
 */
async function siteOf(homepage: string | null) {
  if (!homepage) return { site: null, hosts: [] }
  const hosts = new Set<string>()
  const add = (url: string) => {
    const host = new URL(url).hostname
    hosts.add(host)
    const labels = host.split('.')
    if (labels[0] === 'www') hosts.add(labels.slice(1).join('.'))
    else if (labels.length === 2) hosts.add(`www.${host}`)
  }
  try {
    add(homepage)
  } catch {
    return { site: null, hosts: [] }
  }
  let site = homepage
  try {
    const response = await fetch(homepage, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(SITE_CHECK_MS) })
    site = response.url || homepage
    add(site)
  } catch {
    // Si no responde desde acá, igual queda lo que figura en GitHub.
  }
  return { site, hosts: [...hosts] }
}

interface GitHubRepo {
  name: string
  html_url: string
  description: string | null
  homepage: string | null
}

interface Options {
  /** El agente de la configuración que lee los repos. */
  worker: WorkerConfig
  client: Anthropic
  model: string
  budget: Budget
  setupFile: string
  token: string
  capUsd: number
  githubApi: string
}

export class RepoWorker {
  private listed: { at: number; repos: RepoInfo[] } | null = null

  constructor(private options: Options) {}

  private get client() {
    return this.options.client
  }

  private get capUsd() {
    return this.options.capUsd
  }

  /** Los repos que deja leer el token, con el sitio que figura en "Website" en GitHub. */
  async readable(signal?: AbortSignal): Promise<RepoInfo[]> {
    if (this.listed && Date.now() - this.listed.at < REPOS_TTL_MS) return this.listed.repos
    const response = await fetch(`${this.options.githubApi}/user/repos?per_page=100&sort=pushed`, {
      headers: { authorization: `Bearer ${this.options.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      signal,
    }).catch(error => {
      if (signal?.aborted) throw error
      throw new Error('No se pudo conectar con GitHub para ver tus repos.')
    })
    if (response.status === 401) throw new Error('GitHub rechazó el token: puede estar vencido o mal copiado en AI_OFFICE_GITHUB_TOKEN.')
    if (!response.ok) throw new Error(`GitHub no devolvió la lista de repos (error ${response.status}).`)
    const found = ((await response.json()) as GitHubRepo[]).slice(0, MAX_REPOS)
    const repos = await Promise.all(
      found.map(async repo => ({ name: repo.name, url: repo.html_url, description: repo.description, ...(await siteOf(repo.homepage)) })),
    )
    this.listed = { at: Date.now(), repos }
    return repos
  }

  /** Los repos que nombra la tarea. La dirección escribe el nombre exacto; en una tarea directa, vos. */
  async pick(input: WorkInput, signal: AbortSignal) {
    const text = `${input.task.title}\n${input.task.description}`
    return (await this.readable(signal)).filter(repo => mentions(text, repo.name))
  }

  async work(input: WorkInput, repos: RepoInfo[], ctx: AgentRunContext): Promise<WorkResult> {
    const sessionId = await this.open(input, repos, ctx)
    const deadline = AbortSignal.timeout(MAX_SESSION_MS)
    const run: Run = { report: null, problem: null, toolCalls: 0 }
    let ended = false

    try {
      const ending = await this.follow(sessionId, repoPrompt(input, repos), run, ctx, AbortSignal.any([ctx.signal, deadline]))
      ended = ending.kind === 'finished'
      const output = this.outcome(ending, run)
      await ctx.checkpoint()
      return { output }
    } catch (error) {
      if (ctx.signal.aborted) throw ctx.signal.reason
      if (deadline.aborted) throw new Error(`La sesión pasó de ${MAX_SESSION_MS / 60_000} minutos y se cortó.`)
      throw error
    } finally {
      // Sin este corte seguiría gastando en Anthropic, aunque acá ya nadie la mire.
      if (!ended) await this.interrupt(sessionId)
      await this.settle(sessionId, ctx)
    }
  }

  /** Un reinicio corta el seguimiento, no la sesión: se frena y se cuenta lo que gastó. */
  async closeOrphans() {
    for (const sessionId of this.options.budget.openSessions) {
      await this.interrupt(sessionId)
      await this.settle(sessionId)
    }
  }

  private async open(input: WorkInput, repos: RepoInfo[], ctx: AgentRunContext) {
    const { budget, token } = this.options
    const worstCase = this.capUsd * WORST_CASE_FACTOR
    const release = budget.reserve(worstCase)
    try {
      const { agentId, environmentId } = await this.setup(ctx.signal)
      await ctx.log(`Abro ${repos.map(repo => repo.name).join(', ')} en un entorno aparte, con un tope de ${usd(this.capUsd)}`)
      const session = await this.client.beta.sessions.create(
        {
          agent: agentId,
          environment_id: environmentId,
          title: `${this.options.worker.name}: ${input.task.title}`.slice(0, 200),
          budget: { type: 'limit', max_list_cost: { amount: String(Math.round(this.capUsd * 100)), currency: 'USD' } },
          resources: repos.map(repo => ({ type: 'github_repository' as const, url: repo.url, authorization_token: token })),
        },
        { signal: ctx.signal },
      )
      // Va al disco antes de que empiece a gastar: si se cae el server, el próximo arranque la cierra.
      budget.hold(session.id, worstCase)
      return session.id
    } catch (error) {
      if (ctx.signal.aborted) throw ctx.signal.reason
      if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.NotFoundError) {
        throw new Error('Esta cuenta de Anthropic no tiene acceso a Managed Agents, o no con este modelo.')
      }
      throw explain(error)
    } finally {
      release()
    }
  }

  /** El agente y el entorno se crean una vez. Si cambia su definición, se actualizan los mismos. */
  private async setup(signal: AbortSignal): Promise<Setup> {
    const agent = {
      name: this.options.worker.name,
      model: { id: this.options.model, effort: 'medium' as const },
      system: repoSystem(this.options.worker),
      tools: [
        {
          type: 'agent_toolset_20260401' as const,
          // Sin `write` ni `edit`: puede mirar, no retocar. Web apagada: los sitios se abren con
          // Playwright o curl, y la red del entorno sólo llega a los sitios de tus repos.
          default_config: { enabled: false, permission_policy: { type: 'auto' as const } },
          configs: [
            { name: 'read' as const, enabled: true },
            { name: 'glob' as const, enabled: true },
            { name: 'grep' as const, enabled: true },
            { name: 'bash' as const, enabled: true },
          ],
        },
      ],
    }
    // Un solo entorno para todos: cambia sólo cuando cambian los sitios de tus repos.
    const hosts = [...new Set((await this.readable(signal)).flatMap(repo => repo.hosts))].sort()
    const config = { type: 'cloud' as const, networking: { type: 'limited' as const, allowed_hosts: hosts } }
    const fingerprint = createHash('sha256').update(JSON.stringify({ agent, config })).digest('hex')

    const saved = this.savedSetup()
    if (saved?.fingerprint === fingerprint) return saved

    const { beta } = this.client
    const environment = saved
      ? await beta.environments.update(saved.environmentId, { config }, { signal })
      : await beta.environments.create({ name: 'ai-office-repo', config }, { signal })
    const created = saved
      ? await beta.agents.update(saved.agentId, agent, { signal })
      : await beta.agents.create(agent, { signal })

    const setup = { agentId: created.id, environmentId: environment.id, fingerprint }
    mkdirSync(dirname(this.options.setupFile), { recursive: true, mode: 0o700 })
    const temporary = `${this.options.setupFile}.tmp`
    writeFileSync(temporary, JSON.stringify(setup), { mode: 0o600 })
    renameSync(temporary, this.options.setupFile)
    return setup
  }

  private savedSetup(): Setup | null {
    try {
      return JSON.parse(readFileSync(this.options.setupFile, 'utf8')) as Setup
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[agentes] no se pudo leer el agente guardado', error)
      return null
    }
  }

  /**
   * El stream no repite lo que pasó mientras estaba caído: cada vez que se abre se repasa
   * el historial, y se abre antes de mandar la consigna para no perder los primeros eventos.
   */
  private async follow(sessionId: string, prompt: string, run: Run, ctx: AgentRunContext, signal: AbortSignal) {
    const { events } = this.client.beta.sessions
    const seen = new Set<string>()
    let sent = false
    // Una sesión nace `idle`: ese estado sólo significa "terminó" después de la consigna.
    let started = false

    const take = async (event: BetaManagedAgentsStreamSessionEvents): Promise<Ending | null> => {
      if (!('id' in event)) return null
      if (event.type === 'user.message') started = true
      if (!seen.has(event.id)) {
        // Se marca después: si no se pudo negar un permiso, el próximo repaso lo reintenta.
        const failed = await this.show(event, sessionId, run, ctx)
        seen.add(event.id)
        if (failed) return failed
      }
      if (!started) return null
      if (event.type === 'session.status_terminated') return { kind: 'finished', stop: 'terminated' }
      if (event.type !== 'session.status_idle') return null
      if (event.stop_reason.type === 'requires_action') return null
      if (event.stop_reason.type === 'refusal') return { kind: 'refused', category: event.stop_details?.category ?? null }
      return { kind: 'finished', stop: event.stop_reason.type }
    }

    for (let drops = 0; ; drops++) {
      try {
        const stream = await events.stream(sessionId, {}, { signal })
        if (!sent) {
          await events.send(sessionId, { events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }] }, { signal })
          sent = true
        }
        for await (const event of events.list(sessionId, { order: 'asc' }, { signal })) {
          const ending = await take(event)
          if (ending) return ending
        }
        for await (const event of stream) {
          const ending = await take(event)
          if (ending) return ending
        }
      } catch (error) {
        if (signal.aborted) throw error
        if (drops >= MAX_DROPS) throw explain(error)
        console.warn('[agentes] se cortó el seguimiento de la sesión', error)
      }
      await delay(RECONNECT_MS)
    }
  }

  private async show(event: BetaManagedAgentsStreamSessionEvents, sessionId: string, run: Run, ctx: AgentRunContext): Promise<Ending | null> {
    if (event.type === 'agent.tool_use') {
      run.toolCalls += 1
      await ctx.progress(Math.min(0.95, run.toolCalls / EXPECTED_TOOL_CALLS))
      await ctx.log(describe(event.name, event.input))
      if (event.evaluated_permission === 'ask') await this.deny(event.id, event.name, sessionId, ctx)
    }
    if (event.type === 'agent.message') {
      const text = event.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('').trim()
      if (text) {
        run.report = text
        await ctx.reason(text.length > MAX_REASON_CHARS ? `${text.slice(0, MAX_REASON_CHARS)}…` : text)
      }
    }
    if (event.type === 'session.error') {
      const { type, message } = event.error
      // Llegan siempre como `retrying`, pero la sesión sigue sin el repo: un informe así sería inventado.
      if (type.startsWith('repository_')) {
        const url = 'repository_url' in event.error ? event.error.repository_url : null
        const name = url?.split('/').pop() ?? 'un repo'
        return { kind: 'no_repo', detail: `No se pudo abrir ${name}. ${REPO_ERRORS[type] ?? 'GitHub no dejó abrirlo.'} GitHub dijo: "${message}"` }
      }
      if (event.error.retry_status?.type !== 'retrying') run.problem = message
      await ctx.log(`Aviso de la sesión: ${message}`)
    }
    return null
  }

  /** Nadie mira la sesión mientras corre: lo que el servidor no pudo evaluar no se aprueba solo. */
  private async deny(toolUseId: string, name: string, sessionId: string, ctx: AgentRunContext) {
    await ctx.log(`No se aprobó este paso (${name}): nadie puede autorizarlo ahora`)
    await this.client.beta.sessions.events.send(sessionId, {
      events: [
        {
          type: 'user.tool_confirmation',
          tool_use_id: toolUseId,
          result: 'deny',
          deny_message: 'Nadie puede aprobar este paso ahora. Seguí sin él y aclaralo en el informe.',
        },
      ],
    })
  }

  private outcome(ending: Ending, { report, problem, toolCalls }: Run) {
    if (ending.kind === 'no_repo') throw new Error(ending.detail)
    if (ending.kind === 'refused') throw new Error(`El modelo cortó la tarea por sus filtros de seguridad${ending.category ? ` (${ending.category})` : ''}.`)
    if (ending.stop === 'budget_reached') {
      if (!report) throw new Error(`Llegó al tope de ${usd(this.capUsd)} antes de escribir nada.`)
      return `> Llegó al tope de ${usd(this.capUsd)} por sesión: esto es lo último que escribió, no el informe completo.\n\n${report}`
    }
    if (ending.stop !== 'end_turn') throw new Error(problem ?? 'La sesión terminó con un error.')
    if (!report) throw new Error(`La sesión terminó sin informe, después de ${toolCalls} pasos.`)
    return report
  }

  private async interrupt(sessionId: string) {
    try {
      await this.client.beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }] })
    } catch (error) {
      console.error(`[agentes] no se pudo frenar la sesión ${sessionId}`, error)
    }
  }

  /** Pasa el gasto real al tope. Si la sesión no se frena, queda apartado hasta el próximo arranque. */
  private async settle(sessionId: string, ctx?: AgentRunContext) {
    try {
      const session = await this.stopped(sessionId)
      if (!session) {
        console.error(`[agentes] la sesión ${sessionId} sigue corriendo: su gasto queda apartado`)
        return
      }
      const { usage } = session
      // `list_cost` viene en centavos e incluye tokens, búsquedas y tiempo de ejecución.
      const measured = usage.list_cost ? Number(usage.list_cost.amount) / 100 : null
      const cost = this.options.budget.close(sessionId, measured)
      const cache = usage.cache_creation
      await ctx?.usage(
        {
          input: usage.input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          cacheWrite: (cache?.ephemeral_5m_input_tokens ?? 0) + (cache?.ephemeral_1h_input_tokens ?? 0),
        },
        cost,
      )
      const seconds = Math.round(usage.active_seconds ?? 0)
      const note = measured === null ? `${usd(cost)} apartados: Anthropic no informó el costo` : usd(cost)
      await ctx?.log(`Sesión ${sessionId}: ${note}, ${seconds} s corriendo`)
    } catch (error) {
      console.error(`[agentes] no se pudo cerrar la cuenta de la sesión ${sessionId}`, error)
    }
  }

  private async stopped(sessionId: string) {
    for (let check = 0; check < STOP_CHECKS; check++) {
      const session = await this.client.beta.sessions.retrieve(sessionId)
      if (session.status === 'idle' || session.status === 'terminated') return session
      await delay(STOP_CHECK_MS)
    }
    return null
  }
}
