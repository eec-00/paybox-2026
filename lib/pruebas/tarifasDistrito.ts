import type { TarifaAprobada } from './pagosConductores'

/** Columnas que se leen de public.pruebas_tarifas_distrito */
export const COLUMNAS_TARIFA = 'id, zona, distrito, producto, monto, aprobado_por_nombre, created_at'

export interface FilaTarifaDistrito {
  id: string
  zona: string
  distrito: string
  producto: TarifaAprobada['producto']
  monto: number | string
  aprobado_por_nombre: string | null
  created_at: string
}

export function aTarifa(f: FilaTarifaDistrito): TarifaAprobada {
  return {
    id: f.id, zona: f.zona, distrito: f.distrito, producto: f.producto, monto: Number(f.monto),
    aprobadoPor: f.aprobado_por_nombre, aprobadoAt: f.created_at,
  }
}
