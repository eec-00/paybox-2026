import { NextRequest, NextResponse } from 'next/server'

const NAVITEL_API_BASE = process.env.NAVITEL_API_BASE || 'https://control.navitelgps.com/api-v2'
const NAVITEL_CREDENTIALS = {
  login: process.env.NAVITEL_LOGIN || '',
  password: process.env.NAVITEL_PASSWORD || '',
}

let cachedHash: string | null = null
let hashExpiry: number = 0

async function getAuthHash(): Promise<string> {
  if (cachedHash && Date.now() < hashExpiry) return cachedHash

  const authResponse = await fetch(`${NAVITEL_API_BASE}/user/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(NAVITEL_CREDENTIALS),
  })

  if (!authResponse.ok) throw new Error('Error al autenticarse con Navitel API')

  const authData = await authResponse.json()
  if (!authData.success || authData.type !== 'authenticated') {
    throw new Error('Autenticación fallida con Navitel API')
  }

  cachedHash = authData.hash
  hashExpiry = Date.now() + 30 * 60 * 1000
  return authData.hash
}

function toNavitelTime(rawTime: unknown): string | null {
  if (!rawTime || typeof rawTime !== 'string') return null
  const d = new Date(rawTime)
  if (isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

async function fetchEvents(
  hash: string,
  trackerId: number,
  fromDate: string,
  toDate: string,
  type: string,
): Promise<any[]> {
  try {
    const res = await fetch(`${NAVITEL_API_BASE}/history/tracker/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, tracker_id: trackerId, from: fromDate, to: toDate, type }),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!data.success) {
      cachedHash = null
      hashExpiry = 0
      return []
    }
    return data.list || []
  } catch {
    return []
  }
}

function getEventTime(e: any): number {
  const raw = e.time ?? e.date ?? e.event_time ?? e.registered
  if (!raw) return 0
  const d = new Date(raw)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

function findEventForZone(events: any[], zoneId: number, trackerId: number): any | null {
  const matching = events.filter((e) => {
    // El API de Navitel devuelve eventos de TODOS los trackers aunque se pase tracker_id.
    // Filtramos manualmente por tracker.
    const eTracker = e.tracker_id ?? e.object_id ?? e.device_id
    if (eTracker !== undefined && Number(eTracker) !== trackerId) return false

    // Filtrar por zona
    return (
      e.extra?.zone_ids?.includes(zoneId) ||
      e.zone_id === zoneId ||
      e.zone?.id === zoneId
    )
  })
  if (matching.length === 0) return null

  // Retornar el PRIMERO (llegada más temprana después de from_date)
  matching.sort((a, b) => getEventTime(a) - getEventTime(b))
  return matching[0]
}

/**
 * POST /api/navitel/check-arrivals
 *
 * Verifica múltiples geocercas para un tracker en un rango de fechas.
 *
 * Body:
 *   tracker_id  number   - ID del rastreador Navitel (requerido)
 *   from_date   string   - Fecha inicio "YYYY-MM-DD" o "YYYY-MM-DD HH:MM:SS"
 *   geocercas   Array    - Lista de geocercas a verificar:
 *                          { id: string, zone_id: number, event_type: 'zone_in' | 'zone_out' }
 *
 * Response:
 *   { success, results: [{ id, zone_id, arrived, time }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tracker_id, from_date, geocercas } = body

    if (!tracker_id || !Array.isArray(geocercas) || geocercas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere tracker_id y geocercas[]' },
        { status: 400 },
      )
    }

    const hash = await getAuthHash()
    const now = new Date()
    const toDate = now.toISOString().replace('T', ' ').slice(0, 19)

    // Navitel filtra en UTC — mandar el timestamp tal cual sin conversión.
    // created_at de Supabase ya viene en UTC, solo reformateamos a "YYYY-MM-DD HH:MM:SS".
    let fromDate: string
    if (from_date) {
      if (from_date.length === 10) {
        // Solo fecha YYYY-MM-DD → inicio del día UTC
        fromDate = `${from_date} 00:00:00`
      } else {
        // ISO timestamp (created_at UTC) → reformatear para Navitel
        fromDate = new Date(from_date).toISOString().replace('T', ' ').slice(0, 19)
      }
    } else {
      // Sin fecha: usar inicio del día UTC actual
      const dayStart = new Date(now)
      dayStart.setUTCHours(0, 0, 0, 0)
      fromDate = dayStart.toISOString().replace('T', ' ').slice(0, 19)
    }

    const trackerId = Number(tracker_id)
    const needsZoneIn  = geocercas.some((g: any) => g.event_type !== 'zone_out')
    const needsZoneOut = geocercas.some((g: any) => g.event_type === 'zone_out')

    // Llamar Navitel una vez por tipo de evento — dos tipos como máximo
    const [inzoneEvts, outzoneEvts] = await Promise.all([
      needsZoneIn
        ? fetchEvents(hash, trackerId, fromDate, toDate, 'zone_in').then(async (evts) => {
            // Fallback: algunos servidores Navitel usan 'inzone'
            if (evts.length === 0) return fetchEvents(hash, trackerId, fromDate, toDate, 'inzone')
            return evts
          })
        : Promise.resolve([]),
      needsZoneOut
        ? fetchEvents(hash, trackerId, fromDate, toDate, 'zone_out').then(async (evts) => {
            if (evts.length === 0) return fetchEvents(hash, trackerId, fromDate, toDate, 'outzone')
            return evts
          })
        : Promise.resolve([]),
    ])

    const results = geocercas.map((g: any) => {
      const pool  = g.event_type === 'zone_out' ? outzoneEvts : inzoneEvts
      const event = findEventForZone(pool, Number(g.zone_id), trackerId)

      const rawTime = event
        ? (event.time ?? event.date ?? event.event_time ?? event.registered)
        : null

      return {
        id:      g.id,
        zone_id: g.zone_id,
        arrived: !!event,
        time:    toNavitelTime(rawTime),
        raw_time: rawTime ?? null,
      }
    })

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error en check-arrivals:', error)
    return NextResponse.json(
      {
        success: false,
        error:   error instanceof Error ? error.message : 'Error desconocido',
        results: [],
      },
      { status: 500 },
    )
  }
}
