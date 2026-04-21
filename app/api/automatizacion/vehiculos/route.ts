import { NextRequest, NextResponse } from 'next/server'
import { getCamposForTipo } from '@/lib/automatizacion/campos'

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
  if (data.error || !data.result) throw new Error('Autenticación Odoo fallida')
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
  if (data.error) throw new Error(`Odoo ${model}.${method}: ${data.error.data?.message ?? data.error.message}`)
  return data.result as T
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') || 'tractos'
  const filtro = searchParams.get('filtro') || ''   // partial name match (ilike)

  const campos = getCamposForTipo(tipo)
  const studioFields = campos.map((c) => c.key)

  try {
    const uid = await odooAuth()

    // Dominio base: filtrar por categoría del vehículo
    const domain: any[] = filtro ? [['category_id.name', '=', filtro]] : []

    // Paso 1: obtener vehículos base
    const baseFields = ['id', 'name', 'license_plate']
    let vehiculos = await odooCall<any[]>(uid, 'fleet.vehicle', 'search_read', [domain], {
      fields: baseFields, limit: 500, order: 'name asc',
    })

    if (!vehiculos || vehiculos.length === 0) {
      return NextResponse.json({ vehiculos: [], debug: `Sin resultados con filtro="${filtro}"` })
    }

    // Paso 2: obtener campos x_studio_ por IDs
    const ids = vehiculos.map((v) => v.id)
    let studioData: any[] = []
    try {
      studioData = await odooCall<any[]>(uid, 'fleet.vehicle', 'search_read', [[['id', 'in', ids]]], {
        fields: ['id', ...studioFields], limit: 500,
      }) || []
    } catch {
      return NextResponse.json({
        vehiculos,
        advertencia: 'Campos de vencimiento no encontrados en esta instancia de Odoo',
      })
    }

    // Paso 3: combinar
    const studioMap = new Map(studioData.map((r) => [r.id, r]))
    vehiculos = vehiculos.map((v) => ({ ...v, ...(studioMap.get(v.id) || {}) }))

    return NextResponse.json({ vehiculos })
  } catch (error: any) {
    console.error('[automatizacion/vehiculos]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
