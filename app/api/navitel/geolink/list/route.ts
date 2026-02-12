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

// GET - Listar todos los geoenlaces
export async function GET() {
  try {
    // Obtener hash de autenticación
    const hash = await getAuthHash()

    const listResponse = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hash }),
    })

    if (!listResponse.ok) {
      throw new Error('Error al obtener lista de geoenlaces')
    }

    const listData = await listResponse.json()

    if (!listData.success) {
      // Si el hash expiró, limpiar cache
      cachedHash = null
      hashExpiry = 0
      throw new Error('Error al obtener geoenlaces en Navitel')
    }

    // Extraer solo los campos relevantes de cada geoenlace
    const geolinks = listData.list.map((link: any) => ({
      id: link.id,
      hash: link.hash,
      create_date: link.create_date,
      lifetime: link.lifetime,
      description: link.description,
      trackers: link.trackers,
      enabled: link.enabled,
      url: `https://control.navitelgps.com/ls/${link.hash}`
    }))

    return NextResponse.json({
      success: true,
      geolinks,
      count: geolinks.length
    })
  } catch (error) {
    console.error('Error al listar geoenlaces:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        geolinks: []
      },
      { status: 500 }
    )
  }
}
