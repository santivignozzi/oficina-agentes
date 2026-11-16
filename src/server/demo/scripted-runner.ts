import { DIRECTOR, MAX_SUBTASKS, WORKERS, workerById, type RoomStyle } from '@/config'
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

// Ejecutor simulado: no llama a ningún modelo. Su salida describe lo que haría un
// agente real y nunca trae datos que parezcan investigados, porque una entrega
// inventada con cara de real es peor que no tener entrega.

const STEP_MS = 1_100

interface Step {
  log: string
  reason: string
}

const MANAGER_STEPS: Step[] = [
  { log: 'Leo el objetivo completo', reason: 'Primero separo lo que hay que averiguar de lo que hay que decidir.' },
  { log: 'Veo qué parte le toca a cada uno', reason: 'Eso define quién toma cada parte.' },
  { log: 'Armo el orden de las subtareas', reason: 'Lo que depende de otro resultado va después.' },
  { log: 'Reparto el trabajo', reason: 'Asigno según lo que sabe hacer cada uno, no por nombre.' },
]

const STEPS: Record<RoomStyle, Step[]> = {
  biblioteca: [
    { log: 'Defino qué hay que averiguar', reason: 'Sin una pregunta concreta, la búsqueda se dispersa.' },
    { log: 'Abro las fuentes (simulado)', reason: 'Un agente real navegaría acá. Este motor no sale a internet.' },
    { log: 'Separo hechos de opiniones', reason: 'Lo que no pueda citar queda marcado como dudoso.' },
    { log: 'Comparo por los mismos criterios', reason: 'Comparar con criterios distintos da conclusiones falsas.' },
    { log: 'Ordeno los hallazgos', reason: 'Lo más accionable va primero.' },
    { log: 'Escribo el resumen', reason: 'Tiene que servirle al resto del equipo sin leer todo lo anterior.' },
  ],
  tecnica: [
    { log: 'Leo la especificación', reason: 'Antes de proponer, entiendo qué problema resuelve.' },
    { log: 'Reviso lo que ya existe (simulado)', reason: 'Conviene reutilizar antes que hacer de cero.' },
    { log: 'Elijo el cambio más chico', reason: 'Menos superficie, menos riesgo.' },
    { log: 'Redacto los pasos', reason: 'Cada paso tiene que poder comprobarse por separado.' },
    { log: 'Pienso los casos borde (simulado)', reason: 'Lo que puede fallar se maneja y se explica.' },
    { log: 'Escribo la propuesta', reason: 'Queda lista para que la revises.' },
  ],
  creativa: [
    { log: 'Defino para quién es', reason: 'Sin un destinatario claro, nada de lo que siga funciona.' },
    { log: 'Busco referencias (simulado)', reason: 'Un agente real miraría ejemplos acá. Este motor no sale a internet.' },
    { log: 'Armo la idea central', reason: 'Una frase que diga qué es y por qué importa.' },
    { log: 'La bajo a piezas concretas', reason: 'Pocas piezas, y que se entienda qué incluye cada una.' },
    { log: 'Elijo por dónde arrancar', reason: 'Mejor dos cosas bien hechas que cinco a medias.' },
    { log: 'Escribo la propuesta', reason: 'Con qué medir si funciona, para corregir rápido.' },
  ],
}

const WORD = /[a-záéíóúñü]{5,}/g
const wordsOf = (text: string) => new Set(text.toLowerCase().match(WORD) ?? [])

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

async function runSteps(steps: Step[], seed: string, ctx: AgentRunContext, stepMs = STEP_MS) {
  for (const [index, step] of steps.entries()) {
    await ctx.log(step.log)
    await ctx.reason(step.reason)
    await ctx.sleep(stepMs)
    const noise = hash(`${seed}:${index}`)
    await ctx.usage({ input: 1_400 + (noise % 2_600), output: 500 + (noise % 1_500) })
    await ctx.progress((index + 1) / steps.length)
  }
}

export class ScriptedRunner implements AgentRunner {
  async plan({ goal }: PlanInput, ctx: AgentRunContext): Promise<PlannedSubtask[]> {
    await runSteps(MANAGER_STEPS, goal.id, ctx, 900)
    // Sin modelo no hay criterio: el primero de la lista siempre releva, y se suman los
    // que comparten palabras con la consigna. Si no coincide nadie, entra el segundo.
    const goalWords = wordsOf(goal.description)
    const [first, ...rest] = WORKERS
    const matching = rest.filter(worker =>
      [...wordsOf(`${worker.whenToUse} ${worker.role} ${worker.name}`)].some(word => goalWords.has(word)),
    )
    const others = (matching.length > 0 ? matching : rest.slice(0, 1)).slice(0, MAX_SUBTASKS - 1)

    return [
      {
        key: first.id,
        title: 'Relevar lo necesario',
        description: `Juntar lo que haga falta para responder: "${goal.description}"`,
        capability: first.id,
        dependsOn: [],
      },
      ...others.map(worker => ({
        key: worker.id,
        title: `Aporte de ${worker.name}`,
        description: `Resolver la parte de ${worker.name.toLowerCase()} a partir de lo relevado.`,
        capability: worker.id,
        dependsOn: [first.id],
      })),
    ]
  }

  async work({ task, agent, context, revisionNote }: WorkInput, ctx: AgentRunContext): Promise<WorkResult> {
    if (revisionNote) await ctx.reason(`Pediste: "${revisionNote}". Reviso eso primero.`)
    await runSteps(STEPS[workerById(agent.id)?.room.style ?? 'biblioteca'], task.id, ctx)

    const lines = [
      `**${task.title}**, a cargo de ${agent.name}.`,
      '',
      'Salida simulada: acá iría el trabajo real del agente.',
    ]
    if (context.length > 0) lines.push('', `Partió de: ${context.map(c => c.title).join(', ')}.`)
    if (revisionNote) lines.push('', `Cambio pedido: ${revisionNote}`)
    return { output: lines.join('\n') }
  }

  async consolidate({ goal, results, revision, revisionNote }: ConsolidateInput, ctx: AgentRunContext): Promise<ConsolidatedDeliverable> {
    const steps: Step[] = [
      { log: 'Junto lo que entregó el equipo', reason: 'Controlo que cada subtarea responda al objetivo.' },
      { log: 'Busco contradicciones', reason: 'Si dos resultados chocan, tiene que quedar a la vista.' },
      { log: 'Redacto la entrega', reason: 'Vos decidís: te dejo lo necesario para aprobar o pedir cambios.' },
    ]
    await runSteps(steps, `${goal.id}:${revision}`, ctx, 1_000)

    const version = revision + 1
    const done = results.filter(r => !r.failed)
    const failed = results.filter(r => r.failed)
    const body = [
      '> **Entrega simulada.** La generó el motor Demo sin llamar a ningún modelo: ningún dato sale de una fuente real.',
      '',
      '## Objetivo',
      goal.description,
      '',
      '## Cómo se resolvió',
      ...done.map(r => `- **${r.title}**: ${r.agentName}`),
      ...(failed.length > 0
        ? ['', '## Lo que no se completó', ...failed.map(r => `- ${r.title} (${r.agentName})`)]
        : []),
      ...(revisionNote ? ['', '## Cambios de esta versión', revisionNote] : []),
      '',
      '## Qué traería con agentes reales',
      '- Hallazgos con su fuente.',
      '- Una propuesta con pasos concretos y su comprobación.',
    ].join('\n')

    return {
      title: goal.title,
      summary:
        failed.length > 0
          ? `Versión ${version}: ${done.length} de ${results.length} subtareas completas. Simulada.`
          : `Versión ${version}: ${results.length} subtareas consolidadas por ${DIRECTOR.name}. Simulada.`,
      body,
    }
  }
}
