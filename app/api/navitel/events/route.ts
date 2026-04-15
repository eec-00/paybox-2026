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

/**
 * GET /api/navitel/events
 *
 * Devuelve historial de eventos de geocercas (zone_in / zone_out / ambos)
 * para todos los rastreadores en un rango de fechas.
 *
 * Query params:
 *   from  string  YYYY-MM-DD  (default: hace 7 días)
 *   to    string  YYYY-MM-DD  (default: hoy)
 *   type  string  "zone_in" | "zone_out" | "all"  (default: "zone_in")
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // zone_in → solo entradas, zone_out → solo salidas, all → ambos
    const type = searchParams.get('type') || 'zone_in'
    const allowInzone  = type === 'zone_in'  || type === 'all'
    const allowOutzone = type === 'zone_out' || type === 'all'

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const fromDate = fromParam ? `${fromParam} 00:00:00` : defaultFrom.toISOString().replace('T', ' ').slice(0, 19)
    const toDate = toParam ? `${toParam} 23:59:59` : now.toISOString().replace('T', ' ').slice(0, 19)

    const hash = await getAuthHash()

    // 1. Obtener trackers y zonas en paralelo
    const [trackersRes, zonesRes] = await Promise.all([
      fetch(`${NAVITEL_API_BASE}/tracker/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      }),
      fetch(`${NAVITEL_API_BASE}/zone/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      }),
    ])

    if (!trackersRes.ok || !zonesRes.ok) throw new Error('Error al obtener datos de Navitel')

    const [trackersData, zonesData] = await Promise.all([trackersRes.json(), zonesRes.json()])

    if (!trackersData.success) {
      cachedHash = null
      hashExpiry = 0
      throw new Error('Error al obtener rastreadores')
    }

    const trackers: Array<{ id: number; label: string }> = (trackersData.list || []).map((t: any) => ({
      id: t.id,
      label: t.label,
    }))

    // Mapa id → nombre de zona
    const zoneMap = new Map<number, string>()
    if (zonesData.success) {
      for (const z of zonesData.list || []) {
        zoneMap.set(z.id, z.label || z.name || `Zona ${z.id}`)
      }
    }

    // Mapa id → nombre de tracker
    const trackerMap = new Map<number, string>()
    for (const t of trackers) {
      trackerMap.set(t.id, t.label)
    }

    // 2. Una sola llamada — history/tracker/list devuelve eventos de TODOS los trackers
    //    sin importar el tracker_id enviado, así que no iteramos por tracker.
    const firstTrackerId = trackers[0]?.id
    if (!firstTrackerId) {
      return NextResponse.json({ success: true, events: [], count: 0, from: fromDate, to: toDate })
    }

    const historyRes = await fetch(`${NAVITEL_API_BASE}/history/tracker/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, tracker_id: firstTrackerId, from: fromDate, to: toDate }),
    })

    const historyData = await historyRes.json()
    const rawList: any[] = historyData.success ? (historyData.list || []) : []

    const allEvents: any[] = []
    const seenEventIds = new Set<number>()

    for (const ev of rawList) {
      const evEvent: string = ev.event ?? ''
      const isInzone  = evEvent === 'inzone'
      const isOutzone = evEvent === 'outzone'

      if (!isInzone && !isOutzone) continue
      if (isInzone  && !allowInzone)  continue
      if (isOutzone && !allowOutzone) continue

      // Deduplicar por ID único de Navitel
      if (ev.id != null) {
        if (seenEventIds.has(ev.id)) continue
        seenEventIds.add(ev.id)
      }

      // Saltar eventos sin zona asociada real
      const zoneLabel: string | undefined = ev.extra?.zone_labels?.[0]
      if (!zoneLabel) continue

      const rawTime: string | undefined =
        ev.time || ev.date || ev.event_time || ev.registered

      let timeISO: string | null = null
      let timeDisplay: string | null = null

      if (rawTime) {
        const d = new Date(rawTime)
        if (!isNaN(d.getTime())) {
          timeISO = d.toISOString()
          timeDisplay = d.toLocaleString('es-PE', {
            timeZone: 'America/Lima',
            dateStyle: 'short',
            timeStyle: 'short',
          })
        }
      }

      const zoneId: number | undefined = ev.extra?.zone_ids?.[0] ?? undefined
      const zoneName: string =
        zoneLabel ?? (zoneId != null ? (zoneMap.get(zoneId) ?? `Zona ${zoneId}`) : 'Desconocida')

      const normalizedType = isInzone ? 'zone_in' : 'zone_out'

      // ev.tracker_id es el tracker real del evento (no el que consultamos)
      const evTrackerId: number = ev.tracker_id
      allEvents.push({
        id: `${evTrackerId}-${normalizedType}-${rawTime ?? ''}-${allEvents.length}`,
        type: normalizedType,
        tracker_id: evTrackerId,
        tracker_name: trackerMap.get(evTrackerId) ?? ev.extra?.tracker_label ?? `Tracker ${evTrackerId}`,
        zone_id: zoneId ?? null,
        zone_name: zoneName,
        time_iso: timeISO,
        time_display: timeDisplay,
      })
    }

    // Ordenar por tiempo descendente (más reciente primero)
    allEvents.sort((a, b) => {
      if (!a.time_iso) return 1
      if (!b.time_iso) return -1
      return b.time_iso.localeCompare(a.time_iso)
    })

    return NextResponse.json({
      success: true,
      events: allEvents,
      count: allEvents.length,
      from: fromDate,
      to: toDate,
    })
  } catch (error) {
    console.error('Error en API navitel/events:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        events: [],
      },
      { status: 500 }
    )
  }
}
