import { NextResponse } from 'next/server'

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

// GET /api/navitel/zones — Lista todas las geocercas de la cuenta Navitel
export async function GET() {
  try {
    const hash = await getAuthHash()

    const response = await fetch(`${NAVITEL_API_BASE}/zone/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    })

    if (!response.ok) throw new Error('Error al obtener geocercas de Navitel')

    const data = await response.json()

    if (!data.success) {
      cachedHash = null
      hashExpiry = 0
      throw new Error(data.error?.message || 'Error en respuesta de Navitel')
    }

    const zones = (data.list || []).map((z: any) => {
      // Intentar extraer coordenadas del centro de la geocerca
      let lat: number | null = null
      let lng: number | null = null

      if (z.center?.lat != null && z.center?.lng != null) {
        lat = z.center.lat
        lng = z.center.lng
      } else if (Array.isArray(z.points) && z.points.length > 0) {
        // Calcular centroide del polígono
        lat = z.points.reduce((s: number, p: any) => s + (p.lat ?? p.x ?? 0), 0) / z.points.length
        lng = z.points.reduce((s: number, p: any) => s + (p.lng ?? p.y ?? 0), 0) / z.points.length
      } else if (z.lat != null && z.lng != null) {
        lat = z.lat
        lng = z.lng
      }

      return {
        id: z.id,
        name: z.label || z.name || `Zona ${z.id}`,
        lat,
        lng,
        area: z.area ?? null,
      }
    })

    return NextResponse.json({ success: true, zones, count: zones.length })
  } catch (error) {
    console.error('Error en API Navitel zones:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        zones: [],
      },
      { status: 500 }
    )
  }
}
