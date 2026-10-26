// Asistencia de oficina: tipos compartidos y cálculo de horas, tardanzas y
// avisos por día. Todo en hora de Lima, en minutos desde la medianoche.

import { fechaUTC, sumarDias } from '@/lib/fechas'

export const TIPOS_MARCA = ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida'] as const
export type TipoMarca = (typeof TIPOS_MARCA)[number]

export const LABEL_MARCA: Record<TipoMarca, string> = {
  entrada: 'Entrada',
  salida_almuerzo: 'Salida a almuerzo',
  regreso_almuerzo: 'Regreso de almuerzo',
  salida: 'Salida',
}

/** Almuerzo que se descuenta del horario de referencia para saber cuántas
 * horas se esperan en el día (09:00–19:00 → 9 h). */
export const ALMUERZO_REFERENCIA_MIN = 60

export interface OficinaConfig {
  meta_semanal_horas: number
  tolerancia_min: number
  almuerzo_min: number
  almuerzo_max: number
  hora_limite: string
  selfie_obligatoria: boolean
}

export interface HorarioDia { entrada: string; salida: string }
/** Claves "1" (lunes) … "7" (domingo); null = no trabaja ese día. */
export type Horario = Record<string, HorarioDia | null>

export interface Trabajador {
  user_id: string
  nombre: string
  activo: boolean
  horario: Horario
  meta_semanal_horas: number | null
}

export interface Marca {
  id: string
  user_id: string
  nombre: string | null
  fecha: string
  tipo: TipoMarca
  marcado_at: string
  selfie_path: string | null
  manual: boolean
  sospechosa: boolean
  motivo_sospecha: string | null
}

export const DIAS_SEMANA = [
  { key: '1', label: 'Lunes', corto: 'Lun' },
  { key: '2', label: 'Martes', corto: 'Mar' },
  { key: '3', label: 'Miércoles', corto: 'Mié' },
  { key: '4', label: 'Jueves', corto: 'Jue' },
  { key: '5', label: 'Viernes', corto: 'Vie' },
  { key: '6', label: 'Sábado', corto: 'Sáb' },
  { key: '7', label: 'Domingo', corto: 'Dom' },
]

const fmtHoraLima = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** "HH:MM" de un instante en hora de Lima. */
export function horaLima(iso: string): string {
  return fmtHoraLima.format(new Date(iso))
}

export function hhmmAMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Minutos → "8 h 05 min" / "45 min". Negativos con signo. */
export function fmtDuracion(min: number | null): string {
  if (min === null) return '—'
  const signo = min < 0 ? '-' : ''
  const abs = Math.round(Math.abs(min))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${signo}${m} min`
  return `${signo}${h} h ${String(m).padStart(2, '0')}`
}

/** Día de la semana de una fecha YYYY-MM-DD: "1" (lunes) … "7" (domingo). */
export function diaSemana(fecha: string): string {
  const d = fechaUTC(fecha).getUTCDay()
  return String(d === 0 ? 7 : d)
}

/** Lunes de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -(Number(diaSemana(fecha)) - 1))
}

export function rangoFechas(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f)
  return out
}

/** Instante ISO para una hora HH:MM de un día en Lima (Perú no tiene horario de verano). */
export function isoLima(fecha: string, hhmm: string): string {
  return new Date(`${fecha}T${hhmm}:00-05:00`).toISOString()
}

/** La marca que le toca al trabajador según lo que ya marcó hoy (null = día completo). */
export function siguienteMarca(marcadas: TipoMarca[]): TipoMarca | null {
  if (marcadas.includes('salida')) return null
  return TIPOS_MARCA.find((t) => !marcadas.includes(t)) ?? null
}

export type TipoAviso =
  | 'ausente' | 'falta_marca' | 'sin_almuerzo' | 'almuerzo_corto' | 'almuerzo_largo'
  | 'nocturno' | 'sospechosa' | 'tardanza' | 'tarde_compenso'

export interface Aviso { tipo: TipoAviso; texto: string; grave: boolean }

export interface ResumenDia {
  fecha: string
  marcas: Partial<Record<TipoMarca, Marca>>
  horario: HorarioDia | null
  /** Minutos trabajados (sin almuerzo); null si falta entrada o salida. */
  trabajado: number | null
  almuerzo: number | null
  esperado: number
  minutosTarde: number
  avisos: Aviso[]
  enCurso: boolean
}

export function resumirDia(
  fecha: string,
  marcasDia: Marca[],
  trabajador: Trabajador,
  config: OficinaConfig,
  hoy: string,
): ResumenDia {
  const marcas: Partial<Record<TipoMarca, Marca>> = {}
  for (const m of marcasDia) marcas[m.tipo] = m
  const min = (t: TipoMarca) => (marcas[t] ? hhmmAMin(horaLima(marcas[t]!.marcado_at)) : null)

  const e = min('entrada')
  const sa = min('salida_almuerzo')
  const ra = min('regreso_almuerzo')
  const s = min('salida')

  const horario = trabajador.horario?.[diaSemana(fecha)] ?? null
  const esperado = horario
    ? Math.max(0, hhmmAMin(horario.salida) - hhmmAMin(horario.entrada) - ALMUERZO_REFERENCIA_MIN)
    : 0

  const almuerzo = sa !== null && ra !== null ? ra - sa : null
  const trabajado = e !== null && s !== null ? s - e - (almuerzo ?? 0) : null

  let minutosTarde = 0
  if (horario && e !== null) {
    const tarde = e - hhmmAMin(horario.entrada)
    if (tarde > config.tolerancia_min) minutosTarde = tarde
  }

  const pasado = fecha < hoy
  const enCurso = fecha === hoy && e !== null && s === null
  const avisos: Aviso[] = []
  const hayMarcas = marcasDia.length > 0

  if (!hayMarcas) {
    if (pasado && horario) avisos.push({ tipo: 'ausente', texto: 'Sin marcas', grave: true })
  } else {
    if (pasado) {
      const faltan = TIPOS_MARCA.filter((t) => !marcas[t])
      const soloFaltaAlmuerzo = faltan.length === 2 && !marcas.salida_almuerzo && !marcas.regreso_almuerzo
      if (soloFaltaAlmuerzo) {
        avisos.push({ tipo: 'sin_almuerzo', texto: 'No marcó almuerzo', grave: false })
      } else if (faltan.length > 0) {
        avisos.push({
          tipo: 'falta_marca',
          texto: `Falta: ${faltan.map((t) => LABEL_MARCA[t].toLowerCase()).join(', ')}`,
          grave: true,
        })
      }
    }
    if (almuerzo !== null && almuerzo < config.almuerzo_min) {
      avisos.push({ tipo: 'almuerzo_corto', texto: `Almuerzo de ${fmtDuracion(almuerzo)} (mín. ${config.almuerzo_min} min)`, grave: false })
    }
    if (almuerzo !== null && almuerzo > config.almuerzo_max) {
      avisos.push({ tipo: 'almuerzo_largo', texto: `Almuerzo de ${fmtDuracion(almuerzo)} (máx. ${config.almuerzo_max} min)`, grave: false })
    }
    const limite = hhmmAMin(config.hora_limite)
    const tardias = TIPOS_MARCA.filter((t) => { const v = min(t); return v !== null && v >= limite })
    if (tardias.length > 0) {
      avisos.push({ tipo: 'nocturno', texto: `Marcó después de las ${config.hora_limite}`, grave: true })
    }
    if (marcasDia.some((m) => m.sospechosa)) {
      avisos.push({ tipo: 'sospechosa', texto: 'Marca sospechosa', grave: true })
    }
    if (minutosTarde > 0) {
      const compenso = trabajado !== null && trabajado >= esperado
      avisos.push(compenso
        ? { tipo: 'tarde_compenso', texto: `Llegó ${minutosTarde} min tarde, compensó`, grave: false }
        : { tipo: 'tardanza', texto: `Llegó ${minutosTarde} min tarde`, grave: !enCurso })
    }
  }

  return { fecha, marcas, horario, trabajado, almuerzo, esperado, minutosTarde, avisos, enCurso }
}

export function metaSemanal(trabajador: Trabajador, config: OficinaConfig): number {
  return Number(trabajador.meta_semanal_horas ?? config.meta_semanal_horas)
}

export interface ResumenPeriodo {
  trabajador: Trabajador
  dias: ResumenDia[]
  diasTrabajados: number
  minutosTrabajados: number
  /** Meta del período en minutos (proporcional a la cantidad de días). */
  metaMin: number
  tardanzas: number
  tardanzasCompensadas: number
  minutosTarde: number
  ausencias: number
  faltasMarca: number
  almuerzosFuera: number
  nocturnos: number
  sospechosas: number
}

export function resumirPeriodo(
  trabajador: Trabajador,
  fechas: string[],
  marcasPorDia: Map<string, Marca[]>,
  config: OficinaConfig,
  hoy: string,
): ResumenPeriodo {
  const dias = fechas.map((f) => resumirDia(f, marcasPorDia.get(f) ?? [], trabajador, config, hoy))
  const cuenta = (t: TipoAviso | TipoAviso[]) => {
    const tipos = Array.isArray(t) ? t : [t]
    return dias.filter((d) => d.avisos.some((a) => tipos.includes(a.tipo))).length
  }
  return {
    trabajador,
    dias,
    diasTrabajados: dias.filter((d) => d.marcas.entrada).length,
    minutosTrabajados: dias.reduce((acc, d) => acc + (d.trabajado ?? 0), 0),
    metaMin: Math.round(metaSemanal(trabajador, config) * 60 * (fechas.length / 7)),
    tardanzas: cuenta('tardanza'),
    tardanzasCompensadas: cuenta('tarde_compenso'),
    minutosTarde: dias.reduce((acc, d) => acc + d.minutosTarde, 0),
    ausencias: cuenta('ausente'),
    faltasMarca: cuenta('falta_marca'),
    almuerzosFuera: cuenta(['almuerzo_corto', 'almuerzo_largo']),
    nocturnos: cuenta('nocturno'),
    sospechosas: cuenta('sospechosa'),
  }
}
