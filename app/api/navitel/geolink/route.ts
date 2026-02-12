import { NextRequest, NextResponse } from 'next/server'

const NAVITEL_API_BASE = process.env.NAVITEL_API_BASE || 'https://control.navitelgps.com/api-v2'
const NAVITEL_CREDENTIALS = {
  login: process.env.NAVITEL_LOGIN || '',
  password: process.env.NAVITEL_PASSWORD || ''
}

// Cache para el hash de autenticación
let cachedHash: string | null = null
let hashExpiry: number = 0

async function getAuthHash(): Promise<string> {
  // Si tenemos un hash válido en cache, usarlo
  if (cachedHash && Date.now() < hashExpiry) {
    return cachedHash
  }

  // Autenticarse para obtener nuevo hash
  const authResponse = await fetch(`${NAVITEL_API_BASE}/user/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(NAVITEL_CREDENTIALS),
  })

  if (!authResponse.ok) {
    throw new Error('Error al autenticarse con Navitel API')
  }

  const authData = await authResponse.json()

  if (!authData.success || authData.type !== 'authenticated') {
    throw new Error('Autenticación fallida con Navitel API')
  }

  // Guardar hash en cache por 30 minutos
  cachedHash = authData.hash
  hashExpiry = Date.now() + 30 * 60 * 1000

  return authData.hash
}

// POST - Crear geoenlace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tracker_id, label } = body

    if (!tracker_id || !label) {
      return NextResponse.json(
        { success: false, error: 'Se requiere tracker_id y label' },
        { status: 400 }
      )
    }

    // Obtener hash de autenticación
    const hash = await getAuthHash()

    // Calcular fechas: desde ahora hasta 6 horas después
    const now = new Date()
    const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000)

    const linkBody = {
      id: null,
      lifetime: {
        from: now.toISOString(),
        to: sixHoursLater.toISOString()
      },
      description: `Geoenlace de ${label}`,
      trackers: [
        {
          alias: label,
          tracker_id: tracker_id,
          params: {
            object_data: [],
            sensor_ids: [],
            state_fields: []
          }
        }
      ],
      params: {
        bounding_zone_ids: [],
        bounding_mode: null,
        place_ids: [],
        zone_ids: [],
        display_options: {
          map: "osm",
          autoscale: true,
          show_icons: true,
          show_driver_info: true,
          show_vehicle_info: true,
          trace_duration: null
        }
      },
      hash: hash
    }

    const createResponse = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(linkBody),
    })

    if (!createResponse.ok) {
      throw new Error('Error al crear geoenlace')
    }

    const createData = await createResponse.json()

    if (!createData.success) {
      // Si el hash expiró, limpiar cache
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
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    )
  }
}
