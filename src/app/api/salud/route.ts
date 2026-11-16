import { connection } from 'next/server'
import { setupProblem } from '@/server/access'
import { getRuntime } from '@/server/runtime'

// Dice qué falta para abrir. Railway la mira al publicar un deploy, pero ya dejó pasar uno
// con esta ruta en 503: lo que frena de verdad es que, sin esto, nadie puede entrar.
export async function GET() {
  await connection()
  const problem = setupProblem()
  if (problem) {
    console.error(`[oficina] no puede abrir: ${problem}`)
    return Response.json({ ok: false, problem }, { status: 503 })
  }
  getRuntime() // arranca sin esperar la primera visita: recupera lo que esperaba tu revisión
  return Response.json({ ok: true })
}
