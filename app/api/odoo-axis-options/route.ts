import { NextRequest, NextResponse } from 'next/server'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

type AxisKey = 'servicio' | 'placa' | 'conductor'

type AxisConfig = {
  model: string
  searchFields: string[]
  readFields: string[]
}

type Option = {
  value: string
  label: string
}

type OptionsCacheEntry = {
  expiresAt: number
  options: Option[]
}

const AUTH_CACHE_TTL_MS = 15 * 60 * 1000
const OPTIONS_CACHE_TTL_MS = 60 * 1000

let authCache: { uid: number; expiresAt: number } | null = null
let authInFlight: Promise<number> | null = null
const optionsCache = new Map<string, OptionsCacheEntry>()
const optionsInFlight = new Map<string, Promise<Option[]>>()

const AXIS_CONFIG: Record<AxisKey, AxisConfig> = {
  servicio: {
    model: 'sale.order',
    searchFields: ['name', 'client_order_ref', 'origin'],
    readFields: ['id', 'name', 'client_order_ref', 'origin'],
  },
  placa: {
    model: 'fleet.vehicle',
    searchFields: ['license_plate', 'name'],
    readFields: ['id', 'license_plate', 'name'],
  },
  conductor: {
    model: 'hr.employee',
    searchFields: ['name'],
    readFields: ['id', 'name'],
  },
}

function normalizeAxis(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function toAxisKey(value: string): AxisKey | null {
  const normalized = normalizeAxis(value)
  if (normalized === 'servicio') return 'servicio'
  if (normalized === 'placa') return 'placa'
  if (normalized === 'conductor') return 'conductor'
  return null
}

function buildOrDomain(fields: string[], q: string): unknown[] {
  if (fields.length === 1) return [[fields[0], 'ilike', q]]

  const parts: unknown[] = []
  for (let i = 0; i < fields.length - 1; i++) parts.push('|')
  for (const field of fields) parts.push([field, 'ilike', q])
  return parts
}

async function odooAuth(): Promise<number> {
  const now = Date.now()

  if (authCache && authCache.expiresAt > now) {
    return authCache.uid
  }

  if (authInFlight) {
    return authInFlight
  }

  authInFlight = (async () => {
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
    throw new Error(`Autenticacion Odoo fallida: ${msg}`)
  }

  const uid = data.result
  if (!uid) throw new Error('Autenticacion Odoo fallida: credenciales incorrectas')

    const parsedUid = uid as number
    authCache = {
      uid: parsedUid,
      expiresAt: now + AUTH_CACHE_TTL_MS,
    }

    return parsedUid
  })()

  try {
    return await authInFlight
  } finally {
    authInFlight = null
  }
}

async function odooCall<T = unknown>(
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

function buildOption(axis: AxisKey, row: Record<string, unknown>) {
  if (axis === 'servicio') {
    const name = String(row.name || '').trim()
    const ref = String(row.client_order_ref || '').trim()
    const origin = String(row.origin || '').trim()
    const label = [name, ref, origin].filter(Boolean).join(' · ')
    const value = name || ref || origin
    return value ? { value, label: label || value } : null
  }

  if (axis === 'placa') {
    const plate = String(row.license_plate || '').trim()
    const name = String(row.name || '').trim()
    const value = plate || name
    const label = plate && name && plate !== name ? `${plate} · ${name}` : value
    return value ? { value, label } : null
  }

  const name = String(row.name || '').trim()
  return name ? { value: name, label: name } : null
}

function buildCacheKey(axis: AxisKey, query: string, limit: number): string {
  return `${axis}::${query.toLowerCase()}::${limit}`
}

function getCachedOptions(cacheKey: string): Option[] | null {
  const cached = optionsCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    optionsCache.delete(cacheKey)
    return null
  }

  return cached.options
}

function saveCachedOptions(cacheKey: string, options: Option[]): void {
  optionsCache.set(cacheKey, {
    options,
    expiresAt: Date.now() + OPTIONS_CACHE_TTL_MS,
  })

  if (optionsCache.size > 250) {
    const oldestKey = optionsCache.keys().next().value as string | undefined
    if (oldestKey) optionsCache.delete(oldestKey)
  }
}

async function fetchOptions(axis: AxisKey, query: string, limit: number): Promise<Option[]> {
  const cacheKey = buildCacheKey(axis, query, limit)
  const cached = getCachedOptions(cacheKey)
  if (cached) return cached

  const running = optionsInFlight.get(cacheKey)
  if (running) return running

  const task = (async () => {
    const config = AXIS_CONFIG[axis]
    const uid = await odooAuth()
    const domain = query ? buildOrDomain(config.searchFields, query) : []

    const rows = await odooCall<Record<string, unknown>[]>(
      uid,
      config.model,
      'search_read',
      [domain],
      {
        fields: config.readFields,
        limit,
        order: 'id desc',
      }
    )

    const unique = new Set<string>()
    const options = rows
      .map((row) => buildOption(axis, row))
      .filter((opt): opt is Option => !!opt)
      .filter((opt) => {
        const key = opt.value.toLowerCase()
        if (unique.has(key)) return false
        unique.add(key)
        return true
      })

    saveCachedOptions(cacheKey, options)
    return options
  })()

  optionsInFlight.set(cacheKey, task)

  try {
    return await task
  } finally {
    optionsInFlight.delete(cacheKey)
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!ODOO_URL || !ODOO_DB || !ODOO_EMAIL || !ODOO_API_KEY) {
      return NextResponse.json({ error: 'Variables de Odoo no configuradas' }, { status: 500 })
    }

    const axisParam = request.nextUrl.searchParams.get('axis') || ''
    const axis = toAxisKey(axisParam)
    if (!axis) {
      return NextResponse.json({ error: 'axis invalido. Use: servicio, placa o conductor' }, { status: 400 })
    }

    const q = (request.nextUrl.searchParams.get('q') || '').trim()
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 20)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 40) : 20

    const options = await fetchOptions(axis, q, limit)

    return NextResponse.json(
      { options },
      {
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error consultando Odoo' }, { status: 500 })
  }
}
