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

// POST - Eliminar geoenlace por ID
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere el ID del geoenlace' },
        { status: 400 }
      )
    }

    const hash = await getAuthHash()

    const response = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, id }),
    })

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al eliminar geoenlace`)
    }

    const data = await response.json()

    if (!data.success) {
      cachedHash = null
      hashExpiry = 0
      throw new Error(data.error?.message || data.error || 'Error al eliminar geoenlace en Navitel')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al eliminar geoenlace:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
