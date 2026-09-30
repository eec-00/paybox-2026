import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Datos del servicio que Finanzas > Gastos de Conductores muestra junto a cada
// gasto (placa, contenedor, nº de guía). gastos_conductor solo guarda el id
// de la tarea de Odoo, así que se resuelven acá en un solo lote.

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
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
    cache: 'no-store',
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

const CANDIDATE_FIELDS = [
  'parent_id',
  'x_studio_placa',
  'x_studio_nmero_de_contenedor',
  'x_studio_gua_de_remisin_transportista_filename',
  'x_studio_gua_de_remisin_remitente_filename',
]

// "Kenworth/T800/B9B720" → "B9B720"
function placaDe(ref: unknown): string | null {
  if (!Array.isArray(ref) || typeof ref[1] !== 'string') return null
  const partes = ref[1].split('/')
  return partes[partes.length - 1].trim() || null
}

// En Odoo la guía es un PDF adjunto, no un número; el número va en el nombre
// del archivo: "20523380347-31-EG03-8686.pdf", "GRE_TRANSPORTISTA_20523380347-G010-3198.pdf",
// "V001-9325.pdf" → serie-correlativo.
function guiaDe(filename: unknown): string | null {
  if (typeof filename !== 'string' || !filename) return null
  const base = filename.replace(/\.[a-z0-9]+$/i, '')
  const m = base.match(/([A-Z][A-Z0-9]{3})-(\d{1,8})$/i)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : base
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role === 'conductor') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const ids = Array.from(new Set(
      (request.nextUrl.searchParams.get('ids') || '')
        .split(',')
        .map(s => parseInt(s))
        .filter(n => Number.isInteger(n) && n > 0)
    ))
    if (ids.length === 0) return NextResponse.json({ servicios: {} })

    const uid = await odooAuth()
    const meta = await odooCall<Record<string, unknown>>(
      uid, 'project.task', 'fields_get', [CANDIDATE_FIELDS], { attributes: ['type'] }
    )
    const fields = CANDIDATE_FIELDS.filter(f => f in meta)

    const tasks = await odooCall<Record<string, any>[]>(uid, 'project.task', 'read', [ids], { fields })

    // Subtareas (devolución/retiro de vacío) nacen sin contenedor: se toma el
    // del servicio padre, igual que en /api/servicios.
    const parentIds = Array.from(new Set(
      tasks
        .filter(t => !t.x_studio_nmero_de_contenedor && Array.isArray(t.parent_id))
        .map(t => t.parent_id[0] as number)
    ))
    const parentById = new Map<number, Record<string, any>>()
    if (parentIds.length > 0 && fields.includes('x_studio_nmero_de_contenedor')) {
      const parents = await odooCall<Record<string, any>[]>(
        uid, 'project.task', 'read', [parentIds], { fields: ['x_studio_nmero_de_contenedor'] }
      )
      for (const p of parents) parentById.set(p.id, p)
    }

    const servicios: Record<number, { placa: string | null; contenedor: string | null; guia: string | null }> = {}
    for (const t of tasks) {
      const parent = Array.isArray(t.parent_id) ? parentById.get(t.parent_id[0]) : undefined
      servicios[t.id] = {
        placa: placaDe(t.x_studio_placa),
        contenedor: t.x_studio_nmero_de_contenedor || parent?.x_studio_nmero_de_contenedor || null,
        guia: guiaDe(t.x_studio_gua_de_remisin_transportista_filename) ?? guiaDe(t.x_studio_gua_de_remisin_remitente_filename),
      }
    }

    return NextResponse.json({ servicios })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error en /api/servicios/datos-gasto:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
