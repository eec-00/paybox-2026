// ============================================================
// Catálogo de hitos operativos por tipo de servicio (conductores)
// Fuente: FEATURES.MD — calzado contra los campos reales de Odoo
// (project.task, campos x_studio_*, verificados con fields_get)
// ============================================================

export type FotoRequisito = 'no' | 'si' | 'opcional' | 'condicional'

export interface HitoDef {
  /** Clave estable, usada para guardar fotos y progreso */
  key: string
  label: string
  /** Campo float (hora Odoo) en project.task */
  field: string
  foto: FotoRequisito
  /** Ayuda corta sobre qué evidencia se espera */
  criterio?: string
}

export type TipoServicioKey =
  | 'importacion'
  | 'exportacion'
  | 'despacho'
  | 'traslado_interno'
  | 'isotanque_lleno'
  | 'isotanque_vacio'
  | 'devolucion_vacio'
  | 'retiro_vacio'
  | 'generico'

export interface TipoServicioDef {
  key: TipoServicioKey
  label: string
  hitos: HitoDef[]
}

// Hito final común a todos los flujos
const SERVICIO_FINALIZADO: HitoDef = {
  key: 'servicio_finalizado',
  label: 'Servicio finalizado',
  field: 'x_studio_servicio_finalizado',
  foto: 'no',
  criterio: 'Cierre del servicio.',
}

const INICIO_RUTA: HitoDef = {
  key: 'inicio_ruta',
  label: 'Inicio de ruta',
  field: 'x_studio_saliendo_de_la_cochera',
  foto: 'no',
}

// Cola de "Otro conductor" para la devolución del contenedor vacío (ver
// x_studio_modalidad_de_devolucion): en vez de manejar hasta el
// almacén/depósito de devolución, el conductor original deja el contenedor
// en la cochera de la empresa para que otro conductor complete la
// devolución (se le asigna vía una subtarea que Odoo crea automáticamente
// — ver automatización "Crear subtarea de devolución de vacío").
const LLEGADA_COCHERA: HitoDef = {
  key: 'llegada_cochera',
  label: 'Llegada a cochera',
  field: 'x_studio_llegada_a_cochera',
  foto: 'no',
}
const CONTENEDOR_DEJADO_COCHERA: HitoDef = {
  key: 'contenedor_dejado_cochera',
  label: 'Contenedor dejado en cochera',
  field: 'x_studio_contenedor_dejado_en_cochera',
  foto: 'si',
  criterio: 'Foto del contenedor dejado en la cochera, para el conductor que continuará la devolución.',
}

/** Campo Odoo (selection: "Mismo conductor" | "Otro conductor") que decide si
 * la devolución del contenedor vacío la hace el mismo conductor o se deja en
 * cochera para que otro la complete. Solo aplica a IMPORTACIÓN. Se pregunta
 * al conductor justo al terminar "Salida de cliente". */
export const MODALIDAD_DEVOLUCION_FIELD = 'x_studio_modalidad_de_devolucion'
export const MODALIDAD_MISMO_CONDUCTOR = 'Mismo conductor'
export const MODALIDAD_OTRO_CONDUCTOR = 'Otro conductor'

/**
 * Campo Odoo (mismo selection "Mismo conductor" | "Otro conductor", campo
 * técnico distinto) que decide si el RETIRO del contenedor vacío antes de
 * cargar lo hace el mismo conductor o lo hace otro conductor y lo deja en
 * cochera para que el conductor original solo lo recoja ahí. Solo aplica a
 * EXPORTACIÓN, y a diferencia de la devolución, esto NO se pregunta durante
 * el flujo — se decide de antemano en Odoo (el despachador lo asigna al
 * crear el servicio, antes de que el conductor empiece su ruta, porque el
 * retiro es lo primero que pasaría, no hay un punto natural de la ruta en el
 * que preguntar). La app solo lee/valida este valor para armar la cola de
 * hitos correcta desde el inicio.
 */
export const MODALIDAD_RETIRO_FIELD = 'x_studio_modalidad_de_retiro'

export const TIPOS_SERVICIO: Record<TipoServicioKey, TipoServicioDef> = {
  importacion: {
    key: 'importacion',
    label: 'Importación contenedor',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_cola_retiro', label: 'Llegada/cola en almacén de retiro', field: 'x_studio_en_cola_de_ingreso', foto: 'no' },
      { key: 'ingreso_almacen_retiro', label: 'Ingreso almacén de retiro', field: 'x_studio_ingreso_a_almacen_de_retiro_1', foto: 'no' },
      { key: 'salida_almacen_retiro', label: 'Salida almacén de retiro', field: 'x_studio_salida_de_almacen_de_retiro', foto: 'si', criterio: 'Foto del contenedor retirado, número visible, estado exterior y precinto si aplica.' },
      { key: 'llegada_cliente', label: 'Llegada a cliente', field: 'x_studio_llegada_a_cliente', foto: 'no' },
      { key: 'ingreso_cliente', label: 'Ingreso a cliente', field: 'x_studio_ingreso_a_cliente', foto: 'no' },
      { key: 'inicio_descarga', label: 'Inicio descarga', field: 'x_studio_inicio_descarga', foto: 'si', criterio: 'Foto antes de abrir, precinto visible si aplica.' },
      { key: 'fin_descarga', label: 'Fin descarga', field: 'x_studio_fin_descarga', foto: 'si', criterio: 'Foto del contenedor descargado, mercadería entregada o evidencia de conformidad.' },
      { key: 'salida_cliente', label: 'Salida de cliente', field: 'x_studio_salida_de_cliente', foto: 'no' },
      { key: 'llegada_devolucion', label: 'Llegada a almacén/depósito de devolución', field: 'x_studio_llegada_a_almacendeposito_de_devolucion', foto: 'no' },
      { key: 'ingreso_devolucion', label: 'Ingreso a almacén/depósito de devolución', field: 'x_studio_ingreso_a_almacendeposito_de_devolucion', foto: 'no' },
      { key: 'contenedor_devuelto', label: 'Contenedor vacío devuelto', field: 'x_studio_contenedor_vacio_devuelto', foto: 'si', criterio: 'Foto del EIR, constancia o evidencia de devolución.' },
      SERVICIO_FINALIZADO,
    ],
  },

  exportacion: {
    key: 'exportacion',
    label: 'Exportación contenedor',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_cola_retiro', label: 'Llegada/cola en almacén de retiro', field: 'x_studio_en_cola_de_ingreso', foto: 'no' },
      { key: 'ingreso_almacen_retiro', label: 'Ingreso almacén de retiro', field: 'x_studio_ingreso_a_almacen_de_retiro_1', foto: 'no' },
      { key: 'salida_almacen_retiro', label: 'Salida almacén de retiro', field: 'x_studio_salida_de_almacen_de_retiro', foto: 'si', criterio: 'Foto del contenedor retirado, número visible, estado exterior y precinto si aplica.' },
      { key: 'llegada_cliente', label: 'Llegada a cliente', field: 'x_studio_llegada_a_cliente', foto: 'no' },
      { key: 'ingreso_cliente', label: 'Ingreso a cliente', field: 'x_studio_ingreso_a_cliente', foto: 'no' },
      { key: 'inicio_carga', label: 'Inicio carga', field: 'x_studio_inicio_carga', foto: 'si', criterio: 'Foto del contenedor vacío antes de cargar o mercadería al inicio de carga.' },
      { key: 'fin_carga', label: 'Fin carga', field: 'x_studio_fin_carga', foto: 'si', criterio: 'Foto de carga finalizada, contenedor cerrado, mercadería asegurada y precinto si aplica.' },
      { key: 'salida_cliente', label: 'Salida de cliente', field: 'x_studio_salida_de_cliente', foto: 'no' },
      { key: 'llegada_terminal_destino', label: 'Llegada a terminal/almacén destino', field: 'x_studio_llegada_a_terminalalmacen_destino', foto: 'no' },
      { key: 'ingreso_terminal_destino', label: 'Ingreso terminal/almacén destino', field: 'x_studio_ingreso_terminalalmacen_destino', foto: 'no' },
      { key: 'entrega_contenedor_lleno', label: 'Entrega contenedor lleno', field: 'x_studio_entrega_contenedor_lleno', foto: 'si', criterio: 'Foto de ticket, EIR, constancia o documento de recepción.' },
      SERVICIO_FINALIZADO,
    ],
  },

  despacho: {
    key: 'despacho',
    label: 'Despacho / recojo / carga suelta',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_punto_carga', label: 'Llegada a punto de carga', field: 'x_studio_llegada_a_punto_de_carga', foto: 'no' },
      { key: 'ingreso_punto_carga', label: 'Ingreso a punto de carga', field: 'x_studio_ingreso_a_punto_de_carga', foto: 'no' },
      { key: 'inicio_carga', label: 'Inicio carga', field: 'x_studio_inicio_carga', foto: 'si', criterio: 'Foto del contenedor vacío antes de cargar o mercadería al inicio de carga.' },
      { key: 'fin_carga', label: 'Fin carga', field: 'x_studio_fin_carga', foto: 'si', criterio: 'Foto de carga finalizada, mercadería asegurada y precinto si aplica.' },
      { key: 'salida_origen', label: 'Salida origen', field: 'x_studio_salida_origen', foto: 'no' },
      { key: 'llegada_destino', label: 'Llegada destino', field: 'x_studio_llegada_destino', foto: 'no' },
      { key: 'ingreso_destino', label: 'Ingreso destino', field: 'x_studio_ingreso_destino', foto: 'no' },
      { key: 'inicio_descarga', label: 'Inicio descarga', field: 'x_studio_inicio_descarga', foto: 'opcional', criterio: 'Opcional salvo exigencia del cliente.' },
      { key: 'fin_descarga', label: 'Fin descarga', field: 'x_studio_fin_descarga', foto: 'si', criterio: 'Foto de mercadería entregada o evidencia de conformidad.' },
      { key: 'salida_destino', label: 'Salida destino', field: 'x_studio_salida_destino', foto: 'no' },
      SERVICIO_FINALIZADO,
    ],
  },

  traslado_interno: {
    key: 'traslado_interno',
    label: 'Traslado interno',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_punto_a', label: 'Llegada punto A', field: 'x_studio_llegada_punto_a', foto: 'no' },
      { key: 'ingreso_punto_a', label: 'Ingreso punto A', field: 'x_studio_ingreso_punto_a', foto: 'no' },
      { key: 'inicio_operacion_a', label: 'Inicio operación punto A', field: 'x_studio_inicio_operacion_punto_a', foto: 'opcional', criterio: 'Foto opcional si ayuda a evidenciar condición inicial o incidencia.' },
      { key: 'fin_operacion_a', label: 'Fin operación punto A', field: 'x_studio_fin_operacion_punto_a', foto: 'si', criterio: 'Evidencia de lo recogido, terminado o cerrado en origen.' },
      { key: 'salida_punto_a', label: 'Salida punto A', field: 'x_studio_salida_punto_a', foto: 'no' },
      { key: 'llegada_punto_b', label: 'Llegada punto B', field: 'x_studio_llegada_punto_b', foto: 'no' },
      { key: 'ingreso_punto_b', label: 'Ingreso punto B', field: 'x_studio_ingreso_punto_b', foto: 'no' },
      { key: 'inicio_operacion_b', label: 'Inicio operación punto B', field: 'x_studio_inicio_operacion_punto_b', foto: 'opcional', criterio: 'Foto opcional si ayuda a evidenciar condición inicial o incidencia.' },
      { key: 'fin_operacion_b', label: 'Fin operación punto B', field: 'x_studio_fin_operacion_punto_b', foto: 'si', criterio: 'Evidencia de entrega, cierre o conformidad en destino.' },
      SERVICIO_FINALIZADO,
    ],
  },

  isotanque_lleno: {
    key: 'isotanque_lleno',
    label: 'Isotanque lleno',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_retiro', label: 'Llegada a retiro', field: 'x_studio_llegada_a_retiro', foto: 'no' },
      { key: 'ingreso_retiro', label: 'Ingreso a retiro', field: 'x_studio_ingreso_a_retiro', foto: 'no' },
      { key: 'retiro_enganche', label: 'Retiro/enganche isotanque', field: 'x_studio_retiroenganche_isotanque', foto: 'si', criterio: 'Foto del isotanque, número, estado y precintos si aplica.' },
      { key: 'salida_retiro', label: 'Salida retiro', field: 'x_studio_salida_retiro', foto: 'no' },
      { key: 'llegada_destino', label: 'Llegada destino', field: 'x_studio_llegada_destino', foto: 'no' },
      { key: 'ingreso_destino', label: 'Ingreso destino', field: 'x_studio_ingreso_destino', foto: 'no' },
      { key: 'inicio_descarga_entrega', label: 'Inicio descarga/entrega', field: 'x_studio_inicio_descargaentrega', foto: 'condicional', criterio: 'Foto solo si el cliente/planta lo permite. Si no permite, marcar excepción y observación.' },
      { key: 'fin_descarga_entrega', label: 'Fin descarga/entrega', field: 'x_studio_fin_descargaentrega', foto: 'si', criterio: 'Foto de constancia, ticket o documento de entrega.' },
      { key: 'salida_destino', label: 'Salida destino', field: 'x_studio_salida_destino', foto: 'no' },
      SERVICIO_FINALIZADO,
    ],
  },

  isotanque_vacio: {
    key: 'isotanque_vacio',
    label: 'Isotanque vacío',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_retiro', label: 'Llegada a retiro', field: 'x_studio_llegada_a_retiro', foto: 'no' },
      { key: 'ingreso_retiro', label: 'Ingreso a retiro', field: 'x_studio_ingreso_a_retiro', foto: 'no' },
      { key: 'retiro_vacio', label: 'Retiro isotanque vacío', field: 'x_studio_retiro_isotanque_vacio', foto: 'si', criterio: 'Foto del isotanque y número.' },
      { key: 'salida_retiro', label: 'Salida retiro', field: 'x_studio_salida_retiro', foto: 'no' },
      { key: 'llegada_destino', label: 'Llegada destino', field: 'x_studio_llegada_destino', foto: 'no' },
      { key: 'ingreso_destino', label: 'Ingreso destino', field: 'x_studio_ingreso_destino', foto: 'no' },
      { key: 'entrega_vacio', label: 'Entrega isotanque vacío', field: 'x_studio_entrega_isotanque_vacio', foto: 'si', criterio: 'Foto de constancia o evidencia de entrega.' },
      SERVICIO_FINALIZADO,
    ],
  },

  devolucion_vacio: {
    key: 'devolucion_vacio',
    label: 'Solo devolución contenedor vacío',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_devolucion', label: 'Llegada a almacén/depósito de devolución', field: 'x_studio_llegada_a_almacendeposito_de_devolucion', foto: 'no' },
      { key: 'ingreso_devolucion', label: 'Ingreso a almacén/depósito de devolución', field: 'x_studio_ingreso_a_almacendeposito_de_devolucion', foto: 'no' },
      { key: 'contenedor_devuelto', label: 'Contenedor vacío devuelto', field: 'x_studio_contenedor_vacio_devuelto', foto: 'si', criterio: 'Foto del EIR, constancia o evidencia de devolución.' },
      SERVICIO_FINALIZADO,
    ],
  },

  // Subtarea de retiro de vacío en exportación (modalidad_de_retiro = "Otro
  // conductor"): el otro conductor retira el contenedor vacío del almacén y
  // lo deja en la cochera de la empresa; el conductor original lo recoge de
  // ahí y sigue con el servicio (por eso NO termina en "Servicio
  // finalizado" — el servicio como tal sigue con el otro conductor).
  retiro_vacio: {
    key: 'retiro_vacio',
    label: 'Retiro de vacío (exportación)',
    hitos: [
      INICIO_RUTA,
      { key: 'llegada_cola_retiro', label: 'Llegada/cola en almacén de retiro', field: 'x_studio_en_cola_de_ingreso', foto: 'no' },
      { key: 'ingreso_almacen_retiro', label: 'Ingreso almacén de retiro', field: 'x_studio_ingreso_a_almacen_de_retiro_1', foto: 'no' },
      { key: 'salida_almacen_retiro', label: 'Salida almacén de retiro', field: 'x_studio_salida_de_almacen_de_retiro', foto: 'si', criterio: 'Foto del contenedor retirado, número visible, estado exterior y precinto si aplica.' },
      LLEGADA_COCHERA,
      CONTENEDOR_DEJADO_COCHERA,
    ],
  },

  // Fallback para tareas sin ningún boolean de tipo marcado (registros antiguos).
  // Usa los campos genéricos que ya se venían escribiendo antes de este catálogo.
  generico: {
    key: 'generico',
    label: 'Servicio de transporte',
    hitos: [
      INICIO_RUTA,
      { key: 'en_cola_ingreso', label: 'En cola de ingreso', field: 'x_studio_en_cola_de_ingreso', foto: 'no' },
      { key: 'llegue_almacen', label: 'Llegué almacén', field: 'x_studio_ingreso_a_almacen_de_retiro_1', foto: 'no' },
      { key: 'salida_almacen', label: 'Salida almacén', field: 'x_studio_salida_de_almacen_de_retiro', foto: 'opcional' },
      { key: 'llegada_cliente', label: 'Llegada a cliente', field: 'x_studio_llegada_a_cliente', foto: 'no' },
      { key: 'ingreso_cliente', label: 'Ingreso a cliente', field: 'x_studio_ingreso_a_cliente', foto: 'no' },
      { key: 'inicio_cd', label: 'Inicio carga/descarga', field: 'x_studio_inicio_cargadescarga', foto: 'opcional' },
      { key: 'fin_cd', label: 'Fin carga/descarga', field: 'x_studio_termino_de_descarga', foto: 'opcional' },
      { key: 'salida_cliente', label: 'Salida de cliente', field: 'x_studio_salida_de_cliente', foto: 'no' },
      SERVICIO_FINALIZADO,
    ],
  },
}

/** Booleanos en project.task que determinan el tipo de servicio */
export const TIPO_SERVICIO_BOOL_FIELDS = [
  'x_studio_es_import',
  'x_studio_es_export',
  'x_studio_es_despacho',
  'x_studio_es_itk',
  'x_studio_es_isotanque_lleno',
  'x_studio_es_isotanque_vacio',
  'x_studio_es_tarea_de_devolucion_de_vacio',
  'x_studio_es_tarea_de_retiro_de_vacio',
] as const

export interface TaskTypeFlags {
  x_studio_es_import?: boolean
  x_studio_es_export?: boolean
  x_studio_es_despacho?: boolean
  x_studio_es_itk?: boolean
  x_studio_es_isotanque_lleno?: boolean
  x_studio_es_isotanque_vacio?: boolean
  x_studio_es_tarea_de_devolucion_de_vacio?: boolean
  x_studio_es_tarea_de_retiro_de_vacio?: boolean
  x_studio_almacen_de_devolucion?: unknown
  x_studio_modalidad_de_devolucion?: string | false
  x_studio_modalidad_de_retiro?: string | false
}

/**
 * Detecta el tipo de servicio a partir de los booleanos x_studio_es_* de Odoo.
 * `x_studio_es_tarea_de_devolucion_de_vacio` / `x_studio_es_tarea_de_retiro_de_vacio`
 * son los campos reales en Odoo (checkboxes) que marcan las subtareas de
 * devolución/retiro que se crean cuando el servicio principal queda con la
 * devolución (importación) o el retiro (exportación) a cargo de otro
 * conductor (ver FEATURES.MD §6). Se revisan primero porque son la señal
 * explícita; el almacén de devolución queda como fallback para registros
 * antiguos que no tienen el booleano marcado.
 */
export function detectTipoServicio(task: TaskTypeFlags): TipoServicioKey {
  if (task.x_studio_es_tarea_de_devolucion_de_vacio) return 'devolucion_vacio'
  if (task.x_studio_es_tarea_de_retiro_de_vacio) return 'retiro_vacio'
  if (task.x_studio_es_import) return 'importacion'
  if (task.x_studio_es_export) return 'exportacion'
  if (task.x_studio_es_despacho) return 'despacho'
  if (task.x_studio_es_itk) return 'traslado_interno'
  if (task.x_studio_es_isotanque_lleno) return 'isotanque_lleno'
  if (task.x_studio_es_isotanque_vacio) return 'isotanque_vacio'
  if (task.x_studio_almacen_de_devolucion) return 'devolucion_vacio'
  return 'generico'
}

/**
 * Devuelve los hitos a mostrar para una tarea.
 *
 * Importación + modalidad_de_devolucion = "Otro conductor" (se pregunta al
 * conductor justo al terminar "Salida de cliente"): la cola después de ese
 * punto cambia — en vez de manejar hasta el almacén/depósito de devolución,
 * solo deja el contenedor en la cochera de la empresa. No incluye "Servicio
 * finalizado": el servicio sigue con el otro conductor (vía la subtarea que
 * Odoo crea automáticamente).
 *
 * Exportación + modalidad_de_retiro = "Otro conductor" (esto NO se pregunta
 * en la app — se decide de antemano en Odoo, ver MODALIDAD_RETIRO_FIELD): la
 * cabecera cambia — el conductor original ya no pasa por almacén de retiro,
 * el contenedor vacío ya lo dejó el otro conductor en cochera, así que
 * arranca directo en "Llegada a cliente".
 */
export function getHitosForTask(task: TaskTypeFlags): HitoDef[] {
  const tipo = detectTipoServicio(task)
  let base = TIPOS_SERVICIO[tipo].hitos

  if (tipo === 'importacion' && task.x_studio_modalidad_de_devolucion === MODALIDAD_OTRO_CONDUCTOR) {
    const idxSalidaCliente = base.findIndex(h => h.key === 'salida_cliente')
    if (idxSalidaCliente !== -1) {
      base = [...base.slice(0, idxSalidaCliente + 1), LLEGADA_COCHERA, CONTENEDOR_DEJADO_COCHERA]
    }
  }

  if (tipo === 'exportacion' && task.x_studio_modalidad_de_retiro === MODALIDAD_OTRO_CONDUCTOR) {
    const idxLlegadaCliente = base.findIndex(h => h.key === 'llegada_cliente')
    if (idxLlegadaCliente !== -1) {
      base = [base[0], ...base.slice(idxLlegadaCliente)]
    }
  }

  return base
}

export function tipoServicioLabelFor(task: TaskTypeFlags): string {
  return TIPOS_SERVICIO[detectTipoServicio(task)].label
}

/** Lista única de todos los campos x_studio_* de hitos (para pedir a Odoo vía fields_get/search_read) */
export const ALL_HITO_FIELDS: string[] = Array.from(
  new Set([
    ...Object.values(TIPOS_SERVICIO).flatMap(t => t.hitos.map(h => h.field)),
    LLEGADA_COCHERA.field,
    CONTENEDOR_DEJADO_COCHERA.field,
  ])
)
