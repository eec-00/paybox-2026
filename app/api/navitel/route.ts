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

export async function GET(request: NextRequest) {
  try {
    // Obtener hash de autenticación
    const hash = await getAuthHash()

    // Obtener lista de trackers/vehículos
    const trackersResponse = await fetch(`${NAVITEL_API_BASE}/tracker/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hash }),
    })

    if (!trackersResponse.ok) {
      throw new Error('Error al obtener lista de vehículos')
    }

    const trackersData = await trackersResponse.json()

    if (!trackersData.success) {
      // Si el hash expiró, limpiar cache y reintentar
      cachedHash = null
      hashExpiry = 0
      throw new Error('Error en respuesta de Navitel API')
    }

    // Extraer solo id y label de cada vehículo
    const vehicles = trackersData.list.map((tracker: any) => ({
      id: tracker.id,
      label: tracker.label,
    }))

    return NextResponse.json({
      success: true,
      vehicles,
      count: vehicles.length,
    })
  } catch (error) {
    console.error('Error en API Navitel:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        vehicles: [],
      },
      { status: 500 }
    )
  }
}
