import { odooCall } from '@/lib/odoo'

/** Etapa "Servicio Finalizado" del proyecto al que pertenece la tarea. Se
 * busca dentro de ese proyecto: buscando por nombre en todo Odoo, otro
 * proyecto con una etapa homónima podía devolver la etapa equivocada. */
export async function etapaFinalizadoDe(uid: number, taskId: number): Promise<{ id: number; name: string } | null> {
  const [task] = await odooCall<{ project_id: [number, string] | false }[]>(
    uid, 'project.task', 'read', [[taskId]], { fields: ['project_id'] }
  )
  if (!task?.project_id) return null
  const [stage] = await odooCall<{ id: number; name: string }[]>(
    uid, 'project.task.type', 'search_read',
    [[['name', '=ilike', 'servicio finalizado'], ['project_ids', 'in', [task.project_id[0]]]]],
    { fields: ['id', 'name'], limit: 1 }
  )
  return stage ?? null
}
