import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALL_HITO_FIELDS, TIPO_SERVICIO_BOOL_FIELDS } from '@/lib/servicios/hitos'
import { calcularProgreso } from '@/lib/servicios/progreso'

// ============================================================================
// Geoenlaces automáticos por servicio.
//
// Cada vez que se llama (manual desde el panel, o por un cron externo que le
// pegue a esta URL con el header x-cron-secret — ver proxy.ts):
// Ventana de un servicio con hora de cita C: desde C-3h hasta C+9h (12h de
// duración máxima desde que se abre). Una subtarea (devolución/retiro) usa
// la fecha/hora de su servicio padre.
//  1. CREA un geoenlace individual cuando entra en la ventana (faltan ≤3h) y
//     todavía no terminó su ventana. Si el conductor ya inició el servicio se
//     crea igual, sin importar la hora. Un servicio viejo cuya ventana ya
//     pasó y nunca se inició NO se crea. Dura hasta C+9h (o 12h desde ahora
//     si ya estaba iniciado fuera de ventana).
//  2. Si varios servicios comparten Referencia/Booking, crea ADEMÁS un
//     geoenlace "SERVICIO EN CONJUNTO" con todas sus placas: abre en la
//     apertura más temprana del grupo y dura hasta el fin de la ventana más
//     tardía. Se vincula a cada servicio del grupo.
//  3. CIERRA (borra en Navitel) cada geoenlace apenas todos los servicios que
//     lo usan quedan completados — para el "en conjunto" espera a que TODOS
//     los del grupo terminen; al que termina antes solo se le desvincula
//     (cerrado_at) sin cortarle el mapa a los demás.
//
// Los geoenlaces que un usuario crea manualmente (vista Servicios →
// Geoenlaces) son independientes y esta automatización nunca los toca ni los
// reutiliza — siempre crea los suyos propios.
// ============================================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

const NAVITEL_API_BASE = process.env.NAVITEL_API_BASE || 'https://control.navitelgps.com/api-v2'
const NAVITEL_CREDENTIALS = { login: process.env.NAVITEL_LOGIN || '', password: process.env.NAVITEL_PASSWORD || '' }

async function navitelAuth(): Promise<string> {
  const res = await fetch(`${NAVITEL_API_BASE}/user/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(NAVITEL_CREDENTIALS),
  })
  const data = await res.json()
  if (!data.success || data.type !== 'authenticated') throw new Error('Autenticación fallida con Navitel API')
  return data.hash
}

interface NavitelTracker { id: number; label: string; blocked: boolean }

async function navitelListTrackers(hash: string): Promise<NavitelTracker[]> {
  const res = await fetch(`${NAVITEL_API_BASE}/tracker/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  })
  const data = await res.json()
  if (!data.success) throw new Error('Error al listar vehículos en Navitel')
  return data.list.map((t: { id: number; label: string; source?: { blocked?: boolean } }) => ({
    id: t.id, label: t.label, blocked: t.source?.blocked ?? false,
  }))
}

/** El create de Navitel solo devuelve {success, value: <id numérico>} — no un
 * hash (ese solo aparece al listar los geoenlaces existentes). */
async function navitelCreateLink(hash: string, description: string, trackers: NavitelTracker[], endDate: Date): Promise<number> {
  const now = new Date()
  const res = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: null,
      lifetime: { from: now.toISOString(), to: endDate.toISOString() },
      description,
      trackers: trackers.map((t) => ({ alias: t.label, tracker_id: t.id, params: { object_data: [], sensor_ids: [], state_fields: [] } })),
      params: {
        bounding_zone_ids: [], bounding_mode: null, place_ids: [], zone_ids: [],
        display_options: { map: 'osm', autoscale: true, show_icons: true, show_driver_info: true, show_vehicle_info: true, trace_duration: null },
      },
      hash,
    }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error?.message || 'Error al crear geoenlace en Navitel')
  return data.value as number
}

async function navitelDeleteLink(hash: string, id: number) {
  const res = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, id }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error?.message || data.error || 'Error al borrar geoenlace en Navitel')
}

/** Deja solo letras/números en mayúscula, para comparar "AFQ-733" (Navitel)
 * contra "Freightliner/M2112/AFQ733" (Odoo) sin que el formato estorbe. */
function normalizePlaca(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
function extractPlacaCandidate(val: [number, string] | false | undefined): string {
  if (!val) return ''
  const name = val[1]
  if (!name) return ''
  return name.includes('/') ? name.split('/').pop() || name : name
}

interface OdooTaskRow {
  id: number
  name: string
  parent_id: [number, string] | false
  x_studio_fecha_de_la_programacin: string | false
  x_studio_hora_de_cita: number | false
  x_studio_placa: [number, string] | false
  x_studio_placa_carreta: [number, string] | false
  x_studio_referenciabooking: string | false
  [key: string]: unknown
}

const CANDIDATE_FIELDS = [
  'x_studio_fecha_de_la_programacin', 'x_studio_hora_de_cita',
  'x_studio_placa', 'x_studio_placa_carreta', 'x_studio_modalidad_de_devolucion',
  'x_studio_modalidad_de_retiro', 'x_studio_almacen_de_devolucion', 'x_studio_referenciabooking',
  ...TIPO_SERVICIO_BOOL_FIELDS, ...ALL_HITO_FIELDS,
]

const HORA_MS = 60 * 60 * 1000
const HORAS_ANTICIPACION = 3
const HORAS_DURACION_MAX = 12

/** Ventana del geoenlace de un servicio: se abre 3h antes de la hora de cita
 * y dura 12h desde ahí (o sea, hasta cita+9h). Una subtarea sin fecha propia
 * usa la de su servicio padre. null = sin fecha programada en ningún lado. */
function ventanaDe(task: OdooTaskRow, byId: Map<number, OdooTaskRow>): { inicio: number; fin: number } | null {
  const fuente = !task.x_studio_fecha_de_la_programacin && task.parent_id ? byId.get(task.parent_id[0]) ?? task : task
  const fecha = fuente.x_studio_fecha_de_la_programacin
  if (!fecha) return null
  const hora = typeof fuente.x_studio_hora_de_cita === 'number' ? fuente.x_studio_hora_de_cita : 0
  const horas = Math.floor(hora)
  const minutos = Math.round((hora - horas) * 60)
  // La hora de cita está cargada en hora de Perú (UTC-5, sin horario de verano), sin importar la zona del servidor.
  const cita = new Date(`${fecha}T${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:00-05:00`).getTime()
  const inicio = cita - HORAS_ANTICIPACION * HORA_MS
  return { inicio, fin: inicio + HORAS_DURACION_MAX * HORA_MS }
}

interface AutoLinkRow {
  row_id: number
  servicio_id: number
  servicio_nombre: string
  geolink_id: number
  geolink_hash: string | null
  placa: string | null
  es_conjunto: boolean
  referencia_booking: string | null
  cerrado_at: string | null
}

const MAX_CREACIONES_POR_CORRIDA = 60

async function guardarFila(row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('geoenlaces_automaticos').insert(row)
  if (error) throw new Error(`no se pudo guardar en geoenlaces_automaticos: ${error.message}`)
}

export async function POST() {
  const resultado = { creados: [] as string[], cerrados: [] as string[], omitidos: [] as string[], errores: [] as string[] }

  try {
    const uid = await odooAuth()

    const fieldsMeta = await odooCall<Record<string, unknown>>(
      uid, 'project.task', 'fields_get', [CANDIDATE_FIELDS], { attributes: ['type'] }
    )
    const validFields = Object.keys(fieldsMeta)
    const fields = ['id', 'name', 'parent_id', ...validFields]

    const projects = await odooCall<{ id: number }[]>(
      uid, 'project.project', 'search_read',
      [[['name', 'ilike', 'Servicio de Transporte']]], { fields: ['id'], limit: 1 }
    )
    if (!projects.length) throw new Error('Proyecto "Servicio de Transporte" no encontrado')

    const tasks = await odooCall<OdooTaskRow[]>(
      uid, 'project.task', 'search_read',
      [[['project_id', '=', projects[0].id]]], { fields, limit: 10000 }
    )

    const [{ data: progreso }, { data: completados }, { data: autoLinksRaw }] = await Promise.all([
      supabaseAdmin.from('conductor_servicios_progreso').select('servicio_id, step_actual'),
      supabaseAdmin.from('conductor_servicios_completados').select('servicio_id'),
      supabaseAdmin.from('geoenlaces_automaticos').select('*'),
    ])

    const progresoMap = new Map((progreso ?? []).map((p) => [p.servicio_id, p.step_actual]))
    const completadosSet = new Set((completados ?? []).map((c) => c.servicio_id))
    let autoLinks = (autoLinksRaw ?? []) as AutoLinkRow[]
    const taskById = new Map(tasks.map((t) => [t.id, t]))

    function estadoDe(task: OdooTaskRow) {
      return calcularProgreso(task, progresoMap, completadosSet).estado
    }

    // ── 0. Plan de geoenlace por tarea: cuándo abre y cuándo vence ─────────
    // - Terminada: sin plan.
    // - En proceso (el conductor ya inició): abre ya; vence al fin de su
    //   ventana, o 12h desde ahora si esa ventana ya pasó / no tiene fecha.
    // - Sin iniciar: abre 3h antes de la cita y dura 12h desde ahí; si esa
    //   ventana ya venció (servicio viejo que nunca se inició) o no tiene
    //   fecha programada, sin plan.
    const ahora = Date.now()
    const PERU_OFFSET_MS = 5 * HORA_MS
    const inicioAyer = Math.floor((ahora - PERU_OFFSET_MS) / (24 * HORA_MS)) * 24 * HORA_MS + PERU_OFFSET_MS - 24 * HORA_MS // 00:00 de ayer, hora Perú
    interface Plan { task: OdooTaskRow; inicio: number; fin: number }
    const planes: Plan[] = []
    for (const task of tasks) {
      const estado = estadoDe(task)
      if (estado === 'completado') continue
      const v = ventanaDe(task, taskById)
      if (estado === 'en_proceso') {
        // Solo cuenta si la cita es de ayer en adelante: hay servicios viejos
        // que quedaron a medias en la app y no están realmente en curso.
        if (!v || v.inicio + HORAS_ANTICIPACION * HORA_MS < inicioAyer) continue
        planes.push({ task, inicio: ahora, fin: v.fin > ahora ? v.fin : ahora + HORAS_DURACION_MAX * HORA_MS })
      } else if (v && ahora < v.fin) {
        planes.push({ task, inicio: v.inicio, fin: v.fin })
      }
    }

    const hash = await navitelAuth()

    // Si alguien borró a mano un geoenlace automático en Navitel, su fila ya no
    // vale: se descarta para que ese servicio pueda volver a crearse.
    const linksVivosRes = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    })
    const linksVivos = await linksVivosRes.json()
    if (!linksVivos.success) throw new Error('Error al listar geoenlaces en Navitel')
    const idsVivos = new Set<number>((linksVivos.list as { id: number }[]).map((l) => l.id))
    const huerfanas = autoLinks.filter((l) => !l.cerrado_at && !idsVivos.has(l.geolink_id))
    if (huerfanas.length > 0) {
      const { error } = await supabaseAdmin.from('geoenlaces_automaticos').delete().in('row_id', huerfanas.map((l) => l.row_id))
      if (error) throw new Error(`no se pudieron limpiar filas huérfanas: ${error.message}`)
      autoLinks = autoLinks.filter((l) => !huerfanas.includes(l))
    }
    const trackersRaw = await navitelListTrackers(hash)

    // Puede haber más de un tracker de Navitel con la misma placa (unidad
    // reemplazada/duplicada sin dar de baja la anterior) — nos quedamos con
    // el que no esté bloqueado; si ambos están igual, con el primero.
    const trackerByPlaca = new Map<string, NavitelTracker>()
    for (const t of trackersRaw) {
      const key = normalizePlaca(t.label)
      const existing = trackerByPlaca.get(key)
      if (!existing) { trackerByPlaca.set(key, t); continue }
      if (existing.blocked && !t.blocked) trackerByPlaca.set(key, t)
    }

    function matchTracker(task: OdooTaskRow): NavitelTracker | null {
      const placaCamion = normalizePlaca(extractPlacaCandidate(task.x_studio_placa))
      const placaCarreta = normalizePlaca(extractPlacaCandidate(task.x_studio_placa_carreta))
      return trackerByPlaca.get(placaCamion) || trackerByPlaca.get(placaCarreta) || null
    }

    // ── 1. Geoenlace individual por servicio ───────────────────────────────
    const individualExistente = new Set(
      autoLinks.filter((l) => !l.es_conjunto).map((l) => l.servicio_id)
    )

    // Freno de seguridad: en un día normal son decenas, no cientos. Si sale
    // mucho más, algo está mal con las reglas — mejor no crear nada.
    const porCrear = planes.filter((p) => p.inicio <= ahora && !individualExistente.has(p.task.id)).length
    if (porCrear > MAX_CREACIONES_POR_CORRIDA) {
      throw new Error(`Se iban a crear ${porCrear} geoenlaces (tope ${MAX_CREACIONES_POR_CORRIDA}). No se creó ninguno; revisar las reglas.`)
    }

    for (const { task, inicio, fin } of planes) {
      if (inicio > ahora) continue // todavía no entra en la ventana de 3h
      if (individualExistente.has(task.id)) continue
      const tracker = matchTracker(task)
      if (!tracker) {
        const placaCamion = extractPlacaCandidate(task.x_studio_placa)
        const placaCarreta = extractPlacaCandidate(task.x_studio_placa_carreta)
        if (placaCamion || placaCarreta) resultado.omitidos.push(`${task.name}: sin match GPS para la placa`)
        continue
      }
      try {
        const geolinkId = await navitelCreateLink(hash, `Auto — ${task.name}`, [tracker], new Date(fin))
        try {
          await guardarFila({
            servicio_id: task.id,
            servicio_nombre: task.name,
            geolink_id: geolinkId,
            placa: tracker.label,
            es_conjunto: false,
            referencia_booking: task.x_studio_referenciabooking || null,
          })
        } catch (err) {
          await navitelDeleteLink(hash, geolinkId).catch(() => {}) // sin fila no habría forma de cerrarlo después
          throw err
        }
        resultado.creados.push(`${task.name} (${tracker.label})`)
      } catch (err) {
        resultado.errores.push(`${task.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // ── 2. Geoenlace "SERVICIO EN CONJUNTO" por Referencia/Booking ─────────
    // Se agrupan TODOS los servicios con plan (aunque alguno todavía no abra
    // su ventana): el conjunto abre con la apertura más temprana del grupo y
    // dura hasta el fin de la ventana más tardía.
    const gruposPorBooking = new Map<string, Plan[]>()
    for (const plan of planes) {
      const booking = plan.task.x_studio_referenciabooking
      if (!booking) continue
      if (!gruposPorBooking.has(booking)) gruposPorBooking.set(booking, [])
      gruposPorBooking.get(booking)!.push(plan)
    }

    const conjuntoExistentePorServicio = new Set(
      autoLinks.filter((l) => l.es_conjunto).map((l) => l.servicio_id)
    )

    for (const [booking, planesGrupo] of gruposPorBooking) {
      if (planesGrupo.length < 2) continue // solo un servicio con ese booking, no hay nada que agrupar
      if (Math.min(...planesGrupo.map((p) => p.inicio)) > ahora) continue // ningún miembro abrió su ventana aún

      const grupo = planesGrupo.map((p) => p.task)
      const finGrupo = Math.max(...planesGrupo.map((p) => p.fin))
      const miembrosSinFila = grupo.filter((t) => !conjuntoExistentePorServicio.has(t.id))
      if (miembrosSinFila.length === 0) continue // todos ya tienen su fila "en conjunto"

      // ¿Ya existe un geoenlace de conjunto abierto para este booking? (creado
      // en una corrida anterior, o recién en esta misma por otro miembro)
      const filaExistente = autoLinks.find((l) => l.es_conjunto && l.referencia_booking === booking && !l.cerrado_at)

      let geolinkId: number
      if (filaExistente) {
        geolinkId = filaExistente.geolink_id
      } else {
        const trackers = Array.from(
          new Map(
            grupo.map((t) => matchTracker(t)).filter((t): t is NavitelTracker => t !== null).map((t) => [t.id, t])
          ).values()
        )
        if (trackers.length === 0) {
          resultado.omitidos.push(`Booking ${booking}: sin match GPS en ningún servicio del grupo, no se crea geoenlace en conjunto`)
          continue
        }
        try {
          geolinkId = await navitelCreateLink(hash, `SERVICIO EN CONJUNTO — ${booking}`, trackers, new Date(finGrupo))
          resultado.creados.push(`SERVICIO EN CONJUNTO — ${booking} (${trackers.map((t) => t.label).join(', ')})`)
        } catch (err) {
          resultado.errores.push(`Booking ${booking} (conjunto): ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
      }

      for (const task of miembrosSinFila) {
        try {
          await guardarFila({
            servicio_id: task.id,
            servicio_nombre: task.name,
            geolink_id: geolinkId,
            placa: null,
            es_conjunto: true,
            referencia_booking: booking,
          })
        } catch (err) {
          resultado.errores.push(`${task.name}: no se pudo vincular al geoenlace en conjunto — ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // ── 3. Cerrar geoenlaces cuyos servicios ya terminaron ──────────────────
    // Se agrupa por geolink_id porque uno "en conjunto" lo comparten varios
    // servicios: solo se borra en Navitel cuando TODOS los que lo usan
    // terminaron. Al que termina antes que los demás solo se le desvincula
    // (cerrado_at) sin tocarle el mapa a los que siguen en curso.
    const abiertos = autoLinks.filter((l) => !l.cerrado_at)
    const porGeolinkId = new Map<number, AutoLinkRow[]>()
    for (const l of abiertos) {
      if (!porGeolinkId.has(l.geolink_id)) porGeolinkId.set(l.geolink_id, [])
      porGeolinkId.get(l.geolink_id)!.push(l)
    }

    for (const [geolinkId, filas] of porGeolinkId) {
      const terminadas = filas.filter((f) => {
        const task = taskById.get(f.servicio_id)
        return !task || estadoDe(task) === 'completado'
      })
      if (terminadas.length === 0) continue

      const todasTerminadas = terminadas.length === filas.length
      if (todasTerminadas) {
        try {
          await navitelDeleteLink(hash, geolinkId)
        } catch (err) {
          resultado.errores.push(`Cierre geolink ${geolinkId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      for (const fila of terminadas) {
        await supabaseAdmin.from('geoenlaces_automaticos').update({ cerrado_at: new Date().toISOString() }).eq('row_id', fila.row_id)
        resultado.cerrados.push(fila.servicio_nombre)
      }
    }

    return NextResponse.json({ success: true, ...resultado })
  } catch (error) {
    console.error('[geoenlaces-auto]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido', ...resultado },
      { status: 500 }
    )
  }
}
