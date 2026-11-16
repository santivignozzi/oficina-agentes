// Precios de lista por millón de tokens, de la página oficial de Anthropic (2/11/2026).
// Un modelo sin precio no corre: con un costo inventado, el tope de gasto no serviría.

interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

/** Haiku cobra todo el pedido más caro si el prompt pasa este largo. */
const LONG_PROMPT_TOKENS = 100_000
const HAIKU_LONG: ModelPrice = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 }

const SEARCH_USD = 0.01

/** Lo que suma cada búsqueda al contexto. No está medido: sale de la estimación de docs/ARQUITECTURA.md. */
const SEARCH_CONTEXT_TOKENS = 15_000
const CHARS_PER_TOKEN = 3

export interface CallUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  server_tool_use?: { web_search_requests: number } | null
}

/** Los modelos que la oficina sabe cobrar. Uno fuera de esta lista no arranca. */
export const PRICED_MODELS = Object.keys(PRICES)

function priceOf(model: string): ModelPrice {
  const price = PRICES[model]
  if (!price) throw new Error(`No tengo el precio de ${model}: sumalo en server/agents/pricing.ts antes de usarlo.`)
  return price
}

/** Dynamic filtering no está en Haiku: ahí va la versión anterior de la búsqueda. */
export function searchToolFor(model: string) {
  return model.startsWith('claude-haiku') ? 'web_search_20250305' : 'web_search_20260209'
}

export function costUsd(model: string, usage: CallUsage) {
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const prompt = usage.input_tokens + cacheRead + cacheWrite
  const price = model === 'claude-haiku-5-5' && prompt > LONG_PROMPT_TOKENS ? HAIKU_LONG : priceOf(model)
  const tokens =
    usage.input_tokens * price.input +
    usage.output_tokens * price.output +
    cacheRead * price.cacheRead +
    cacheWrite * price.cacheWrite
  return tokens / 1_000_000 + (usage.server_tool_use?.web_search_requests ?? 0) * SEARCH_USD
}

/**
 * Lo máximo razonable que puede costar una llamada, para reservarlo antes de hacerla.
 * Cada búsqueda vuelve a mandar lo que juntaron las anteriores: por eso la suma triangular.
 */
export function worstCaseUsd(model: string, promptChars: number, maxTokens: number, searches: number) {
  const reread = (SEARCH_CONTEXT_TOKENS * searches * (searches + 1)) / 2
  return costUsd(model, {
    input_tokens: Math.ceil(promptChars / CHARS_PER_TOKEN) + reread,
    output_tokens: maxTokens,
    server_tool_use: { web_search_requests: searches },
  })
}
