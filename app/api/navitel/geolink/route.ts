import { NextRequest, NextResponse } from 'next/server'

const NAVITEL_API_BASE = process.env.NAVITEL_API_BASE || 'https://control.navitelgps.com/api-v2'
const NAVITEL_CREDENTIALS = {
  login: process.env.NAVITEL_LOGIN || '',
  password: process.env.NAVITEL_PASSWORD || ''
}

let cachedHash: string | null = null
let hashExpiry: number = 0

async function getAuthHash(): Promise<string> {
  if (cachedHash && Date.now() < hashExpiry) {
    return cachedHash
  }

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

// POST - Crear geoenlace (uno o varios vehículos)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { trackers, end_date, duration_hours } = body

    if (!trackers || !Array.isArray(trackers) || trackers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere al menos un tracker' },
        { status: 400 }
      )
    }

    const hash = await getAuthHash()

    const now = new Date()
    let endDate: Date
    if (end_date) {
      endDate = new Date(end_date)
    } else {
      endDate = new Date(now.getTime() + (duration_hours || 6) * 60 * 60 * 1000)
    }

    const description = trackers.length === 1
      ? `Geoenlace de ${trackers[0].label}`
      : `Geoenlace: ${trackers.map((t: { id: number; label: string }) => t.label).join(', ')}`

    const linkBody = {
      id: null,
      lifetime: {
        from: now.toISOString(),
        to: endDate.toISOString()
      },
      description,
      trackers: trackers.map((t: { id: number; label: string }) => ({
        alias: t.label,
        tracker_id: t.id,
        params: {
          object_data: [],
          sensor_ids: [],
          state_fields: []
        }
      })),
      params: {
        bounding_zone_ids: [],
        bounding_mode: null,
        place_ids: [],
        zone_ids: [],
        display_options: {
          map: 'osm',
          autoscale: true,
          show_icons: true,
          show_driver_info: true,
          show_vehicle_info: true,
          trace_duration: null
        }
      },
      hash
    }

    const createResponse = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(linkBody),
    })

    if (!createResponse.ok) throw new Error('Error al crear geoenlace')

    const createData = await createResponse.json()

    if (!createData.success) {
      cachedHash = null
      hashExpiry = 0
      throw new Error(createData.error?.message || 'Error al crear geoenlace en Navitel')
    }

    return NextResponse.json({
      success: true,
      data: createData,
      linkId: createData.id
    })
  } catch (error) {
    console.error('Error al crear geoenlace:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
