import { NextRequest, NextResponse } from 'next/server'
import { CAMPOS_VENCIMIENTO } from '@/lib/automatizacion/campos'



import { odooAuth, odooCall } from '@/lib/odoo'
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const jobTitleParam = searchParams.get('job_title') || 'Conductor'
  // Soporta múltiples puestos separados por coma, ej: "Conductor, Director Ejecutivo"
  const titles = jobTitleParam.split(',').map((t) => t.trim()).filter(Boolean)

  try {
    const uid = await odooAuth()

    // Paso 1: obtener todos los empleados con cualquiera de los job_title indicados
    const baseFields = ['id', 'name', 'work_email', 'job_title']
    const empleadosBase = await odooCall<any[]>(
      uid,
      'hr.employee',
      'search_read',
      [[['job_title', 'in', titles]]],
      { fields: baseFields, limit: 500, order: 'name asc' }
    )

    if (!empleadosBase || empleadosBase.length === 0) {
      // Fallback: búsqueda parcial por el primer puesto
      const parcial = await odooCall<any[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['job_title', 'ilike', titles[0]]]],
        { fields: baseFields, limit: 500, order: 'name asc' }
      )
      if (!parcial || parcial.length === 0) {
        return NextResponse.json({ empleados: [], debug: `Sin resultados para job_title in [${titles.join(', ')}]` })
      }
      return NextResponse.json({ empleados: parcial })
    }

    // Paso 2: obtener los campos x_studio_ para esos empleados
    const ids = empleadosBase.map((e) => e.id)
    const studioFields = CAMPOS_VENCIMIENTO.map((c) => c.key)

    let studioData: any[] = []
    try {
      studioData = await odooCall<any[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['id', 'in', ids]]],
        { fields: ['id', ...studioFields], limit: 500 }
      )
    } catch (fieldErr: any) {
      // Si algún campo x_studio_ no existe en esta instancia, devuelve sin esos datos
      console.warn('[automatizacion/empleados] campos x_studio no disponibles:', fieldErr.message)
      return NextResponse.json({
        empleados: empleadosBase,
        advertencia: 'Campos de vencimiento no encontrados en esta instancia de Odoo',
      })
    }

    // Paso 3: combinar datos base + x_studio_ por id
    const studioMap = new Map(studioData.map((r) => [r.id, r]))
    const empleados = empleadosBase.map((emp) => ({
      ...emp,
      ...(studioMap.get(emp.id) || {}),
    }))

    return NextResponse.json({ empleados })
  } catch (error: any) {
    console.error('[automatizacion/empleados]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
