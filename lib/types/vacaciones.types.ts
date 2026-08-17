export type VacacionEmpresa = 'EESAC' | 'EGARCIA'

export interface VacacionEmpleado {
  id: string
  empresa: VacacionEmpresa
  nombre_completo: string
  dni: string | null
  cargo: string | null
  area: string | null
  celular: string | null
  correo: string | null
  tipo_contrato: string | null
  fecha_ingreso: string // date
  activo: boolean
  user_id: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface VacacionRegistro {
  id: string
  empleado_id: string
  fecha_record: string // date, ancla del récord vacacional (aniversario de ingreso)
  dias_correspondientes: number
  faltas_justificadas: number
  faltas_injustificadas: number
  dias_gozados_1: number
  dias_gozados_2: number
  fecha_salida_1: string | null
  fecha_salida_2: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type VacacionSolicitudTipo = 'reglamentarias' | 'atrasadas'
export type VacacionSolicitudModalidad = 'total' | 'fraccionado'
export type VacacionSolicitudEstado = 'programado' | 'completado' | 'cancelado'

export interface VacacionSolicitud {
  id: string
  empleado_id: string
  registro_id: string | null
  tipo: VacacionSolicitudTipo
  modalidad: VacacionSolicitudModalidad
  fecha_inicio: string
  fecha_fin: string
  fecha_reincorporacion: string
  dias: number
  estado: VacacionSolicitudEstado
  observaciones: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

/** Trabajador con sus récords y solicitudes ya cargados (vista de detalle) */
export interface VacacionEmpleadoConDetalle extends VacacionEmpleado {
  registros: VacacionRegistro[]
  solicitudes: VacacionSolicitud[]
}

/** Estado calculado de un récord vacacional frente a la fecha de hoy */
export type VacacionEstado = 'completo' | 'programado' | 'pendiente' | 'vencido'
