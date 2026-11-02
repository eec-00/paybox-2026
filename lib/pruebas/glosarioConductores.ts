// ============================================================================
// Glosario de conceptos de pago a conductores (módulo Pruebas), versionado.
//
// Fuentes: glosario G01–G14 v0.2 (16/10), matriz RF-001–RF-048 (20/10), cierres
// C01–C07 (19/10) y caso C03 (21/10). implementationAuthorization=false: nada de
// esto autoriza pagos reales. Prevalece la decisión más reciente del responsable.
//
//   activacion 'simulacion': el motor calcula el importe para pruebas.
//   activacion 'revision':   el motor nunca da importe; va a revisión humana.
// ============================================================================

export const VERSION_GLOSARIO = '2026-10-23'

export type NaturalezaConcepto = 'tarifa_base' | 'adicional' | 'reembolso' | 'descuento' | 'control'
export type Activacion = 'simulacion' | 'revision'

export interface ConceptoGlosario {
  codigo: string
  nombre: string
  naturaleza: NaturalezaConcepto
  /** Importe de referencia; null si no hay uno homologado */
  monto: number | null
  unidad: string
  condiciones: string[]
  evidencias: string[]
  noAcumulaCon: string[]
  activacion: Activacion
  /** Estado tal como figura en la matriz */
  estadoFuente: string
  validan: string[]
  rf: string[]
  glosario: string[]
  cierre: string | null
  pruebas: string[]
}

export const GLOSARIO: ConceptoGlosario[] = [
  {
    codigo: 'tarifa_zona_fisica', nombre: 'Tarifa por lugar físico', naturaleza: 'tarifa_base',
    monto: null, unidad: 'por servicio',
    condiciones: [
      'Importación: lugar físico de entrega del contenedor cargado',
      'Exportación: lugar físico de recojo del contenedor cargado en cliente',
      'Precedencia: cliente + ruta > ruta especial > ordinaria, con vigencia',
    ],
    evidencias: ['Dirección verificada'], noAcumulaCon: [],
    activacion: 'revision', estadoFuente: 'CONFIRMADA FUNCIONAL; TARIFARIO PENDIENTE',
    validan: ['Margiory', 'Rosario', 'Operaciones'], rf: ['RF-002', 'RF-003', 'RF-004', 'RF-005'],
    glosario: [], cierre: null, pruebas: ['T-02', 'T-03'],
  },
  {
    codigo: 'crosland_integral', nombre: 'Crosland integral mismo conductor', naturaleza: 'tarifa_base',
    monto: 90, unidad: 'por servicio',
    condiciones: ['A ejecuta principal y retorno', 'No se suma devolución base'],
    evidencias: ['Ambos tramos acreditados'], noAcumulaCon: ['crosland_principal', 'crosland_retorno'],
    activacion: 'simulacion', estadoFuente: 'CONFIRMADA ECONÓMICA; NO GO-LIVE',
    validan: ['Margiory', 'Rosario'], rf: ['RF-006'], glosario: [], cierre: null, pruebas: ['T-04'],
  },
  {
    codigo: 'crosland_principal', nombre: 'Crosland principal con retorno de otro', naturaleza: 'tarifa_base',
    monto: 70, unidad: 'por tramo',
    condiciones: ['B ejecutó realmente el retorno'], evidencias: ['Tramo acreditado'],
    noAcumulaCon: ['crosland_integral'],
    activacion: 'simulacion', estadoFuente: 'CONFIRMADA ECONÓMICA; NO GO-LIVE',
    validan: ['Margiory', 'Rosario', 'Operaciones'], rf: ['RF-007', 'RF-008'], glosario: ['G08'],
    cierre: null, pruebas: ['T-05', 'T-06'],
  },
  {
    codigo: 'crosland_retorno', nombre: 'Crosland retorno por otro conductor', naturaleza: 'tarifa_base',
    monto: 20, unidad: 'por tramo',
    condiciones: ['S/20 almacén habitual', 'S/30 si devuelve en DPW/APMT (total S/100, sin tope S/90)'],
    evidencias: ['Depósito verificado', 'Conductor real'], noAcumulaCon: ['crosland_integral'],
    activacion: 'simulacion', estadoFuente: 'CONFIRMADA ECONÓMICA; NO GO-LIVE. A60+B30 de G08 OBSOLETO',
    validan: ['Margiory', 'Rosario', 'Operaciones'], rf: ['RF-007', 'RF-008'], glosario: ['G08'],
    cierre: null, pruebas: ['T-05', 'T-06'],
  },
  {
    codigo: 'cena_ordinaria', nombre: 'Cena ordinaria', naturaleza: 'adicional',
    monto: 20, unidad: 'por día',
    condiciones: ['Margiory: fin descarga o salida > 19:00', 'Rosario: influye la cita inicial (sin acuerdo)'],
    evidencias: ['Hito operativo real'], noAcumulaCon: ['pernocte'],
    activacion: 'revision', estadoFuente: 'MARGIORY CONFIRMÓ; ROSARIO NO CERRÓ',
    validan: ['Margiory', 'Rosario'], rf: ['RF-033'], glosario: ['G01'], cierre: 'C01', pruebas: ['T-22'],
  },
  {
    codigo: 'cena_ssee', nombre: 'Cena SSEE / retorno extraordinario', naturaleza: 'adicional',
    monto: 30, unidad: 'una sola vez',
    condiciones: ['Un solo concepto, no dos bonos', 'Cita de devolución desde 17:00', 'Mismo A: base incluida en integral'],
    evidencias: ['I11', 'EIR'], noAcumulaCon: ['crosland_nocturno'],
    activacion: 'simulacion', estadoFuente: 'MARGIORY CONFIRMÓ; FALTA CIERRE ROSARIO',
    validan: ['Margiory', 'Rosario'], rf: ['RF-009', 'RF-034', 'RF-036'], glosario: ['G02', 'G09'],
    cierre: 'C02/C04', pruebas: ['T-07'],
  },
  {
    codigo: 'programacion_0300', nombre: 'Programación exacta 03:00', naturaleza: 'adicional',
    monto: 20, unidad: 'por día',
    condiciones: ['Cita de retiro 03:00 y salida acreditada', 'No aplica 03:30'],
    evidencias: ['Hora de cita', 'Hora de salida'], noAcumulaCon: ['pernocte'],
    activacion: 'revision', estadoFuente: 'A03 APROBADA COMO DEFINICIÓN; FALTA TOLERANCIA Y P06 ROSARIO',
    validan: ['Margiory', 'Rosario'], rf: [], glosario: ['G03'], cierre: null, pruebas: [],
  },
  {
    codigo: 'pernocte', nombre: 'Amanecida / pernocte general', naturaleza: 'adicional',
    monto: 40, unidad: 'por evento',
    condiciones: ['Pernocte operativo real', 'No se infiere solo por cruzar medianoche'],
    evidencias: ['Caso documentado'], noAcumulaCon: ['cena_ordinaria', 'programacion_0300'],
    activacion: 'revision', estadoFuente: 'A04 APROBADA COMO DEFINICIÓN; FALTA CONTRASTE LABORAL',
    validan: ['Margiory', 'Rosario', 'Sandra'], rf: ['RF-029'], glosario: ['G04'], cierre: null, pruebas: [],
  },
  {
    codigo: 'crosland_nocturno', nombre: 'Crosland nocturnidad', naturaleza: 'adicional',
    monto: 30, unidad: 'por caso',
    condiciones: ['Solo confirmado: descarga 21:30 y devolución hasta 23:00', 'Sin umbral general; S/50 tras medianoche sigue propuesta'],
    evidencias: ['Horario de trabajo y devolución'], noAcumulaCon: ['cena_ssee'],
    activacion: 'revision', estadoFuente: 'CASO PUNTUAL CONFIRMADO; REGLA ABIERTA',
    validan: ['Rosario', 'Margiory', 'Operaciones'], rf: ['RF-035'], glosario: ['G05', 'G06', 'G07'],
    cierre: 'C03', pruebas: ['T-22'],
  },
  {
    codigo: 'maquina', nombre: 'Máquina', naturaleza: 'adicional',
    monto: 5, unidad: 'por día, máximo S/30 semana',
    condiciones: ['Día con asistencia y servicio', 'Mantenimiento o sin servicio no paga', 'Separado del precio del servicio'],
    evidencias: ['Jornadas acreditadas'], noAcumulaCon: [],
    activacion: 'simulacion', estadoFuente: 'COINCIDENCIA MATERIAL; CIERRE ROSARIO PENDIENTE',
    validan: ['Rosario', 'Margiory', 'Operaciones'], rf: ['RF-037'], glosario: ['G10'], cierre: 'C05', pruebas: ['T-23'],
  },
  {
    codigo: 'bono_ocho', nombre: 'Bono de ocho integrales', naturaleza: 'adicional',
    monto: 100, unidad: 'por semana',
    condiciones: ['Base confirmada; cómputo no', 'Margiory: mantener ITK actual y cruzado si registrado'],
    evidencias: ['Integrales acreditados por conductor y semana'], noAcumulaCon: [],
    activacion: 'revision', estadoFuente: 'MARGIORY RESPONDIÓ C06; ROSARIO PENDIENTE',
    validan: ['Margiory', 'Rosario', 'Sandra'], rf: ['RF-038'], glosario: ['G11'], cierre: 'C06', pruebas: ['T-24'],
  },
  {
    codigo: 'viatico_provincia', nombre: 'Viático provincia', naturaleza: 'adicional',
    monto: 35, unidad: 'por servicio',
    condiciones: ['Fuera de Lima/Callao, excluido Chancay', 'Autorización previa'],
    evidencias: ['Comprobantes'], noAcumulaCon: [],
    activacion: 'revision', estadoFuente: 'A12 APROBADA COMO DEFINICIÓN; PAGO NO ACREDITADO',
    validan: ['Margiory', 'Rosario', 'Sandra'], rf: [], glosario: ['G12'], cierre: null, pruebas: [],
  },
  {
    codigo: 'gasto_sustentado', nombre: 'Gasto reembolsable', naturaleza: 'reembolso',
    monto: null, unidad: 'monto real sustentado',
    condiciones: ['ID único', 'Reembolso individual O semanal, nunca ambos', 'No es bono ni segunda línea de costo'],
    evidencias: ['Comprobante', 'Vínculo al pago'], noAcumulaCon: [],
    activacion: 'simulacion', estadoFuente: 'CONFIRMADA FUNCIONAL; LABORAL POR VALIDAR',
    validan: ['Rosario', 'Sandra', 'Contabilidad'], rf: ['RF-021', 'RF-022'], glosario: ['G13'], cierre: null, pruebas: ['T-15'],
  },
  {
    codigo: 'control_documental', nombre: 'Documentación y conciliación', naturaleza: 'control',
    monto: null, unidad: 'no es importe',
    condiciones: ['Falta de hito no anula devengo real', 'Calculado, autorizado, pagado y conciliado son estados distintos'],
    evidencias: ['Guías', 'EIR', 'Hitos', 'Pago'], noAcumulaCon: [],
    activacion: 'simulacion', estadoFuente: 'CONTROL CONFIRMADO',
    validan: ['Rosario', 'Operaciones'], rf: ['RF-010', 'RF-018', 'RF-023'], glosario: ['G14'], cierre: null, pruebas: ['T-08', 'T-13'],
  },
  {
    codigo: 'descuento_no_devolucion', nombre: 'Descuento por no devolución', naturaleza: 'descuento',
    monto: 20, unidad: 'histórico, no autorizado',
    condiciones: ['Excepción con causa y autorización', 'Jamás automático por ausencia de devolución'],
    evidencias: ['Causa operacional', 'Fundamento laboral'], noAcumulaCon: [],
    activacion: 'revision', estadoFuente: 'MARGIORY PROPUSO; ROSARIO + LEGAL PENDIENTES',
    validan: ['Sandra', 'Rosario', 'Margiory'], rf: ['RF-039'], glosario: ['G14'], cierre: 'C07', pruebas: ['T-25'],
  },
]

export function concepto(codigo: string): ConceptoGlosario {
  const c = GLOSARIO.find(x => x.codigo === codigo)
  if (!c) throw new Error(`Concepto desconocido: ${codigo}`)
  return c
}
