export interface CampoVencimiento {
  key: string
  label: string
}

export const CAMPOS_VENCIMIENTO: CampoVencimiento[] = [
  { key: 'x_studio_dni_vence', label: 'DNI' },
  { key: 'x_studio_licencia_vence', label: 'Licencia' },
  { key: 'x_studio_licencia_aiv_vence', label: 'Licencia AIV' },
  { key: 'x_studio_antecedentes_penales_vence', label: 'Antecedentes Penales' },
  { key: 'x_studio_antecedentes_policiales_vence', label: 'Antecedentes Policiales' },
  { key: 'x_studio_sctr', label: 'SCTR' },
  { key: 'x_studio_curso_bsico', label: 'Curso Básico' },
  { key: 'x_studio_altura_curso', label: 'Altura Curso' },
  { key: 'x_studio_pbip_1', label: 'PBIP' },
  { key: 'x_studio_mp', label: 'MP' },
  { key: 'x_studio_normativa_mtc', label: 'Normativa MTC' },
  { key: 'x_studio_cultura_ziyu', label: 'Cultura ZIYU' },
  { key: 'x_studio_apm', label: 'APM' },
  { key: 'x_studio_s_fernando', label: 'S. FERNANDO' },
  { key: 'x_studio_imupesa', label: 'IMUPESA' },
  { key: 'x_studio_ransa', label: 'RANSA' },
  { key: 'x_studio_maersk', label: 'MAERSK' },
  { key: 'x_studio_medlog', label: 'MEDLOG' },
  { key: 'x_studio_emo', label: 'EMO' },
  { key: 'x_studio_clorox', label: 'CLOROX' },
  { key: 'x_studio_chancay', label: 'CHANCAY' },
  { key: 'x_studio_dpw_log', label: 'DPW LOG.' },
  { key: 'x_studio_dpw_callao', label: 'DPW CALLAO' },
  { key: 'x_studio_kimberly_ind_seguridad', label: 'KIMBERLY: Ind. Seguridad' },
  { key: 'x_studio_kimberly_alto_riesgo', label: 'KIMBERLY: Alto Riesgo' },
  { key: 'x_studio_mondelez_neptunia', label: 'MONDELEZ - NEPTUNIA' },
  { key: 'x_studio_quimpac_ssoma', label: 'QUIMPAC: SSOMA' },
  { key: 'x_studio_quimpac_cloro', label: 'QUIMPAC: Cloro' },
  { key: 'x_studio_quimpac_carga_g', label: 'QUIMPAC: Carga G.' },
  { key: 'x_studio_quimpac_carga_mp', label: 'QUIMPAC: Carga MP' },
  { key: 'x_studio_quimtia', label: 'QUIMTIA' },
]

export interface AlertaThreshold {
  dias: number
  activo: boolean
  nombre?: string
}

export function diasANombre(dias: number): string {
  if (dias === 1) return '1 día'
  if (dias < 7) return `${dias} días`
  if (dias === 7) return '1 semana'
  if (dias === 14) return '2 semanas'
  if (dias === 21) return '3 semanas'
  if (dias < 30) return `${dias} días`
  if (dias === 30) return '1 mes'
  if (dias === 60) return '2 meses'
  if (dias === 90) return '3 meses'
  if (dias === 120) return '4 meses'
  if (dias === 150) return '5 meses'
  if (dias === 180) return '6 meses'
  if (dias % 30 === 0) return `${dias / 30} meses`
  return `${dias} días`
}

// alertas es un objeto: "_global" aplica a todos los campos,
// cada clave adicional (x_studio_campo) aplica solo a ese campo.
export type AlertasConfig = {
  _global?: AlertaThreshold[]
  [campoKey: string]: AlertaThreshold[] | undefined
}

export type TipoAutomatizacion = 'conductores' | 'tractos' | 'carretas'

export const CAMPOS_VENCIMIENTO_TRACTOS: CampoVencimiento[] = [
  { key: 'x_studio_dpw', label: 'DPW' },
  { key: 'x_studio_chvg', label: 'CHVG' },
  { key: 'x_studio_chve', label: 'CHVE' },
  { key: 'x_studio_rt_g', label: 'RT G' },
  { key: 'x_studio_rt_mp', label: 'RT MP' },
  { key: 'x_studio_pol_imo', label: 'POL. IMO' },
]

export const CAMPOS_VENCIMIENTO_CARRETAS: CampoVencimiento[] = [
  { key: 'x_studio_dpw', label: 'DPW' },
  { key: 'x_studio_chvg', label: 'CHVG' },
  { key: 'x_studio_chve', label: 'CHVE' },
  { key: 'x_studio_soat', label: 'SOAT' },
  { key: 'x_studio_rt_g', label: 'RT G' },
  { key: 'x_studio_rt_mp', label: 'RT MP' },
  { key: 'x_studio_poliza', label: 'Póliza' },
  { key: 'x_studio_pol_imo', label: 'POL. IMO' },
]

export function getCamposForTipo(tipo: string): CampoVencimiento[] {
  if (tipo === 'tractos') return CAMPOS_VENCIMIENTO_TRACTOS
  if (tipo === 'carretas') return CAMPOS_VENCIMIENTO_CARRETAS
  return CAMPOS_VENCIMIENTO
}

export function isVehicleTipo(tipo: string): boolean {
  return tipo === 'tractos' || tipo === 'carretas'
}

export interface AutomatizacionConfig {
  tipo: string
  /** Para conductores: job_title en Odoo. Para vehículos: filtro de nombre (ilike). */
  job_title: string
  alertas: AlertasConfig
  activo: boolean
  /** Correo destino para alertas de vehículos (tractos/carretas) */
  destination_email?: string
}

/** Normaliza el formato antiguo (array) al nuevo (objeto con _global) */
export function normalizeAlertas(alertas: any): AlertasConfig {
  if (Array.isArray(alertas)) return { _global: alertas }
  return alertas && typeof alertas === 'object' ? alertas : { _global: [] }
}

/** Devuelve los umbrales efectivos para un campo:
 *  campo-específicos (si los hay) + globales */
export function getAlertasEfectivas(alertas: AlertasConfig, campoKey: string): AlertaThreshold[] {
  const globales = (alertas._global || []).filter((a) => a.activo)
  const especificos = (alertas[campoKey] || []).filter((a) => a.activo)
  // Dedup por dias: específico tiene prioridad, global completa
  const diasVistos = new Set(especificos.map((a) => a.dias))
  const globalExtra = globales.filter((a) => !diasVistos.has(a.dias))
  return [...especificos, ...globalExtra]
}

export function getDaysUntil(dateStr: string | false | null): number | null {
  if (!dateStr || dateStr === 'false') return null
  const date = new Date(dateStr as string)
  if (isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getStatusColor(days: number | null): string {
  if (days === null) return 'bg-muted/30 text-muted-foreground'
  if (days < 0) return 'bg-red-100 text-red-800 font-semibold'
  if (days <= 30) return 'bg-orange-100 text-orange-800 font-semibold'
  if (days <= 90) return 'bg-yellow-100 text-yellow-800'
  return 'bg-green-100 text-green-700'
}

export function getStatusLabel(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `VENCIDO (${Math.abs(days)}d)`
  if (days === 0) return 'HOY'
  return `${days}d`
}
