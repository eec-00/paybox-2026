// Datos sintéticos. Fórmula probada ≠ regla económica aprobada: las tarifas de
// estos casos son de prueba y salen de modas históricas, no de un tarifario.

import { describe, expect, it } from 'vitest'
import { calcularTarifa, type ServicioPago, type DevolucionPago } from './pagosConductores'
import { calcularAdicionales, totalAdicionales } from './adicionalesConductores'
import { GLOSARIO } from './glosarioConductores'
import {
  calcularMaquina, clasificarFilaHistorica, conceptoEnRevision, determinarSitioTarifa, evaluarCenaSsee,
  evaluarNocturnoCrosland, inicioSemanaPago, lineasDuplicadas, liquidarCrosland, resolverTarifa, resumirSemanas,
  type ReglaTarifa, type SitioServicio, type Tramo,
} from './motorConductores'

const A = 1
const B = 2
const VIERNES = '2026-10-16'
const SABADO = '2026-10-17'

const principal = (over: Partial<Tramo> = {}): Tramo => ({
  servicio: 'S09001', tipo: 'principal', conductorId: A, fechaEjecucion: VIERNES, acreditado: true, ...over,
})
const retorno = (over: Partial<Tramo> = {}): Tramo => ({
  servicio: 'S09001', tipo: 'retorno', conductorId: A, fechaEjecucion: VIERNES, acreditado: true,
  almacen: 'Almacén habitual', ...over,
})
const pagos = (lineas: { conductorId: number | null; monto: number | null }[]) =>
  lineas.map(l => [l.conductorId, l.monto])

describe('Glosario', () => {
  it('cubre G01–G14 y C01–C07', () => {
    const g = GLOSARIO.flatMap(c => c.glosario)
    for (let i = 1; i <= 14; i++) expect(g).toContain(`G${String(i).padStart(2, '0')}`)
    const c = GLOSARIO.flatMap(x => x.cierre?.split('/') ?? [])
    for (let i = 1; i <= 7; i++) expect(c).toContain(`C0${i}`)
  })

  it('C01, C03, C06 y C07 quedan en revisión', () => {
    for (const codigo of ['cena_ordinaria', 'crosland_nocturno', 'bono_ocho', 'descuento_no_devolucion']) {
      expect(GLOSARIO.find(c => c.codigo === codigo)?.activacion).toBe('revision')
    }
  })

  it('cada concepto tiene quien valida y código único', () => {
    for (const c of GLOSARIO) expect(c.validan.length).toBeGreaterThan(0)
    expect(new Set(GLOSARIO.map(c => c.codigo)).size).toBe(GLOSARIO.length)
  })
})

describe('Crosland', () => {
  it('T-04: A hace ambos tramos → S/90 en total', () => {
    expect(pagos(liquidarCrosland(principal(), retorno()))).toEqual([[A, 90]])
  })

  it('T-05: B retorno habitual → A 70 + B 20 = 90, no A90+B20', () => {
    expect(pagos(liquidarCrosland(principal(), retorno({ conductorId: B })))).toEqual([[A, 70], [B, 20]])
  })

  it('T-06: B retorno DPW/APMT → A 70 + B 30 = 100, sin tope 90', () => {
    for (const almacen of ['DPW Callao', 'APMT']) {
      expect(pagos(liquidarCrosland(principal(), retorno({ conductorId: B, almacen })))).toEqual([[A, 70], [B, 30]])
    }
  })

  it('T-01: A y B generan dos líneas sin duplicar tramo', () => {
    const lineas = liquidarCrosland(principal(), retorno({ conductorId: B }))
    expect(lineas).toHaveLength(2)
    expect(lineasDuplicadas(lineas)).toEqual([])
    expect(lineasDuplicadas([...lineas, lineas[1]])).toHaveLength(1)
    expect(() => resumirSemanas([...lineas, lineas[1]])).toThrow('duplicadas')
  })

  it('T-07 / C04: retorno extraordinario del mismo A no paga segundo base; SSEE es un solo S/30', () => {
    const base = liquidarCrosland(principal(), retorno({ extraordinario: true }))
    expect(pagos(base)).toEqual([[A, 90]])
    const cena = evaluarCenaSsee({ servicio: 'S09001', conductorId: A, fecha: VIERNES }, { citaDevolucion: 17 * 60, i11: true, eir: true })
    expect([cena.concepto, cena.monto, cena.estado]).toEqual(['cena_ssee', 30, 'simulado'])
    expect(lineasDuplicadas([...base, cena, cena])).toHaveLength(1)
  })

  it('C02: sin I11/EIR o cita antes de 17:00 → revisión', () => {
    const c = { servicio: 'S09001', conductorId: A, fecha: VIERNES }
    expect(evaluarCenaSsee(c, { citaDevolucion: 18 * 60, i11: false, eir: true }).estado).toBe('revision')
    expect(evaluarCenaSsee(c, { citaDevolucion: 18 * 60, i11: true, eir: false }).estado).toBe('revision')
    expect(evaluarCenaSsee(c, { citaDevolucion: 16 * 60 + 59, i11: true, eir: true }).estado).toBe('revision')
    expect(evaluarCenaSsee(c, { citaDevolucion: null, i11: true, eir: true }).monto).toBeNull()
  })

  it('T-08: tramo sin acreditar va a revisión, no a S/0', () => {
    for (const lineas of [
      liquidarCrosland(principal({ acreditado: false }), retorno()),
      liquidarCrosland(principal(), null),
      liquidarCrosland(principal(), retorno({ acreditado: false })),
    ]) {
      expect(lineas.map(l => [l.estado, l.monto])).toEqual([['revision', null]])
    }
  })

  it('B con retorno extraordinario o depósito sin verificar → A sí, B a revisión', () => {
    for (const r of [retorno({ conductorId: B, extraordinario: true }), retorno({ conductorId: B, almacen: null })]) {
      expect(liquidarCrosland(principal(), r).map(l => [l.conductorId, l.monto, l.estado]))
        .toEqual([[A, 70, 'simulado'], [B, null, 'revision']])
    }
  })
})

describe('Semana sábado–viernes', () => {
  it('RF-012: viernes cierra y sábado abre', () => {
    expect(inicioSemanaPago(SABADO)).toBe(SABADO)
    expect(inicioSemanaPago(VIERNES)).toBe('2026-10-10')
    expect(inicioSemanaPago('2026-10-22')).toBe(SABADO)
  })

  it('T-09: principal viernes A y retorno sábado B caen en semanas distintas', () => {
    const lineas = liquidarCrosland(principal(), retorno({ conductorId: B, fechaEjecucion: SABADO }))
    expect(lineas.map(l => l.servicio)).toEqual(['S09001', 'S09001'])
    expect(lineas.map(l => l.semana)).toEqual(['2026-10-10', SABADO])
    expect(resumirSemanas(lineas)).toEqual([
      { conductorId: A, semana: '2026-10-10', simulado: 70, enRevision: 0 },
      { conductorId: B, semana: SABADO, simulado: 20, enRevision: 0 },
    ])
  })

  it('RF-023: lo dudoso no bloquea lo correcto', () => {
    const lineas = [
      ...liquidarCrosland(principal(), retorno()),
      conceptoEnRevision({ servicio: 'S09001', conductorId: A, fecha: VIERNES }, 'cena_ordinaria'),
    ]
    expect(resumirSemanas(lineas)).toEqual([{ conductorId: A, semana: '2026-10-10', simulado: 90, enRevision: 1 }])
  })
})

describe('Lugar físico', () => {
  const sitio = (rol: SitioServicio['rol'], over: Partial<SitioServicio> = {}): SitioServicio => ({
    rol, nombre: 'Almacén', direccion: 'Av. Prueba 123', verificado: true, ruta: 'lurin', ...over,
  })

  it('T-02 importación: manda la entrega cargada, no zona comercial ni depósito', () => {
    const r = determinarSitioTarifa('importacion', [
      sitio('deposito_vacio', { ruta: 'callao' }),
      sitio('entrega_cargado', { nombre: 'Almacén San Miguel', ruta: 'lurin', zonaComercial: 'Zona 1' }),
    ])
    expect(r).toMatchObject({ ok: true, ruta: 'lurin' })
  })

  it('T-02 exportación: manda el recojo cargado, no retiro de vacío ni puerto', () => {
    const r = determinarSitioTarifa('exportacion', [
      sitio('deposito_vacio', { ruta: 'callao' }), sitio('puerto', { ruta: 'callao' }),
      sitio('recojo_cargado', { ruta: 'ate' }),
    ])
    expect(r).toMatchObject({ ok: true, ruta: 'ate' })
  })

  it('T-02: ambigüedad o dirección sin verificar → incidencia', () => {
    expect(determinarSitioTarifa('importacion', []).ok).toBe(false)
    expect(determinarSitioTarifa('importacion', [sitio('entrega_cargado'), sitio('entrega_cargado')]).ok).toBe(false)
    expect(determinarSitioTarifa('importacion', [sitio('entrega_cargado', { verificado: false })]).ok).toBe(false)
    expect(determinarSitioTarifa('importacion', [sitio('entrega_cargado', { direccion: null })]).ok).toBe(false)
  })

  it('HIST-04: un cliente con nombre de distrito no define la ruta', () => {
    const r = determinarSitioTarifa('importacion', [
      sitio('entrega_cargado', { nombre: 'San Miguel Industrias', ruta: 'cercado' }),
    ])
    expect(r).toMatchObject({ ok: true, ruta: 'cercado' })
  })
})

describe('Precedencia y vigencia', () => {
  const regla = (over: Partial<ReglaTarifa>): ReglaTarifa => ({
    id: 'r', nivel: 'ordinaria', ruta: 'lurin', operacion: 'importacion', tipoCarga: 'General',
    monto: 100, desde: '2026-01-01', hasta: null, aprobada: true, ...over,
  })
  const consulta = { clienteId: 7, ruta: 'lurin', operacion: 'importacion' as const, tipoCarga: 'General', fecha: '2026-03-10' }

  it('T-03: cliente + ruta > ruta especial > ordinaria', () => {
    const tarifario = [
      regla({ id: 'ord', monto: 100 }),
      regla({ id: 'esp', nivel: 'ruta', monto: 105 }),
      regla({ id: 'cli', nivel: 'cliente_ruta', clienteId: 7, monto: 120 }),
    ]
    expect(resolverTarifa(consulta, tarifario)).toMatchObject({ monto: 120, regla: { id: 'cli' } })
    expect(resolverTarifa({ ...consulta, clienteId: 8 }, tarifario)).toMatchObject({ monto: 105, regla: { id: 'esp' } })
    expect(resolverTarifa(consulta, tarifario.slice(0, 1))).toMatchObject({ monto: 100 })
  })

  it('T-03: tarifa sin aprobar, en conflicto o sin vigencia → revisión', () => {
    expect(resolverTarifa(consulta, [regla({ aprobada: false })]).estado).toBe('revision')
    expect(resolverTarifa(consulta, [regla({ id: 'x' }), regla({ id: 'y' })]).estado).toBe('revision')
    expect(resolverTarifa(consulta, [regla({ desde: '2026-04-01' })]).estado).toBe('revision')
  })

  const cambio = (monto1: number, monto2: number, corte: string, tipoCarga = 'General', ruta = 'lurin'): ReglaTarifa[] => [
    regla({ id: 'antes', monto: monto1, hasta: corte, tipoCarga, ruta }),
    regla({ id: 'despues', monto: monto2, desde: '2026-02-16', tipoCarga, ruta }),
  ]

  it('HIST-01 / W01: Crosland Ancón IMO 80 → 90 según fecha, sin reescribir febrero', () => {
    const t = cambio(80, 90, '2026-02-15', 'IMO', 'ancon')
    const q = { clienteId: 1, ruta: 'ancon', operacion: 'importacion' as const, tipoCarga: 'IMO' }
    expect(resolverTarifa({ ...q, fecha: '2026-02-12' }, t).monto).toBe(80)
    expect(resolverTarifa({ ...q, fecha: '2026-02-18' }, t).monto).toBe(90)
  })

  it('HIST-02 / W02–W03: Lurín segmenta por carga', () => {
    const t = [...cambio(90, 100, '2026-02-15'), ...cambio(90, 110, '2026-02-15', 'IMO'), ...cambio(90, 110, '2026-02-15', 'IQBF')]
    const q = { ...consulta, fecha: '2026-03-10' }
    expect(resolverTarifa(q, t).monto).toBe(100)
    expect(resolverTarifa({ ...q, tipoCarga: 'IMO' }, t).monto).toBe(110)
    expect(resolverTarifa({ ...q, tipoCarga: 'IQBF' }, t).monto).toBe(110)
    expect(resolverTarifa({ ...q, fecha: '2026-01-10' }, t).monto).toBe(90)
  })

  it('HIST-03 / W04: Ate estable S/80, y una moda sin aprobar no da importe', () => {
    const t = [regla({ ruta: 'ate', monto: 80 })]
    expect(resolverTarifa({ ...consulta, ruta: 'ate' }, t).monto).toBe(80)
    expect(resolverTarifa({ ...consulta, ruta: 'ate' }, [regla({ ruta: 'ate', monto: 80, aprobada: false })]).monto).toBeNull()
  })
})

describe('Adicionales bloqueados y Máquina', () => {
  const c = { servicio: 'S09001', conductorId: A, fecha: VIERNES }

  it('T-22: solo 21:30 → 23:00 da S/30; el resto va a revisión', () => {
    const ev = { finDescarga: 21 * 60 + 30, finDevolucion: 23 * 60, conCenaSsee: false }
    expect(evaluarNocturnoCrosland(c, ev)).toMatchObject({ monto: 30, estado: 'simulado' })
    expect(evaluarNocturnoCrosland(c, { ...ev, finDevolucion: 23 * 60 + 1 }).estado).toBe('revision')
    expect(evaluarNocturnoCrosland(c, { ...ev, finDescarga: 21 * 60 + 50 }).estado).toBe('revision')
  })

  it('T-22: nocturno no suma otro S/30 con Cena SSEE', () => {
    expect(evaluarNocturnoCrosland(c, { finDescarga: 21 * 60 + 30, finDevolucion: 23 * 60, conCenaSsee: true }).monto).toBeNull()
  })

  it('T-22 / C01: cena ordinaria no se genera', () => {
    expect(conceptoEnRevision(c, 'cena_ordinaria')).toMatchObject({ monto: null, estado: 'revision' })
  })

  it('T-24 / C06: el bono no se automatiza', () => {
    expect(conceptoEnRevision(c, 'bono_ocho').monto).toBeNull()
  })

  it('T-25 / C07: nunca crea un descuento', () => {
    const l = conceptoEnRevision(c, 'descuento_no_devolucion')
    expect(l.monto).toBeNull()
    expect(l.estado).toBe('revision')
  })

  it('un concepto activable no se puede bloquear por error', () => {
    expect(() => conceptoEnRevision(c, 'crosland_integral')).toThrow()
  })

  const dia = (n: number, over = {}) => ({ fecha: `2026-10-${10 + n}`, asistencia: true, servicio: true, ...over })

  it('T-23 / C05: S/5 por día válido, tope S/30', () => {
    expect(calcularMaquina('SEM', A, [dia(0), dia(1)])[0].monto).toBe(10)
    expect(calcularMaquina('SEM', A, [0, 1, 2, 3, 4, 5, 6].map(n => dia(n)))[0].monto).toBe(30)
  })

  it('T-23: sin servicio, sin asistencia o mantenimiento no paga', () => {
    const lineas = calcularMaquina('SEM', A, [dia(0), dia(1, { servicio: false }), dia(2, { asistencia: false }), dia(3, { mantenimiento: true })])
    expect(lineas[0].monto).toBe(5)
    expect(calcularMaquina('SEM', A, [dia(0, { servicio: false })])).toEqual([])
  })

  it('T-23: evidencia dudosa bloquea el día, no asume', () => {
    expect(calcularMaquina('SEM', A, [dia(0), dia(1, { evidenciaDudosa: true })])[0]).toMatchObject({ estado: 'revision', monto: null })
  })
})

describe('Retrospectivas W05–W14 y HIST-05/06', () => {
  const fila = (hoja: string, n: number, anotacion: string | number | null, base: number | null, total: number | null, fecha: string | null, mesHoja: string) =>
    clasificarFilaHistorica({ hoja, fila: n, anotacion, base, total, fecha, mesHoja, corte: '2026-10-24' })

  it.each([
    ['W05', 'SET SEM4', 9, '20 CENA', 90, 90, 'texto_no_sumado', 0],
    ['W06', 'SET SEM4', 89, '30 CENA SSEE', 70, 70, 'texto_no_sumado', 0],
    ['W07', 'SET SEM4', 4, '30 + 20', 90, 140, 'texto_sumado', 50],
    ['W08', 'SET SEM4', 51, 30, 90, 110, 'descuadre', 20],
    ['W09', 'SET SEM4', 330, 30, 90, 140, 'descuadre', 50],
    ['W10', 'AGOS SEM5', 142, 30, 20, 20, 'descuadre', 0],
    ['W11', 'FEBRERO SEM3', 39, 20, 160, 120, 'descuadre', -40],
    ['W12', 'MARZO SEM1', 97, 40, 110, 140, 'descuadre', 30],
  ] as const)('%s', (_, hoja, n, anot, base, total, clase, dif) => {
    const r = fila(hoja, n, anot, base, total, null, '2026-09')
    expect(r).toMatchObject({ clase, diferencia: dif, requiereRevision: true, anotacionOriginal: anot, origen: `${hoja}!${n}` })
  })

  it('W07: dos cifras sumadas alertan posible incompatibilidad', () => {
    expect(fila('SET SEM4', 4, '30 + 20', 90, 140, null, '2026-09').alertas).toContain('Varias cifras: posible acumulación incompatible')
  })

  it('W13: fecha posterior al corte', () => {
    const r = fila('OCT SEM1', 92, null, 90, 90, '2026-10-29', '2026-10')
    expect(r.clase).toBe('cuadra')
    expect(r.alertas).toEqual(['Fecha posterior al corte'])
    expect(r.requiereRevision).toBe(true)
  })

  it('W14: fecha 2025 en hoja de febrero 2026', () => {
    expect(fila('FEBRERO SEM2', 146, null, null, null, '2025-02-13', '2026-02').alertas).toEqual(['Fecha fuera del mes de la hoja'])
  })

  it('HIST-05: S anotada fuera del total no se vuelve deuda', () => {
    expect(fila('SETIEMBRE', 22, '30 CENA SSEE', 100, 100, null, '2026-09')).toMatchObject({ clase: 'texto_no_sumado', componentes: [30] })
  })

  it('HIST-06: «20 + 30» conserva componentes sin generar dos bonos', () => {
    expect(fila('SETIEMBRE', 146, '20 + 30', 90, 90, null, '2026-09')).toMatchObject({ clase: 'texto_no_sumado', componentes: [20, 30], requiereRevision: true })
  })

  it('base no numérica no se asume S/0', () => {
    expect(fila('X', 1, null, null, 90, null, '2026-09').clase).toBe('base_no_numerica')
  })

  it('fila limpia cuadra', () => {
    expect(fila('X', 1, 20, 90, 110, '2026-09-10', '2026-09')).toMatchObject({ clase: 'cuadra', requiereRevision: false })
  })
})

describe('Diferencias con el cálculo anterior (RF-040/042)', () => {
  const horarios = { inicio: null, fin: null, devolucion: null, linea: [] }
  const servicio = (over: Partial<ServicioPago> = {}): ServicioPago => ({
    id: 1, name: 'S09001 - Servicio', fecha: VIERNES, etapa: 'Servicio Finalizado', cliente: 'CROSLAND', clienteId: 7,
    conductorId: A, conductor: 'A', placa: null, horaCita: null, flujo: 'importacion',
    devolucionOtroConductor: true, horarios,
    atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 20', tipoCarga: 'General', zona: 'Zona 3' },
    ...over,
  })
  const devolucion = (almacen: string): DevolucionPago => ({
    id: 2, name: 'Devolución', etapa: 'Servicio Finalizado', conductorId: B, conductor: 'B', almacen, fecha: VIERNES,
    padreId: 1, padreName: 'S09001 - Servicio', padreConductorId: A, padreConductor: 'A',
  })
  const anterior = (almacen: string) =>
    calcularTarifa(servicio().atributos).monto! + totalAdicionales(calcularAdicionales([], [], [devolucion(almacen)]))
  const motor = (almacen: string) =>
    liquidarCrosland(principal(), retorno({ conductorId: B, almacen })).reduce((s, l) => s + l.monto!, 0)

  it('T-05: el anterior paga A90+B20=110; el motor 90', () => {
    expect([anterior('Almacén habitual'), motor('Almacén habitual')]).toEqual([110, 90])
  })

  it('T-06: el anterior paga A90+B30=120; el motor 100', () => {
    expect([anterior('DPW Callao'), motor('DPW Callao')]).toEqual([120, 100])
  })

  it('T-02: el anterior cambia de monto solo por la etiqueta de zona', () => {
    const a = servicio().atributos
    expect([calcularTarifa({ ...a, zona: 'Zona 1' }).monto, calcularTarifa({ ...a, zona: 'Zona 4' }).monto]).toEqual([70, 100])
  })
})
