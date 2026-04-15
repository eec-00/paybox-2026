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
 * POST /api/navitel/check-arrival
 *
 * Verifica si un rastreador entró a una geocerca en el rango de fechas dado.
 *
 * Body:
 *   tracker_id  number   - ID del rastreador Navitel (requerido)
 *   zone_id     number   - ID de la geocerca Navitel (opcional, filtra por zona)
 *   from_date   string   - Desde cuándo buscar, formato "YYYY-MM-DD HH:MM:SS" (default: inicio del día actual)
 *
 * Response:
 *   { success, arrived, time, event }
 *   - arrived: true si encontró evento zone_in
 *   - time: hora del evento en formato "HH:MM" (Lima, Peru) — null si no llegó
 *   - event: objeto del evento crudo de Navitel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tracker_id, zone_id, from_date } = body

    if (!tracker_id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere tracker_id' },
        { status: 400 }
      )
    }

    const hash = await getAuthHash()

    // Rango: desde from_date (o inicio del día en Lima) hasta ahora
    const now = new Date()
    const toDate = now.toISOString().replace('T', ' ').slice(0, 19)

    let fromDate: string
    if (from_date) {
      // Si viene una fecha del servicio (YYYY-MM-DD), convertir a datetime
      fromDate = from_date.length === 10 ? `${from_date} 00:00:00` : from_date
    } else {
      // Por defecto: inicio del día de hoy en Lima (UTC-5)
      const limaOffset = -5 * 60 * 60 * 1000
      const limaStart = new Date(now.getTime() + limaOffset)
      limaStart.setUTCHours(0, 0, 0, 0)
      fromDate = limaStart.toISOString().replace('T', ' ').slice(0, 19)
    }

    const response = await fetch(`${NAVITEL_API_BASE}/history/tracker/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash,
        tracker_id: Number(tracker_id),
        from: fromDate,
        to: toDate,
        type: 'inzone',
      }),
    })

    if (!response.ok) throw new Error('Error al consultar historial de eventos Navitel')

    const data = await response.json()

    if (!data.success) {
      cachedHash = null
      hashExpiry = 0
      throw new Error(data.error?.message || 'Error en historial de eventos')
    }

    const events: any[] = data.list || []

    // Filtrar por zone_id si se proporcionó
    const matching = zone_id
      ? events.filter((e) =>
          e.extra?.zone_ids?.includes(Number(zone_id)) ||
          e.zone_id === Number(zone_id) ||
          e.zone?.id === Number(zone_id)
        )
      : events

    if (matching.length === 0) {
      return NextResponse.json({ success: true, arrived: false, time: null })
    }

    // El último evento zone_in (más reciente)
    const lastEvent = matching[matching.length - 1]

    // Extraer la hora del evento — los campos posibles según la API
    const rawTime: string | undefined =
      lastEvent.time ||
      lastEvent.date ||
      lastEvent.event_time ||
      lastEvent.registered

    let timeHHMM: string | null = null

    if (rawTime) {
      // Convertir a hora Lima (UTC-5) en formato HH:MM
      const eventDate = new Date(rawTime)
      if (!isNaN(eventDate.getTime())) {
        timeHHMM = eventDate.toLocaleTimeString('es-PE', {
          timeZone: 'America/Lima',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      }
    }

    return NextResponse.json({
      success: true,
      arrived: true,
      time: timeHHMM,
      raw_time: rawTime,
      event: lastEvent,
    })
  } catch (error) {
    console.error('Error en check-arrival:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        arrived: false,
        time: null,
      },
      { status: 500 }
    )
  }
}
