import { describe, expect, it } from 'vitest'
import { calcularAdicionales, integralidad, totalAdicionales, type Adicional } from './adicionalesConductores'
import type { AsistenciaPago, DevolucionPago, GastoPago, ServicioPago } from './pagosConductores'

const H = (h: number, m = 0) => h * 60 + m

const IMPORT_KEYS = ['inicio_ruta', 'ingreso_cliente', 'inicio_descarga', 'fin_descarga', 'salida_cliente',
  'llegada_devolucion', 'ingreso_devolucion', 'contenedor_devuelto', 'servicio_finalizado']
const DESPACHO_KEYS = ['inicio_ruta', 'salida_origen', 'llegada_destino', 'ingreso_destino', 'fin_descarga', 'salida_destino', 'servicio_finalizado']

let id = 0
function servicio(over: Partial<ServicioPago> & { horas?: Record<string, number | null> } = {}): ServicioPago {
  const { horas = {}, ...rest } = over
  const flujo = rest.flujo ?? 'importacion'
  const keys = flujo === 'despacho' ? DESPACHO_KEYS : IMPORT_KEYS
  id++
  return {
    id, name: `S0${String(1000 + id)} - Servicio`, fecha: '2026-11-10', etapa: 'Servicio Finalizado', cliente: 'CLIENTE',
    clienteId: 1, conductorId: 1, conductor: 'A', placa: null, horaCita: null, flujo, devolucionOtroConductor: false,
    atributos: { tipoServicio: flujo === 'despacho' ? 'Despacho' : 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', zona: 'Zona 3' },
    horarios: { inicio: null, fin: null, devolucion: null, linea: keys.map(key => ({ key, label: key, min: horas[key] ?? null, real: true })) },
    ...rest,
  }
}

const completo = (extra: Record<string, number | null> = {}) => ({
  inicio_ruta: H(6), ingreso_cliente: H(9), inicio_descarga: H(10), fin_descarga: H(12), salida_cliente: H(12, 30),
  llegada_devolucion: H(14), ingreso_devolucion: H(14, 20), contenedor_devuelto: H(15), ...extra,
})

function calc(servicios: ServicioPago[], o: { devoluciones?: DevolucionPago[]; asistencias?: AsistenciaPago[]; gastos?: GastoPago[]; conductorId?: number } = {}) {
  return calcularAdicionales({
    servicios, devoluciones: o.devoluciones ?? [], todos: servicios, conductorId: o.conductorId ?? 1,
    asistencias: o.asistencias ?? [], gastos: o.gastos ?? [],
  })
}
const de = (lista: Adicional[], c: Adicional['concepto']) => lista.filter(a => a.concepto === c)

describe('01 · Cena', () => {
  it('I08 después de las 19:00 → S/20 simulado', () => {
    const [c] = de(calc([servicio({ horas: completo({ fin_descarga: H(19, 30) }) })]), 'cena')
    expect(c).toMatchObject({ estado: 'simulado', monto: 20, hitos: ['I08'] })
  })

  it('I08 antes de las 19:00 pero siguió trabajando → revisión', () => {
    const [c] = de(calc([servicio({ horas: completo({ fin_descarga: H(18), contenedor_devuelto: H(20) }) })]), 'cena')
    expect(c).toMatchObject({ estado: 'requiere_revision', monto: null })
  })

  it('todo antes de las 19:00 → no hay cena', () => {
    expect(de(calc([servicio({ horas: completo() })]), 'cena')).toHaveLength(0)
  })

  it('el cierre administrativo tarde no activa la cena', () => {
    expect(de(calc([servicio({ horas: completo({ servicio_finalizado: H(23) }) })]), 'cena')).toHaveLength(0)
  })

  it('despacho usa D10', () => {
    const [c] = de(calc([servicio({ flujo: 'despacho', horas: { fin_descarga: H(20) } })]), 'cena')
    expect(c).toMatchObject({ estado: 'simulado', hitos: ['D10'] })
  })

  it('segunda cena del mismo día queda en revisión', () => {
    const lista = de(calc([servicio({ horas: completo({ fin_descarga: H(20) }) }), servicio({ horas: completo({ fin_descarga: H(21) }) })]), 'cena')
    expect(lista.map(c => c.estado)).toEqual(['simulado', 'requiere_revision'])
  })
})

describe('02 · ADHT', () => {
  it('siempre en revisión, mostrando I10 → I12', () => {
    const [a] = de(calc([servicio({ horas: completo() })]), 'adht')
    expect(a).toMatchObject({ estado: 'requiere_revision', monto: null })
    expect(a.detalle).toMatch(/I10 .* → I11 .* → I12/)
  })
})

describe('03/04/05 · Crosland', () => {
  const crosland = (horas: Record<string, number | null>, over: Partial<ServicioPago> = {}) =>
    servicio({ cliente: 'CROSLAND MOTOS', horas: completo(horas), ...over })

  it('decide I09: descarga antes de las 22:00 pero salida 22:15 → S/30', () => {
    const [n] = de(calc([crosland({ fin_descarga: H(21, 40), salida_cliente: H(22, 15) })]), 'crosland_nocturno')
    expect(n).toMatchObject({ estado: 'simulado', monto: 30, hitos: ['I06', 'I09'] })
  })

  it('I09 antes de las 22:00 → no hay nocturno aunque I08 sea tarde', () => {
    expect(de(calc([crosland({ fin_descarga: H(21, 50), salida_cliente: H(21, 58) })]), 'crosland_nocturno')).toHaveLength(0)
  })

  it('caso Margiory: I07 21:50, I08 00:30 → S/50 que sustituye S/30', () => {
    const lista = calc([crosland({ inicio_descarga: H(21, 50), fin_descarga: H(24, 30) })])
    expect(de(lista, 'crosland_medianoche')[0]).toMatchObject({ estado: 'simulado', monto: 50 })
    expect(de(lista, 'crosland_nocturno')).toHaveLength(0)
    expect(de(lista, 'cena')[0]).toMatchObject({ monto: 20 })
  })

  it('caso Rosario: I08 21:30 → I12 23:00 → S/30 y sin ADHT', () => {
    const lista = calc([crosland({ fin_descarga: H(21, 30), contenedor_devuelto: H(23) })])
    expect(de(lista, 'crosland_devolucion')[0]).toMatchObject({ estado: 'simulado', monto: 30 })
    expect(de(lista, 'adht')).toHaveLength(0)
  })

  it('otra hora no se extrapola: I08 20:00 → I12 23:00 → revisión', () => {
    const [d] = de(calc([crosland({ fin_descarga: H(20), contenedor_devuelto: H(23) })]), 'crosland_devolucion')
    expect(d.estado).toBe('requiere_revision')
  })

  it('sin I06 → revisión', () => {
    const [n] = de(calc([crosland({ ingreso_cliente: null, fin_descarga: H(22), salida_cliente: H(22, 30) })]), 'crosland_nocturno')
    expect(n.estado).toBe('requiere_revision')
  })
})

describe('06 · TDC fuera de Crosland', () => {
  it('B devuelve el contenedor de otro cliente → revisión', () => {
    const padre = servicio({ conductorId: 1, devolucionOtroConductor: true })
    const d: DevolucionPago = {
      id: 99, name: 'Dev', etapa: 'Servicio Finalizado', conductorId: 2, conductor: 'B', almacen: 'DPW', fecha: '2026-11-10',
      padreId: padre.id, padreName: padre.name, padreConductorId: 1, padreConductor: 'A', devueltoMin: H(16),
    }
    const lista = calcularAdicionales({ servicios: [], devoluciones: [d], todos: [padre], conductorId: 2, asistencias: [], gastos: [] })
    expect(de(lista, 'tdc')[0]).toMatchObject({ estado: 'requiere_revision', monto: null })
  })

  it('Crosland no genera TDC aquí (va en la tarifa base)', () => {
    const padre = servicio({ cliente: 'CROSLAND', devolucionOtroConductor: true })
    const d: DevolucionPago = {
      id: 98, name: 'Dev', etapa: 'Servicio Finalizado', conductorId: 2, conductor: 'B', almacen: 'DPW', fecha: '2026-11-10',
      padreId: padre.id, padreName: padre.name, padreConductorId: 1, padreConductor: 'A', devueltoMin: H(16),
    }
    expect(calcularAdicionales({ servicios: [], devoluciones: [d], todos: [padre], conductorId: 2, asistencias: [], gastos: [] })).toEqual([])
  })
})

describe('07 · Retiro 03:00', () => {
  it('cita 03:00 con I01 → S/20', () => {
    expect(de(calc([servicio({ horaCita: H(3), horas: completo({ inicio_ruta: H(2, 20) }) })]), 'retiro_0300')[0])
      .toMatchObject({ estado: 'simulado', monto: 20 })
  })
  it('cita 03:30 no aplica', () => {
    expect(de(calc([servicio({ horaCita: H(3, 30), horas: completo() })]), 'retiro_0300')).toHaveLength(0)
  })
  it('I01 sin ubicación registrada → revisión (la salida se comprueba, no se asume)', () => {
    const s = servicio({ horaCita: H(3), horas: completo({ inicio_ruta: H(2, 20) }) })
    s.horarios.linea = s.horarios.linea.map(h => h.key === 'inicio_ruta' ? { ...h, real: false } : h)
    const [r] = de(calc([s]), 'retiro_0300')
    expect(r.estado).toBe('requiere_revision')
    expect(r.detalle).toMatch(/I01 02:20 \(sin ubicación\)/)
  })
  it('sin I01 → revisión', () => {
    expect(de(calc([servicio({ horaCita: H(3), horas: completo({ inicio_ruta: null }) })]), 'retiro_0300')[0].estado).toBe('requiere_revision')
  })
})

describe('09 · Máquina', () => {
  const dias = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
  it('S/5 por día con asistencia + servicio, máximo S/30', () => {
    const servicios = dias.map(fecha => servicio({ fecha, horas: completo() }))
    const asistencias = dias.map(fecha => ({ conductorId: 1, fecha, salida: true }))
    expect(de(calc(servicios, { asistencias }), 'maquina')[0]).toMatchObject({ estado: 'simulado', monto: 30 })
  })
  it('día sin servicio no cuenta; sin salida tampoco', () => {
    const servicios = [servicio({ fecha: '2026-11-10', horas: completo() }), servicio({ fecha: '2026-11-11', horas: completo() })]
    const asistencias = [
      { conductorId: 1, fecha: '2026-11-09', salida: true },
      { conductorId: 1, fecha: '2026-11-10', salida: true },
      { conductorId: 1, fecha: '2026-11-11', salida: false },
    ]
    const [m] = de(calc(servicios, { asistencias }), 'maquina')
    expect(m).toMatchObject({ estado: 'simulado', monto: 5 })
    expect(m.detalle).toMatch(/sin salida marcada: 2026-11-11/)
  })
})

describe('10 · Bono', () => {
  it('8 integrales → S/100', () => {
    expect(de(calc(Array.from({ length: 8 }, () => servicio({ horas: completo() }))), 'bono')[0]).toMatchObject({ estado: 'simulado', monto: 100 })
  })
  it('7 integrales + 1 con devolución por B → revisión', () => {
    const lista = [...Array.from({ length: 7 }, () => servicio({ horas: completo() })), servicio({ devolucionOtroConductor: true, horas: completo() })]
    expect(de(calc(lista), 'bono')[0]).toMatchObject({ estado: 'requiere_revision', monto: null })
  })
  it('sin I12 propio no es integral', () => {
    expect(integralidad(servicio({ horas: completo({ contenedor_devuelto: null }) }))).toBe('no')
  })
  it('despacho exige el flujo completo (D11 solo no basta)', () => {
    expect(integralidad(servicio({ flujo: 'despacho', horas: { salida_destino: H(15) } }))).toBe('no')
  })
})

describe('11 · Viático', () => {
  it('provincia → revisión, nunca simulado', () => {
    const [v] = de(calc([servicio({ flujo: 'despacho', atributos: { tipoServicio: 'Despacho', modalidad: 'Carga Suelta', tipoCarga: 'General', zona: 'Provincia' } })]), 'viatico')
    expect(v).toMatchObject({ estado: 'requiere_revision', monto: null })
  })
})

describe('12 · Gastos', () => {
  const gasto = (over: Partial<GastoPago>): GastoPago => ({
    id: 'g', servicioId: 0, servicio: 'S01001 - x', conductorId: 1, conductor: 'A', descripcion: 'Peaje', monto: 12.5,
    moneda: 'soles', estado: 'pendiente', fotos: 1, fecha: '2026-11-10', ...over,
  })
  it('pendiente con comprobante → simulado; pagado → no suma; sin foto → revisión', () => {
    const lista = calc([], { gastos: [gasto({ id: '1' }), gasto({ id: '2', estado: 'pagado' }), gasto({ id: '3', fotos: 0 })] })
    expect(de(lista, 'gasto').map(g => g.estado)).toEqual(['simulado', 'pagado', 'requiere_revision'])
    expect(totalAdicionales(lista)).toBe(12.5)
  })
  it('dólares → revisión', () => {
    expect(de(calc([], { gastos: [gasto({ moneda: 'dolares' })] }), 'gasto')[0].estado).toBe('requiere_revision')
  })
})

describe('13 · No devolución', () => {
  it('importación cerrada sin I12 → incidencia sin monto', () => {
    const [n] = de(calc([servicio({ horas: completo({ contenedor_devuelto: null }) })]), 'no_devolucion')
    expect(n).toMatchObject({ estado: 'requiere_revision', monto: null })
  })
  it('con I12 no hay incidencia', () => {
    expect(de(calc([servicio({ horas: completo() })]), 'no_devolucion')).toHaveLength(0)
  })
})

describe('total', () => {
  it('solo suma lo simulado; nunca hay montos negativos (sin descuentos)', () => {
    const lista = calc([servicio({ cliente: 'CROSLAND', horas: completo({ fin_descarga: H(24, 30), contenedor_devuelto: null }) })])
    expect(lista.every(a => a.monto === null || a.monto > 0)).toBe(true)
    expect(totalAdicionales(lista)).toBe(lista.filter(a => a.estado === 'simulado').reduce((t, a) => t + a.monto!, 0))
  })
})
