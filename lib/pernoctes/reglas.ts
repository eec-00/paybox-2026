// ============================================================================
// Pernocte (08 · S/40) — registro desde la app del conductor y revisión de
// Operaciones en Paybox (Pruebas > Pernoctes).
//
// Reglas confirmadas (correo del 17-18/11/2026):
//  - Es pernocte cuando el conductor DUERME EN SU CAMIÓN por un motivo
//    operativo. No se activa solo por cruzar la medianoche (glosario).
//  - S/40 por cada noche efectiva (Margiory): una solicitud = una noche.
//  - NO corresponde si (Margiory):
//      · la unidad se quedó en el cliente y el conductor volvió a su casa,
//      · se le depositó el hotel,
//      · se le depositó la movilidad de retorno dejando la unidad,
//      · es viaje a provincia: ahí se paga hospedaje (y cochera si la unidad
//        no se queda en el almacén del cliente) — Rosario.
//  - Autoriza Charito si la evidencia es clara; si no, decide Emerson.
//  - La evidencia se permite pero no se exige, y nunca fotos personales.
//  - Solo con el servicio EN CURSO (iniciado y sin finalizar) y con la
//    ubicación del celular: sin ubicación no se registra (Michael, 18/11/2026).
//
// Pendiente de definir: compatibilidad con la cena (01) y con el retiro
// 03:00 (07). Mientras tanto el pago es SOLO SIMULACIÓN en Pagos conductores.
// ============================================================================

export const MONTO_PERNOCTE = 40

export const MOTIVOS_PERNOCTE = {
  cita_dia_siguiente: 'Cita de entrega o descarga al día siguiente',
  espera_cliente: 'Espera en el cliente (carga o descarga demorada)',
  cola_puerto: 'Cola o espera en puerto / almacén',
  exportacion: 'Exportación: espera para ingresar al puerto',
  otro: 'Otro motivo',
} as const
export type MotivoPernocte = keyof typeof MOTIVOS_PERNOCTE

export const ESTADOS_PERNOCTE = ['pendiente', 'escalado', 'aprobado', 'rechazado', 'anulado'] as const
export type EstadoPernocte = (typeof ESTADOS_PERNOCTE)[number]

export const ESTADO_PERNOCTE_LABEL: Record<EstadoPernocte, string> = {
  pendiente: 'Pendiente',
  escalado: 'Escalado a Emerson',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  anulado: 'Anulado por el conductor',
}

/** Preguntas de exclusión: cualquier «sí» = no corresponde pernocte */
export const EXCLUSIONES_PERNOCTE = {
  volvio_a_casa: '¿La unidad se quedó en el cliente y el conductor volvió a su casa?',
  hotel_depositado: '¿Se le depositó el hotel / alojamiento?',
  movilidad_depositada: '¿Se le depositó la movilidad de retorno dejando la unidad?',
  es_provincia: '¿Es un viaje a provincia? (ahí se paga hospedaje, no pernocte)',
} as const
export type ExclusionPernocte = keyof typeof EXCLUSIONES_PERNOCTE

export const EXCLUSION_CORTA: Record<ExclusionPernocte, string> = {
  volvio_a_casa: 'el conductor volvió a su casa',
  hotel_depositado: 'se depositó el hotel',
  movilidad_depositada: 'se depositó la movilidad de retorno',
  es_provincia: 'es viaje a provincia',
}
export const CLAVES_EXCLUSION = Object.keys(EXCLUSIONES_PERNOCTE) as ExclusionPernocte[]
export type ChecklistPernocte = Record<ExclusionPernocte, boolean | null>

export const MAX_EVIDENCIAS = 3

/** Antes de esta hora (Lima) la solicitud cuenta para la noche del día anterior */
const HORA_CORTE_MADRUGADA = 6

const fmtLima = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})

/**
 * Noche a la que corresponde una solicitud (YYYY-MM-DD, el día en que empieza
 * la noche). Pedir a la 01:00 del miércoles = noche del martes.
 */
export function nocheDe(instante: Date): string {
  const p = Object.fromEntries(fmtLima.formatToParts(instante).map(x => [x.type, x.value]))
  const fecha = `${p.year}-${p.month}-${p.day}`
  if (Number(p.hour) >= HORA_CORTE_MADRUGADA) return fecha
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10)
}

export interface AltaPernocte {
  servicioId: number
  motivo: MotivoPernocte
  motivoDetalle: string | null
  lat: number
  lng: number
  precision: number | null
  evidencias: string[]
}

export const ERROR_SIN_UBICACION = 'Activa la ubicación de tu celular para registrar el pernocte'

export type ResultadoAltaPernocte = { ok: true; datos: AltaPernocte } | { ok: false; error: string }

const numeroONull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function validarAltaPernocte(body: Record<string, unknown> | null): ResultadoAltaPernocte {
  const { servicioId, motivo, motivoDetalle, duermeEnUnidad, lat, lng, precision, evidencias = [] } = body ?? {}

  if (!Number.isInteger(servicioId) || (servicioId as number) <= 0) return { ok: false, error: 'Servicio inválido' }
  if (typeof motivo !== 'string' || !(motivo in MOTIVOS_PERNOCTE)) return { ok: false, error: 'Elige un motivo' }
  const detalle = typeof motivoDetalle === 'string' ? motivoDetalle.trim().slice(0, 500) : ''
  if (motivo === 'otro' && !detalle) return { ok: false, error: 'Cuenta brevemente el motivo' }
  if (duermeEnUnidad !== true) {
    return { ok: false, error: 'El pernocte es solo cuando duermes en la unidad' }
  }
  if (!Array.isArray(evidencias) || evidencias.some(e => typeof e !== 'string') || evidencias.length > MAX_EVIDENCIAS) {
    return { ok: false, error: 'Evidencias inválidas' }
  }
  const la = numeroONull(lat)
  const ln = numeroONull(lng)
  if (la === null || ln === null || Math.abs(la) > 90 || Math.abs(ln) > 180) return { ok: false, error: ERROR_SIN_UBICACION }

  return {
    ok: true,
    datos: {
      servicioId: servicioId as number,
      motivo: motivo as MotivoPernocte,
      motivoDetalle: detalle || null,
      lat: la,
      lng: ln,
      precision: numeroONull(precision),
      evidencias: evidencias as string[],
    },
  }
}

// ── Revisión (Operaciones) ───────────────────────────────────────────────

export type AccionPernocte = 'aprobar' | 'rechazar' | 'escalar' | 'comentar'

export const ACCION_LABEL: Record<AccionPernocte | 'solicitar' | 'anular', string> = {
  solicitar: 'Solicitó el pernocte',
  aprobar: 'Aprobó',
  rechazar: 'Rechazó',
  escalar: 'Escaló a Emerson',
  comentar: 'Observación',
  anular: 'Anuló la solicitud',
}

export interface RevisorPernocte {
  /** admin / developer: decide lo escalado (Emerson) */
  esAdmin: boolean
}

/** Exclusiones marcadas con «sí» */
export function exclusionesActivas(c: Partial<ChecklistPernocte>): ExclusionPernocte[] {
  return CLAVES_EXCLUSION.filter(k => c[k] === true)
}

export function checklistCompleto(c: Partial<ChecklistPernocte>): boolean {
  return CLAVES_EXCLUSION.every(k => typeof c[k] === 'boolean')
}

/**
 * ¿Se puede aplicar la acción? Devuelve el motivo del rechazo o null.
 * - Aprobar exige el checklist completo y sin exclusiones.
 * - Rechazar y escalar exigen una observación.
 * - Lo escalado solo lo decide un admin (Emerson).
 */
export function validarAccion(
  estado: EstadoPernocte,
  accion: AccionPernocte,
  checklist: Partial<ChecklistPernocte>,
  observacion: string,
  revisor: RevisorPernocte,
): string | null {
  if (estado === 'anulado') return 'El conductor anuló esta solicitud'
  if (accion === 'comentar') return observacion.trim() ? null : 'Escribe la observación'

  if (estado === 'aprobado' || estado === 'rechazado') {
    if (!revisor.esAdmin) return 'Esta solicitud ya fue decidida; solo un administrador puede cambiarla'
  }
  if (estado === 'escalado' && accion !== 'escalar' && !revisor.esAdmin) {
    return 'Escalada a Emerson: la decide un administrador'
  }
  if (accion === 'escalar') {
    if (estado === 'escalado') return 'Ya está escalada'
    return observacion.trim() ? null : 'Explica qué falta aclarar para que Emerson decida'
  }
  if (accion === 'rechazar') return observacion.trim() ? null : 'Escribe por qué se rechaza'

  // aprobar
  if (!checklistCompleto(checklist)) return 'Responde las 4 preguntas antes de aprobar'
  const excl = exclusionesActivas(checklist)
  if (excl.length) return `No corresponde pernocte: ${excl.map(k => EXCLUSION_CORTA[k]).join(', ')}`
  return null
}

export function estadoTrasAccion(estado: EstadoPernocte, accion: AccionPernocte): EstadoPernocte {
  switch (accion) {
    case 'aprobar': return 'aprobado'
    case 'rechazar': return 'rechazado'
    case 'escalar': return 'escalado'
    default: return estado
  }
}
