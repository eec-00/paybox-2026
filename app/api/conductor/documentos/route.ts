import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CAMPOS_VENCIMIENTO, getDaysUntil } from '@/lib/automatizacion/campos'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'common', method: 'authenticate', args: [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  if (!data.result) throw new Error('Autenticación Odoo fallida')
  return data.result as number
}

async function odooCall<T = unknown>(
  uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, odoo_employee_id')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'conductor' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    if (!profile.odoo_employee_id) {
      return NextResponse.json({ documentos: [], stats: { vencidos: 0, proximos: 0, vigentes: 0 } })
    }

    const uid = await odooAuth()
    const studioFields = CAMPOS_VENCIMIENTO.map(c => c.key)

    const [empleado] = await odooCall<any[]>(
      uid, 'hr.employee', 'search_read',
      [[['id', '=', profile.odoo_employee_id]]],
      { fields: ['id', 'name', ...studioFields], limit: 1 }
    )

    if (!empleado) {
      return NextResponse.json({ error: 'Empleado no encontrado en Odoo' }, { status: 404 })
    }

    const documentos = CAMPOS_VENCIMIENTO.map(campo => {
      const valor = empleado[campo.key]
      const dias = getDaysUntil(valor)
      return { key: campo.key, label: campo.label, fecha: valor || null, dias }
    })

    // Sort: vencidos first, then by days ascending, then null at end
    documentos.sort((a, b) => {
      if (a.dias === null && b.dias === null) return 0
      if (a.dias === null) return 1
      if (b.dias === null) return -1
      return a.dias - b.dias
    })

    const stats = {
      vencidos: documentos.filter(d => d.dias !== null && d.dias < 0).length,
      proximos: documentos.filter(d => d.dias !== null && d.dias >= 0 && d.dias <= 30).length,
      vigentes: documentos.filter(d => d.dias !== null && d.dias > 30).length,
    }

    return NextResponse.json({ documentos, stats, empleadoNombre: empleado.name })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/documentos]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
