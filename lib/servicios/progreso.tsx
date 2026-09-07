import { Circle } from 'lucide-react'
import { getHitosForTask, type TaskTypeFlags } from './hitos'

// Estado de avance del conductor en un servicio, calculado a partir de lo que
// la propia app del conductor ya registra en Supabase (conductor_servicios_
// progreso/completados) — no de los valores de hora en Odoo directamente,
// porque un campo de hito en 0 (sin marcar) y uno marcado justo a
// medianoche son indistinguibles ahí (ver FEATURES.MD).
export type ProgresoServicio = { estado: 'sin_iniciar' | 'en_proceso' | 'completado'; stepActual: number; totalHitos: number }

export function calcularProgreso(
  task: TaskTypeFlags & { id: number },
  progresoMap: Map<number, number>,
  completadosSet: Set<number>
): ProgresoServicio {
  const totalHitos = getHitosForTask(task).length
  if (completadosSet.has(task.id)) return { estado: 'completado', stepActual: totalHitos, totalHitos }
  if (progresoMap.has(task.id)) return { estado: 'en_proceso', stepActual: progresoMap.get(task.id) || 0, totalHitos }
  return { estado: 'sin_iniciar', stepActual: 0, totalHitos }
}

export function ProgresoBadge({ progreso }: { progreso: ProgresoServicio }) {
  if (progreso.estado === 'completado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700" title="El conductor marcó todos los hitos">
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
