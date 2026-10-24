'use client'

import useSWR from 'swr'
import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

// Cache en el cliente de la lista de servicios (Trailers y
// Sobrecostos). Al volver a una pantalla ya visitada la tabla aparece al
// instante con lo último cargado y se refresca sola en segundo plano — nunca
// se muestra solo lo cacheado: los conductores marcan horas todo el tiempo.

export interface ServiciosResponse<T> {
  tasks: T[]
  stages: { id: number; name: string }[]
  validFields: string[]
}

async function fetchServicios<T>(url: string): Promise<ServiciosResponse<T>> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error al cargar servicios')
  return { tasks: data.tasks ?? [], stages: data.stages ?? [], validFields: data.validFields ?? [] }
}

/** Lista de servicios desde Odoo. `url` sale de serviciosUrl() (45 días o histórico). */
export function useServiciosLista<T>(url: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ServiciosResponse<T>>(
    url, fetchServicios<T>, { revalidateOnFocus: true }
  )
  return {
    data,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    // Solo "cargando" cuando no hay nada que mostrar; con datos previos el
    // refresco va en segundo plano (isValidating).
    loading: isLoading,
    refreshing: isValidating,
    refresh: () => mutate(),
  }
}

async function fetchProgreso() {
  const supabase = createClient()
  // Paginado: Supabase corta cada consulta en 1000 filas sin avisar, y
  // "completados" crece con cada servicio terminado — pasado ese tope, servicios
  // ya terminados aparecerían como "Sin iniciar". Orden fijo para que las
  // páginas no se pisen.
  const [progreso, completados] = await Promise.all([
    fetchAllRows<{ servicio_id: number; step_actual: number }>((from, to) =>
      supabase.from('conductor_servicios_progreso').select('servicio_id, step_actual')
        .order('servicio_id').order('conductor_id').range(from, to)
    ),
    fetchAllRows<{ servicio_id: number }>((from, to) =>
      supabase.from('conductor_servicios_completados').select('servicio_id')
        .order('servicio_id').order('conductor_id').range(from, to)
    ),
  ])
  return { progreso, completados }
}

/** Avance de cada servicio marcado por los conductores en PayBox (Supabase). */
export function useProgresoServicios() {
  const { data, isLoading, mutate } = useSWR('servicios-progreso', fetchProgreso, { revalidateOnFocus: true })
  const progresoMap = useMemo(
    () => new Map((data?.progreso ?? []).map((p) => [p.servicio_id, p.step_actual])),
    [data]
  )
  const completadosSet = useMemo(
    () => new Set((data?.completados ?? []).map((c) => c.servicio_id)),
    [data]
  )
  return { progresoMap, completadosSet, loading: isLoading, refresh: () => mutate() }
}
