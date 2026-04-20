import { NextResponse } from 'next/server'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL || '').trim().replace(/\/$/, '')
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
  if (!data.result) throw new Error('Auth fallida')
  return data.result as number
}

async function odooCall<T>(uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
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
    const uid = await odooAuth()

    // 1. Buscar por etiqueta (field_description) en hr.employee
    const byLabel = await odooCall<any[]>(uid, 'ir.model.fields', 'search_read',
      [[['model', '=', 'hr.employee'], ['field_description', 'ilike', 'vence']]],
      { fields: ['name', 'field_description', 'ttype'], order: 'name asc', limit: 100 }
    )

    // 2. Todos los campos date/datetime de hr.employee (sin filtrar por nombre)
    const allDateFields = await odooCall<any[]>(uid, 'ir.model.fields', 'search_read',
      [[['model', '=', 'hr.employee'], ['ttype', 'in', ['date', 'datetime']]]],
      { fields: ['name', 'field_description', 'ttype'], order: 'name asc', limit: 200 }
    )

    // 3. Leer employee 77 con el campo confirmado en screenshot: x_studio_licencia_vence
    let readTest: any = null
    try {
      const r = await odooCall<any[]>(uid, 'hr.employee', 'read',
        [[77], ['name', 'x_studio_licencia_vence', 'x_studio_dni_vence', 'x_studio_sctr', 'x_studio_ransa']]
      )
      readTest = { ok: true, data: r?.[0] }
    } catch (e: any) {
      readTest = { ok: false, error: e.message }
    }

    // 4. ¿Qué URL/DB estamos usando?
    const instanceInfo = { ODOO_URL, ODOO_DB }

    return NextResponse.json({ instanceInfo, byLabel, allDateFields, readTest })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
