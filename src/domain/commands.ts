import { z } from 'zod'

// Todo lo que el humano puede pedir. Se valida en el borde del servidor: lo que
// entra por HTTP no se confía aunque lo mande nuestra propia pantalla.

const id = z.string().min(1).max(120)
const note = z.string().trim().min(1).max(2000)
const priority = z.enum(['low', 'normal', 'high'])

export const officeCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('submit_goal'),
    text: z.string().trim().min(8, 'Contá un poco más qué necesitás.').max(2000),
    priority,
  }),
  z.object({
    type: z.literal('assign_task'),
    agentId: id,
    title: z.string().trim().min(4, 'Ponele un título a la tarea.').max(160),
    description: z.string().trim().max(2000),
    priority,
  }),
  z.object({ type: z.literal('pause_agent'), agentId: id }),
  z.object({ type: z.literal('resume_agent'), agentId: id }),
  z.object({ type: z.literal('cancel_task'), taskId: id }),
  z.object({ type: z.literal('reassign_task'), taskId: id, agentId: id }),
  z.object({ type: z.literal('approve'), deliverableId: id }),
  z.object({ type: z.literal('reject'), deliverableId: id, note }),
  z.object({
    type: z.literal('request_changes'),
    deliverableId: id,
    note,
    agentId: id.nullable(),
  }),
  z.object({ type: z.literal('stop_all') }),
  z.object({ type: z.literal('reset') }),
])

export type OfficeCommand = z.infer<typeof officeCommandSchema>
