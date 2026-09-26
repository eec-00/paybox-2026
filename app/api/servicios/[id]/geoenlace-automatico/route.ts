import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Geoenlaces creados por la automatización (ver
// app/api/automatizacion/geoenlaces-auto) para UN servicio puntual — a
// diferencia del match por placa que hace la página de detalle del servicio
// (que puede engancharse a cualquier geoenlace activo de esa placa, incluyendo
// uno independiente que un usuario creó manualmente para otra cosa), esto
// devuelve solo los que la automatización vinculó específicamente a este
// servicio_id, ya sea su geoenlace individual o el "SERVICIO EN CONJUNTO"
// compartido con otros servicios del mismo Referencia/Booking.

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

interface NavitelLinkListItem {
  id: number
  hash: string
  lifetime?: { to: string } | null
  trackers?: { alias: string }[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const servicioId = Number(id)
    if (!Number.isFinite(servicioId)) {
      return NextResponse.json({ success: false, error: 'id inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: filas, error } = await supabase
      .from('geoenlaces_automaticos')
      .select('geolink_id, es_conjunto, placa, referencia_booking')
      .eq('servicio_id', servicioId)
      .is('cerrado_at', null)

    if (error) throw new Error(error.message)
    if (!filas || filas.length === 0) {
      return NextResponse.json({ success: true, geolinks: [] })
    }

    const hash = await navitelAuth()
    const listRes = await fetch(`${NAVITEL_API_BASE}/tracker/location/link/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    })
    const listData = await listRes.json()
    if (!listData.success) throw new Error('Error al listar geoenlaces en Navitel')
    const porId = new Map<number, NavitelLinkListItem>((listData.list as NavitelLinkListItem[]).map((l) => [l.id, l]))

    const geolinks = filas
      .map((fila) => {
        const link = porId.get(fila.geolink_id)
        if (!link) return null // ya venció y Navitel lo limpió, o se borró a mano
        return {
          tipo: fila.es_conjunto ? 'conjunto' as const : 'individual' as const,
          url: `https://control.navitelgps.com/ls/${link.hash}`,
          expiraAt: link.lifetime?.to ?? null,
          placas: link.trackers?.map((t) => t.alias) ?? (fila.placa ? [fila.placa] : []),
          referenciaBooking: fila.referencia_booking,
        }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)

    return NextResponse.json({ success: true, geolinks })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido', geolinks: [] },
      { status: 500 }
    )
  }
}
