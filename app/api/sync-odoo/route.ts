import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Evitar conflicto con la clase global URL de Node — usar nombres más específicos
const ODOO_URL = (process.env.ODOO_URL || process.env.URL || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()
const ODOO_EXPENSE_AREA_FIELD = (process.env.ODOO_EXPENSE_AREA_FIELD || '').trim()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AxisMapping = {
  odooField: string
  model: string
  searchFields: string[]
}

// Mapeo de ejes dinámicos del formulario -> campos custom en hr.expense (Odoo)
const AXIS_MAPPINGS: Record<string, AxisMapping> = {
  servicio: {
    odooField: 'x_studio_operacin',
    model: 'sale.order',
    searchFields: ['name', 'client_order_ref', 'origin'],
  },
  placa: {
    odooField: 'x_studio_placa',
    model: 'fleet.vehicle',
    searchFields: ['license_plate', 'name'],
  },
  conductor: {
    odooField: 'x_studio_conductor',
    model: 'hr.employee',
    searchFields: ['name'],
  },
}

function normalizeAxisName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function getAxisValue(
  datosDinamicos: Record<string, unknown>,
  eje: string
): string {
  const direct = datosDinamicos[eje]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const normalizedEje = normalizeAxisName(eje)
  const matchedKey = Object.keys(datosDinamicos).find(
    (key) => normalizeAxisName(key) === normalizedEje
  )

  if (!matchedKey) return ''

  const value = datosDinamicos[matchedKey]
  return typeof value === 'string' ? value.trim() : ''
}

// ── Odoo autenticación via /jsonrpc (soporta API keys) ───────────────────────
// Este endpoint es el estándar de Odoo para integraciones externas
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

  const uid = data.result
  if (!uid) {
    throw new Error(
      `Autenticación Odoo fallida: credenciales incorrectas. DB="${ODOO_DB}" Email="${ODOO_EMAIL}"`
    )
  }

  return uid as number
}

// ── Odoo llamada via /jsonrpc (no necesita cookies, usa uid + api_key) ────────
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

// ── Name → ID cache ──────────────────────────────────────────────────────────
const resolveCache = new Map<string, number | string>()

async function resolveId(
  uid: number,
  model: string,
  name: string,
  field = 'name'
): Promise<number> {
  const key = `${model}::${name}`
  if (resolveCache.has(key)) return resolveCache.get(key) as number

  const results = await odooCall<{ id: number }[]>(
    uid,
    model,
    'search_read',
    [[[field, '=', name]]],
    { fields: ['id', 'name'], limit: 1 }
  )

  if (!results.length) throw new Error(`No encontrado en '${model}': "${name}"`)
  resolveCache.set(key, results[0].id)
  return results[0].id
}

async function resolveIdByCandidateFields(
  uid: number,
  model: string,
  value: string,
  fields: string[]
): Promise<number | null> {
  const cleanValue = value.trim()
  if (!cleanValue) return null

  for (const field of fields) {
    const exactKey = `${model}::${field}::exact::${cleanValue}`
    if (resolveCache.has(exactKey)) {
      return resolveCache.get(exactKey) as number | null
    }

    const exact = await odooCall<{ id: number }[]>(
      uid,
      model,
      'search_read',
      [[[field, '=', cleanValue]]],
      { fields: ['id', 'name'], limit: 1 }
    )

    if (exact.length) {
      resolveCache.set(exactKey, exact[0].id)
      return exact[0].id
    }
    resolveCache.set(exactKey, null)

    const ilikeKey = `${model}::${field}::ilike::${cleanValue}`
    if (resolveCache.has(ilikeKey)) {
      return resolveCache.get(ilikeKey) as number | null
    }

    const fuzzy = await odooCall<{ id: number }[]>(
      uid,
      model,
      'search_read',
      [[[field, 'ilike', cleanValue]]],
      { fields: ['id', 'name'], limit: 1 }
    )

    if (fuzzy.length) {
      resolveCache.set(ilikeKey, fuzzy[0].id)
      return fuzzy[0].id
    }
    resolveCache.set(ilikeKey, null)
  }

  return null
}

async function resolveAnalytic(uid: number, name: string): Promise<string | null> {
  const key = `analytic::${name}`
  if (resolveCache.has(key)) return resolveCache.get(key) as string | null

  const results = await odooCall<{ id: number }[]>(
    uid,
    'account.analytic.account',
    'search_read',
    [[['name', '=', name]]],
    { fields: ['id', 'name'], limit: 1 }
  )

  if (!results.length) {
    resolveCache.set(key, null as any)
    return null // No bloquear si no existe la cuenta analítica
  }
  const id = String(results[0].id)
  resolveCache.set(key, id)
  return id
}

// ── POST /api/sync-odoo ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { fechaDesde, fechaHasta } = await request.json()

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { error: 'Debe proporcionar fechaDesde y fechaHasta' },
        { status: 400 }
      )
    }

    // 1. Obtener registros del rango de fechas
    const { data: registros, error } = await supabase
      .from('registros')
      .select(`
        id,
        fecha_y_hora_pago,
        beneficiario,
        monto,
        moneda,
        descripcion,
        datos_dinamicos,
        creado_por,
        categoria:categoria_id (
          id,
          categoria_nombre,
          area,
          ejes_obligatorios
        )
      `)
      .gte('fecha_y_hora_pago', `${fechaDesde}T00:00:00`)
      .lte('fecha_y_hora_pago', `${fechaHasta}T23:59:59`)
      .order('fecha_y_hora_pago', { ascending: true })

    if (error) throw new Error(`Error consultando Supabase: ${error.message}`)

    if (!registros?.length) {
      return NextResponse.json({
        message: 'No hay registros en ese rango de fechas',
        total: 0,
        exitosos: 0,
        fallidos: 0,
        resultados: [],
      })
    }

    // 2. Obtener nombres de usuarios (empleado = quien subió el pago)
    const userIds = [...new Set(registros.map((r) => r.creado_por))]
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .in('id', userIds)

    const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) ?? [])

    // 3. Autenticar en Odoo (obtiene uid)
    const uid = await odooAuth()
    resolveCache.clear()

    // 4. Procesar cada registro
    const resultados: {
      id: number
      ok: boolean
      odooId?: number
      beneficiario: string
      error?: string
    }[] = []

    for (const registro of registros) {
      try {
        const empleadoNombre = profileMap.get(registro.creado_por) ?? ''
        const categoriaNombre = (registro.categoria as any)?.categoria_nombre ?? ''
        const categoriaArea = ((registro.categoria as any)?.area ?? '').trim()
        const ejesObligatorios = ((registro.categoria as any)?.ejes_obligatorios ?? []) as string[]
        const datosDinamicos = (registro.datos_dinamicos ?? {}) as Record<string, unknown>
        const fechaGasto = registro.fecha_y_hora_pago.split('T')[0]
        const analyticSource = categoriaArea || categoriaNombre

        if (!empleadoNombre) throw new Error('Empleado sin nombre en user_profiles')
        if (!categoriaNombre) throw new Error('Registro sin categoría')

        const [productId, empleadoId, analiticaId] = await Promise.all([
          resolveId(uid, 'product.product', categoriaNombre),
          resolveId(uid, 'hr.employee', empleadoNombre),
          resolveAnalytic(uid, analyticSource),
        ])

        const expenseData: Record<string, unknown> = {
          name: `${categoriaNombre} - ${registro.descripcion || registro.beneficiario}`,
          product_id: productId,
          total_amount_currency: registro.monto,
          employee_id: empleadoId,
          date: fechaGasto,
        }

        // Cuenta analítica opcional — solo se agrega si existe en Odoo
        if (analiticaId) {
          expenseData.analytic_distribution = { [analiticaId]: 100.0 }

          // Si se configuró un campo custom de Área en hr.expense, también lo poblamos.
          // Ejemplo: ODOO_EXPENSE_AREA_FIELD=x_studio_area
          if (ODOO_EXPENSE_AREA_FIELD) {
            expenseData[ODOO_EXPENSE_AREA_FIELD] = Number(analiticaId)
          }
        }

        // Ejes dinámicos por categoría -> campos custom many2one en Odoo
        for (const eje of ejesObligatorios) {
          const ejeKey = normalizeAxisName(eje)
          const mapping = AXIS_MAPPINGS[ejeKey]
          if (!mapping) continue

          const ejeValue = getAxisValue(datosDinamicos, eje)
          if (!ejeValue) continue

          const relatedId = await resolveIdByCandidateFields(
            uid,
            mapping.model,
            ejeValue,
            mapping.searchFields
          )

          if (!relatedId) {
            throw new Error(
              `No se encontró '${ejeValue}' para eje '${eje}' en modelo Odoo '${mapping.model}'`
            )
          }

          expenseData[mapping.odooField] = relatedId
        }

        const odooId = await odooCall<number>(uid, 'hr.expense', 'create', [expenseData])

        resultados.push({
          id: registro.id,
          ok: true,
          odooId,
          beneficiario: registro.beneficiario,
        })
      } catch (err: any) {
        resultados.push({
          id: registro.id,
          ok: false,
          beneficiario: registro.beneficiario,
          error: err.message,
        })
      }
    }

    // 5. Marcar exitosos como exportados
    const exitososIds = resultados.filter((r) => r.ok).map((r) => r.id)
    if (exitososIds.length > 0) {
      await supabase
        .from('registros')
        .update({
          exportado_a_odoo: true,
          fecha_exportacion: new Date().toISOString(),
          lote_exportacion_id: Date.now(),
        })
        .in('id', exitososIds)
    }

    return NextResponse.json({
      total: registros.length,
      exitosos: exitososIds.length,
      fallidos: resultados.filter((r) => !r.ok).length,
      resultados,
    })
  } catch (error: any) {
    console.error('Error en sync-odoo:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
