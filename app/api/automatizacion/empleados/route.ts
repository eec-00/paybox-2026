import { NextRequest, NextResponse } from 'next/server'
import { CAMPOS_VENCIMIENTO } from '@/lib/automatizacion/campos'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}],
      },
    }),
  })
  const data = await res.json()
  if (data.error) {
    const msg = data.error.data?.message ?? data.error.message
    throw new Error(`Autenticación Odoo fallida: ${msg}`)
  }
  if (!data.result) throw new Error('Autenticación Odoo fallida: credenciales incorrectas')
  return data.result as number
}

async function odooCall<T>(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
      },
    }),
  })
  const data = await res.json()
  if (data.error) {
    const msg = data.error.data?.message ?? data.error.message
    throw new Error(`Odoo ${model}.${method}: ${msg}`)
  }
  return data.result as T
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const jobTitle = searchParams.get('job_title') || 'Conductor'

  try {
    const uid = await odooAuth()

    // Paso 1: obtener todos los empleados con el job_title indicado (igual que odoo-axis-options)
    const baseFields = ['id', 'name', 'work_email', 'job_title']
    const empleadosBase = await odooCall<any[]>(
      uid,
      'hr.employee',
      'search_read',
      [[['job_title', '=', jobTitle]]],
      { fields: baseFields, limit: 500, order: 'name asc' }
    )

    if (!empleadosBase || empleadosBase.length === 0) {
      // Fallback: búsqueda parcial por si el valor tiene variaciones
      const parcial = await odooCall<any[]>(
        uid,
        'hr.employee',
        'search_read',
        [[['job_title', 'ilike', jobTitle]]],
        { fields: baseFields, limit: 500, order: 'name asc' }
      )
      if (!parcial || parcial.length === 0) {
        return NextResponse.json({ empleados: [], debug: `Sin resultados para job_title="${jobTitle}"` })
      }
      // continuar con resultados parciales
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
