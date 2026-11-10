import { describe, expect, it } from 'vitest'
import {
  CASOS_DEMO, REGLAS_ORDINARIAS, TARIFARIO, entradaDesdeOdoo, lineasDuplicadas, simularTarifa, type EntradaMotor,
} from './motorZonas'
import type { DevolucionPago, ServicioPago } from './pagosConductores'

const caso = (servicio: string): EntradaMotor => CASOS_DEMO.find(c => c.entrada.servicio === servicio)!.entrada
const correr = (servicio: string) => simularTarifa(caso(servicio))

describe('catálogo', () => {
  it('ids únicos y numeración de la hoja 13', () => {
    const ids = TARIFARIO.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const regla = (id: string) => REGLAS_ORDINARIAS.find(r => r.id === id)!
    expect(regla('ORD-16')).toMatchObject({ distrito: 'Ate', monto: 80, cargas: ['General'] })
    expect(regla('ORD-19')).toMatchObject({ distrito: 'San Juan de Lurigancho', monto: 90 })
    expect(regla('ORD-34')).toMatchObject({ distrito: 'Lurín', monto: 100 })
    expect(regla('ORD-35')).toMatchObject({ distrito: 'Lurín', monto: 110 })
  })

  it('ninguna regla está homologada: nada llega a calculado', () => {
    expect(TARIFARIO.every(r => !r.homologada)).toBe(true)
    expect(CASOS_DEMO.every(c => simularTarifa(c.entrada).estado !== 'calculado')).toBe(true)
  })

  it('cada caso demo da lo que promete', () => {
    for (const c of CASOS_DEMO) {
      const r = simularTarifa(c.entrada)
      if (c.esperado.startsWith('Requiere revisión')) expect(r.estado, c.titulo).toBe('requiere_revision')
      else expect(r.estado, c.titulo).toBe('propuesto')
    }
  })
})

describe('P1 · Zona 4: Ate frente a San Juan de Lurigancho', () => {
  it('Ate → S/80 propuesto por ORD-16', () => {
    expect(correr('S90001')).toMatchObject({ estado: 'propuesto', total: 80, ruleIds: ['ORD-16'] })
  })

  it('SJL → S/90 por ORD-19, misma zona', () => {
    const r = correr('S90002')
    expect(r).toMatchObject({ estado: 'propuesto', total: 90, ruleIds: ['ORD-19'] })
    expect(r.alertas.join(' ')).toMatch(/sin homologar/)
  })

  it('sin dirección acreditada → revisión sin importe', () => {
    const r = correr('S90003')
    expect(r).toMatchObject({ estado: 'requiere_revision', total: null, ruleIds: [] })
    expect(r.lineas.every(l => l.monto === null)).toBe(true)
    expect(r.motivos[0]).toMatch(/Destino físico/)
  })

  it('destino declarado pero no acreditado → revisión', () => {
    const r = simularTarifa({ ...caso('S90001'), destino: { distrito: 'Ate', acreditado: false, fuente: 'nombre de tarea' } })
    expect(r.estado).toBe('requiere_revision')
  })

  it('distrito sin literal (Bellavista) no hereda Callao', () => {
    const r = simularTarifa({ ...caso('S90001'), zona: 'Zona 1', destino: { distrito: 'Bellavista', acreditado: true, fuente: 'x' } })
    expect(r).toMatchObject({ estado: 'requiere_revision', total: null })
  })
})

describe('P2 · Crosland', () => {
  it('A integral → una línea S/90 CR-01, sin retorno', () => {
    const r = correr('S90011')
    expect(r).toMatchObject({ estado: 'propuesto', total: 90, ruleIds: ['CR-01'] })
    expect(r.lineas).toHaveLength(1)
  })

  it('A principal + B ordinaria → 70 + 20, sin integral para A', () => {
    const r = correr('S90012')
    expect(r).toMatchObject({ estado: 'propuesto', total: 90, ruleIds: ['CR-02', 'CR-03'] })
    expect(r.lineas.map(l => [l.conductorId, l.monto])).toEqual([[101, 70], [102, 20]])
  })

  it('B devuelve en DPW → 70 + 30', () => {
    expect(correr('S90013')).toMatchObject({ total: 100, ruleIds: ['CR-02', 'CR-04'] })
  })

  it('devolución sin acreditar → nadie cobra', () => {
    expect(correr('S90014')).toMatchObject({ estado: 'requiere_revision', total: null, ruleIds: [] })
  })

  it('no aplica la tarifa de Ancón aunque haya destino acreditado', () => {
    const r = simularTarifa({ ...caso('S90011'), destino: { distrito: 'Ancón', acreditado: true, fuente: 'x' } })
    expect(r.ruleIds).toEqual(['CR-01'])
  })

  it('Crosland exportación no entra en CR-01..04', () => {
    expect(simularTarifa({ ...caso('S90011'), tipoServicio: 'Exportación' }).estado).toBe('requiere_revision')
  })

  it('identificado por nombre deja alerta de ID faltante', () => {
    expect(correr('S90011').alertas.join(' ')).toMatch(/ID de Odoo/)
  })
})

describe('P3 · Lurín: carga y vigencia', () => {
  it('General S/100, IMO S/110', () => {
    expect(correr('S90021')).toMatchObject({ total: 100, ruleIds: ['ORD-34'] })
    expect(correr('S90022')).toMatchObject({ total: 110, ruleIds: ['ORD-35'] })
  })

  it('IQBF también va por ORD-35', () => {
    expect(simularTarifa({ ...caso('S90022'), tipoCarga: 'IQBF' }).ruleIds).toEqual(['ORD-35'])
  })

  it('fecha anterior a la fuente → bloqueo por vigencia', () => {
    const r = correr('S90023')
    expect(r).toMatchObject({ estado: 'requiere_revision', total: null })
    expect(r.motivos[0]).toMatch(/retroactivo/)
  })

  it('otra sede de Zona 7 no hereda Lurín', () => {
    expect(correr('S90024')).toMatchObject({ estado: 'requiere_revision', total: null })
  })
})

describe('bloqueos', () => {
  it('zona de la tarea distinta a la del destino', () => {
    expect(correr('S90031').motivos[0]).toMatch(/no coinciden/)
  })

  it('Provincia no es Zona 0', () => {
    expect(correr('S90032').motivos[0]).toMatch(/Provincia/)
  })

  it('Zona 0 exige ruta', () => {
    expect(simularTarifa({ ...caso('S90001'), zona: 'Zona 0' }).motivos[0]).toMatch(/itinerario/)
  })

  it('campos nulos se listan', () => {
    expect(correr('S90033').motivos[0]).toMatch(/zona Odoo, modalidad, tipo de carga/)
  })

  it('código de servicio inválido', () => {
    expect(simularTarifa({ ...caso('S90001'), servicio: 'X1' }).estado).toBe('requiere_revision')
  })

  it('exportación ordinaria pendiente (DEC-02)', () => {
    expect(simularTarifa({ ...caso('S90001'), tipoServicio: 'Exportación' }).motivos[0]).toMatch(/DEC-02/)
  })

  it('ningún resultado tiene efecto financiero, S/0 ni duplicados', () => {
    for (const c of CASOS_DEMO) {
      const r = simularTarifa(c.entrada)
      expect(r.efectoFinanciero).toBe(false)
      expect(r.lineas.every(l => l.monto !== 0)).toBe(true)
      expect(lineasDuplicadas(r.lineas)).toEqual([])
      if (r.estado === 'requiere_revision') expect(r.motivos.length).toBeGreaterThan(0)
    }
  })

  it('detecta duplicados', () => {
    const l = { tramo: 'principal' as const, conductorId: 1, conductor: null, ruleId: 'X', concepto: '', monto: 1, estado: 'propuesto' as const }
    expect(lineasDuplicadas([l, l])).toHaveLength(1)
  })
})

describe('entradaDesdeOdoo', () => {
  const s: ServicioPago = {
    id: 5, name: 'S03117 - Servicio', fecha: '2026-11-10', etapa: 'Servicio Finalizado', cliente: 'CROSLAND MOTOS S.A.C',
    clienteId: 77, conductorId: 1, conductor: 'A', placa: null, horaCita: null, flujo: 'importacion',
    devolucionOtroConductor: true, horarios: { inicio: null, fin: null, devolucion: null, linea: [] },
    atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', zona: 'Zona 5' },
  }
  const d: DevolucionPago = {
    id: 6, name: 'Devolución', etapa: 'Servicio Finalizado', conductorId: 2, conductor: 'B', almacen: 'APMT',
    fecha: '2026-11-10', padreId: 5, padreName: s.name, padreConductorId: 1, padreConductor: 'A',
  }

  it('arma la entrada sin destino y con el retorno de la subtarea', () => {
    const e = entradaDesdeOdoo(s, [d])
    expect(e).toMatchObject({ servicio: 'S03117', taskId: 5, clienteId: 77, destino: null, origen: 'odoo' })
    expect(simularTarifa(e)).toMatchObject({ total: 100, ruleIds: ['CR-02', 'CR-04'] })
  })

  it('otro conductor sin subtarea → revisión', () => {
    expect(simularTarifa(entradaDesdeOdoo(s, [])).estado).toBe('requiere_revision')
  })

  it('ordinario real sin destino estructurado → revisión', () => {
    const e = entradaDesdeOdoo({ ...s, cliente: 'OTRO', devolucionOtroConductor: false }, [])
    expect(simularTarifa(e).motivos[0]).toMatch(/Destino físico/)
  })
})
