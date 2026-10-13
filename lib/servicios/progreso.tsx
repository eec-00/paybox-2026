import { Circle } from 'lucide-react'
import { getHitosForTask, type TaskTypeFlags } from './hitos'

// Estado de avance del conductor en un servicio, calculado a partir de lo que
// la propia app del conductor ya registra en Supabase (conductor_servicios_
// progreso/completados) — no de los valores de hora en Odoo directamente,
// porque un campo de hito en 0 (sin marcar) y uno marcado justo a
// medianoche son indistinguibles ahí (ver FEATURES.MD).
export type ProgresoServicio = { estado: 'sin_iniciar' | 'en_proceso' | 'completado'; stepActual: number; totalHitos: number }

// Desde esta fecha de programación, un servicio en etapa "Servicio
// Finalizado" (movido en Odoo o desde la tabla) cuenta como acabado aunque
// el conductor no haya marcado los hitos. Los anteriores se dejan como estaban.
const FINALIZADO_POR_ETAPA_DESDE = '2026-10-01'

type TaskProgreso = TaskTypeFlags & {
  id: number
  stage_id?: [number, string] | false
  x_studio_fecha_de_la_programacin?: string | false
}

export function finalizadoPorEtapa(task: Omit<TaskProgreso, 'id'>): boolean {
  const stage = task.stage_id ? task.stage_id[1].trim().toLowerCase() : ''
  const fecha = task.x_studio_fecha_de_la_programacin
  return stage === 'servicio finalizado' && !!fecha && fecha >= FINALIZADO_POR_ETAPA_DESDE
}

export function calcularProgreso(
  task: TaskProgreso,
  progresoMap: Map<number, number>,
  completadosSet: Set<number>
): ProgresoServicio {
  const totalHitos = getHitosForTask(task).length
  if (completadosSet.has(task.id) || finalizadoPorEtapa(task)) return { estado: 'completado', stepActual: totalHitos, totalHitos }
  if (progresoMap.has(task.id)) return { estado: 'en_proceso', stepActual: progresoMap.get(task.id) || 0, totalHitos }
  return { estado: 'sin_iniciar', stepActual: 0, totalHitos }
}

// Último hito que marcó el conductor (step_actual = cantidad de hitos ya
// marcados, así que es el hito en stepActual - 1). null si no marcó ninguno.
export function ultimoHitoMarcado(
  task: TaskTypeFlags & { id: number },
  progresoMap: Map<number, number>,
  completadosSet: Set<number>
): string | null {
  const hitos = getHitosForTask(task)
  const { stepActual } = calcularProgreso(task, progresoMap, completadosSet)
  if (stepActual <= 0) return null
  return hitos[Math.min(stepActual, hitos.length) - 1]?.label ?? null
}

export function ProgresoBadge({ progreso }: { progreso: ProgresoServicio }) {
  if (progreso.estado === 'completado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700" title="Servicio acabado">
        <Circle className="h-2 w-2 fill-green-500 text-green-500" /> Acabada
      </span>
    )
  }
  if (progreso.estado === 'en_proceso') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-800"
        title={`${progreso.stepActual} de ${progreso.totalHitos} hitos marcados`}
      >
        <Circle className="h-2 w-2 fill-amber-500 text-amber-500" /> En proceso ({progreso.stepActual}/{progreso.totalHitos})
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-700" title="El conductor todavía no inició este servicio">
      <Circle className="h-2 w-2 fill-red-500 text-red-500" /> Sin iniciar
    </span>
  )
}
