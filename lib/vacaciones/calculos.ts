import { addYears, addMonths, subMonths, isBefore, isAfter } from 'date-fns'
import type {
  VacacionRegistro,
  VacacionSolicitud,
  VacacionEstado,
} from '@/lib/types/vacaciones.types'

/**
 * Cálculos del módulo de vacaciones.
 *
 * Todo se deriva en código a partir de `fecha_ingreso` / `fecha_record`
 * (nunca se guardan saldos ni fechas de aviso) para evitar el problema que
 * tenía el Excel original: fórmulas copiadas entre filas que quedaban
 * desactualizadas o directamente mal referenciadas.
 *
 * Regla legal (Perú, Art. 23 D.Leg. 713): el trabajador gana su récord
 * vacacional al año de servicio. El empleador tiene hasta 12 meses más para
 * otorgarlo; si no lo hace, corresponde indemnización. Por eso el "límite"
 * se fija en récord + 11 meses (un mes de margen) y los avisos previos se
 * calculan hacia atrás desde ese límite — igual que las columnas
 * "11 meses cumple / 6-4-3 meses antes" del Excel, pero calculadas siempre
 * igual (sin copy-paste).
 */

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d
}

/** Fecha del récord vacacional N (1 = primer aniversario) a partir del ingreso. */
export function getRecordDate(fechaIngreso: string | Date, recordIndex: number): Date {
  return addYears(toDate(fechaIngreso), recordIndex)
}

export interface AvisosVacacion {
  /** Fecha límite legal: récord + 11 meses. Pasada esta fecha, riesgo de indemnización. */
  limite: Date
  aviso6m: Date
  aviso4m: Date
  aviso3m: Date
}

/** Cascada de avisos de un récord vacacional, calculada siempre de la misma forma. */
export function getAvisos(fechaRecord: string | Date): AvisosVacacion {
  const limite = addMonths(toDate(fechaRecord), 11)
  return {
    limite,
    aviso6m: subMonths(limite, 6),
    aviso4m: subMonths(limite, 4),
    aviso3m: subMonths(limite, 3),
  }
}

/** Saldo de días de un récord: nunca se guarda, siempre se calcula. */
export function getSaldo(registro: Pick<VacacionRegistro, 'dias_correspondientes' | 'dias_gozados_1' | 'dias_gozados_2'>): number {
  return registro.dias_correspondientes - registro.dias_gozados_1 - registro.dias_gozados_2
}

/** ¿Hay una solicitud programada (aún no completada/cancelada) para este récord? */
function tieneSolicitudProgramada(registroId: string, solicitudes: VacacionSolicitud[]): boolean {
  return solicitudes.some((s) => s.registro_id === registroId && s.estado === 'programado')
}

export function getEstado(
  registro: VacacionRegistro,
  solicitudes: VacacionSolicitud[],
  today: Date = new Date()
): VacacionEstado {
  const saldo = getSaldo(registro)
  if (saldo <= 0) return 'completo'
  if (tieneSolicitudProgramada(registro.id, solicitudes)) return 'programado'
  const { limite } = getAvisos(registro.fecha_record)
  if (isAfter(today, limite)) return 'vencido'
  return 'pendiente'
}

const ESTADO_COLOR: Record<VacacionEstado, string> = {
  completo: 'bg-green-100 text-green-700',
  programado: 'bg-blue-100 text-blue-800',
  pendiente: 'bg-yellow-100 text-yellow-800',
  vencido: 'bg-red-100 text-red-800 font-semibold',
}

const ESTADO_LABEL: Record<VacacionEstado, string> = {
  completo: 'Completo',
  programado: 'Programado',
  pendiente: 'Pendiente',
  vencido: 'Aviso vencido',
}

export function getEstadoColor(estado: VacacionEstado): string {
  return ESTADO_COLOR[estado]
}

export function getEstadoLabel(estado: VacacionEstado): string {
  return ESTADO_LABEL[estado]
}

/** Próximo aviso pendiente de un récord (el más cercano que aún no pasó), o null si ya pasaron todos. */
export function getProximoAviso(registro: VacacionRegistro, today: Date = new Date()): Date | null {
  const { limite, aviso6m, aviso4m, aviso3m } = getAvisos(registro.fecha_record)
  const enOrden = [aviso6m, aviso4m, aviso3m, limite]
  return enOrden.find((fecha) => isBefore(today, fecha)) ?? null
}

/** El récord vacacional más reciente (mayor fecha_record) de un trabajador. */
export function getRegistroVigente(registros: VacacionRegistro[]): VacacionRegistro | null {
  if (registros.length === 0) return null
  return [...registros].sort((a, b) => (a.fecha_record < b.fecha_record ? 1 : -1))[0]
}

/** Ranking numérico de estado para ordenar (vencido/pendiente primero). */
const ESTADO_ORDEN: Record<VacacionEstado, number> = {
  vencido: 0,
  pendiente: 1,
  programado: 2,
  completo: 3,
}

export function getEstadoOrden(estado: VacacionEstado): number {
  return ESTADO_ORDEN[estado]
}
