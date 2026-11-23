import { odooAuth, odooCall } from '@/lib/odoo'

/**
 * Nombre real en Odoo del servicio, solo si está asignado al conductor (mismo
 * criterio que su lista en /api/conductor/servicios). null si no es suyo.
 */
export async function nombreServicioAsignado(
  servicioId: number,
  employeeId: number | null,
  employeeName: string,
): Promise<string | null> {
  if (!employeeId && !employeeName) return null
  const uid = await odooAuth()
  const fieldsMeta = await odooCall<Record<string, { type: string }>>(
    uid, 'project.task', 'fields_get', [['x_studio_conductor']], { attributes: ['type'] }
  )
  const conductorFilter =
    fieldsMeta['x_studio_conductor']?.type === 'many2one' && employeeId
      ? ['x_studio_conductor', '=', employeeId]
      : ['x_studio_conductor', 'ilike', employeeName]

  const tasks = await odooCall<{ name: string }[]>(
    uid, 'project.task', 'search_read',
    [[['id', '=', servicioId], conductorFilter]],
    { fields: ['name'], limit: 1 }
  )
  return tasks[0]?.name ?? null
}
