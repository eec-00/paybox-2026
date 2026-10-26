// Helpers de servidor para las rutas /api/oficina/*.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyLima } from '@/lib/fechas'
import { TIPOS_MARCA, horaLima, siguienteMarca, type TipoMarca } from '@/lib/oficina/calculos'

export interface EstadoHoy {
  nombre: string
  marcasHoy: { tipo: TipoMarca; hora: string }[]
  siguiente: TipoMarca | null
  /** Marcas en las que RRHH pide selfie. */
  selfieTipos: TipoMarca[]
}

/** Nombre del trabajador, sus marcas de hoy y la que le toca. null si no está habilitado. */
export async function estadoHoy(admin: SupabaseClient, userId: string): Promise<EstadoHoy | null> {
  const { data: trabajador } = await admin
    .from('oficina_trabajadores')
    .select('nombre, activo')
    .eq('user_id', userId)
    .maybeSingle()
  if (!trabajador?.activo) return null

  const { data: config } = await admin
    .from('oficina_config')
    .select('selfie_tipos')
    .eq('id', 1)
    .single()

  const { data: marcas } = await admin
    .from('oficina_marcas')
    .select('tipo, marcado_at')
    .eq('user_id', userId)
    .eq('fecha', hoyLima())
    .order('marcado_at')

  const marcasHoy = (marcas ?? []).map((m) => ({ tipo: m.tipo as TipoMarca, hora: horaLima(m.marcado_at) }))
  return {
    nombre: trabajador.nombre,
    marcasHoy,
    siguiente: siguienteMarca(marcasHoy.map((m) => m.tipo)),
    selfieTipos: (config?.selfie_tipos as TipoMarca[] | undefined) ?? [...TIPOS_MARCA],
  }
}
