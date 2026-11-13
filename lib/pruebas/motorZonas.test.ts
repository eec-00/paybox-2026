import { describe, expect, it } from 'vitest'
import {
  CASOS_DEMO, RUTAS_ESPECIALES, TARIFARIO, entradaDesdeOdoo, lineasDuplicadas, simularTarifa, type EntradaMotor,
} from './motorZonas'
import type { DevolucionPago, ServicioPago } from './pagosConductores'

const caso = (servicio: string): EntradaMotor => CASOS_DEMO.find(c => c.entrada.servicio === servicio)!.entrada
const correr = (servicio: string) => simularTarifa(caso(servicio))
const regla = (id: string) => TARIFARIO.find(r => r.id === id)!

describe('catálogo = Excel v0.9', () => {
  it('12 distritos literales × 3 conceptos + 3 ITK, ids únicos', () => {
    const ids = TARIFARIO.map(r => r.id)
    expect(ids).toHaveLength(39)
    expect(new Set(ids).size).toBe(39)
  })

  it('importes de la hoja 00_TARIFARIO_MICHAEL', () => {
    expect(regla('Z4-ATE-GEN')).toMatchObject({ monto: 80, fuente: expect.stringContaining('fila 11') })
    expect(regla('Z4-SAN-JUAN-DE-LURIGANCHO-GEN').monto).toBe(90)
    expect(regla('Z7-LURIN-GEN').monto).toBe(100)
    expect(regla('Z7-LURIN-IMO').monto).toBe(110)
    expect(regla('Z7-LURIN-DES').monto).toBe(110)
    expect(regla('Z1-CALLAO-DES').monto).toBe(80)
    expect(regla('Z2-LIMA-GEN')).toMatchObject({ distrito: 'Lima (Cercado)', monto: 80 })
  })

  it('casos por zona: los 12 distritos × 3 tipos, cada uno con el importe del Excel', () => {
    const zona = CASOS_DEMO.filter(c => c.grupo === 'zona')
    expect(zona).toHaveLength(36)
    expect(new Set(zona.map(c => c.etiqueta))).toEqual(new Set(['Zona 1', 'Zona 2', 'Zona 3', 'Zona 4', 'Zona 5', 'Zona 6', 'Zona 7']))
    for (const c of [...zona, ...CASOS_DEMO.filter(x => x.grupo === 'ruta')]) {
      expect(simularTarifa(c.entrada).total, c.titulo).toBe(Number(c.esperado.replace('SIMULADO S/', '')))
    }
  })

  it('las tres pruebas obligatorias de la ficha (§4) siguen marcadas', () => {
    const de = (p: string) => CASOS_DEMO.filter(c => c.prueba === p).map(c => c.entrada.servicio)
    expect(de('P1')).toEqual(expect.arrayContaining(['S91111', 'S91121', 'S90003']))
    expect(de('P2')).toEqual(['S90011', 'S90012', 'S90013', 'S90014'])
    expect(de('P3')).toEqual(expect.arrayContaining(['S91171', 'S91172', 'S90023']))
  })

  it('13 rutas; solo las aprobadas por Margiory (RT08, RT10, RT11) se simulan', () => {
    expect(RUTAS_ESPECIALES).toHaveLength(13)
    expect(RUTAS_ESPECIALES.filter(r => r.simulable).map(r => r.id)).toEqual(['RT08', 'RT10', 'RT11'])
  })

  it('cada caso demo da lo que promete', () => {
    for (const c of CASOS_DEMO) {
      const r = simularTarifa(c.entrada)
      expect(r.estado, c.titulo).toBe(c.esperado.startsWith('SIMULADO') ? 'simulado' : 'requiere_revision')
    }
  })
})

describe('P1 · Zona 4: Ate frente a San Juan de Lurigancho', () => {
  it('Ate → S/80', () => {
    expect(correr('S91111')).toMatchObject({ estado: 'simulado', total: 80, ruleIds: ['Z4-ATE-GEN'] })
  })

  it('SJL → S/90, misma zona', () => {
    expect(correr('S91121')).toMatchObject({ estado: 'simulado', total: 90, ruleIds: ['Z4-SAN-JUAN-DE-LURIGANCHO-GEN'] })
  })

  it('sin dirección acreditada → revisión sin importe', () => {
    const r = correr('S90003')
    expect(r).toMatchObject({ estado: 'requiere_revision', total: null, ruleIds: [] })
    expect(r.lineas.every(l => l.monto === null)).toBe(true)
  })

  it('destino no acreditado → revisión', () => {
    const e = { ...caso('S91111'), destino: { distrito: 'Ate', acreditado: false, fuente: 'nombre de tarea' } }
    expect(simularTarifa(e).estado).toBe('requiere_revision')
  })

  it('distrito solo propuesto en el Excel (Bellavista) no hereda Callao', () => {
    const e = { ...caso('S91111'), zona: 'Zona 1', destino: { distrito: 'Bellavista', acreditado: true, fuente: 'x' } }
    expect(simularTarifa(e)).toMatchObject({ estado: 'requiere_revision', total: null })
  })

  it('exportación y 20 pies pagan igual que importación 40 (Margiory, 10/11)', () => {
    const r = simularTarifa({ ...caso('S91111'), tipoServicio: 'Exportación', modalidad: 'Contenedor 20' })
    expect(r).toMatchObject({ estado: 'simulado', total: 80 })
    expect(r.alertas.join(' ')).not.toMatch(/por confirmar/)
  })

  it('Ate figura como confirmado por Margiory; Callao no', () => {
    expect(correr('S91111').alertas.join(' ')).toMatch(/CONFIRMADA POR MARGIORY/)
    const callao = simularTarifa({ ...caso('S91111'), zona: 'Zona 1', destino: { distrito: 'Callao', acreditado: true, fuente: 'x' } })
    expect(callao.alertas.join(' ')).toMatch(/NO APROBADA/)
  })

  it('servicio de marzo 2026 ya está dentro de la vigencia', () => {
    expect(simularTarifa({ ...caso('S91171'), fecha: '2026-03-02' }).estado).toBe('simulado')
  })

  it('«Lima» acreditado coincide con «Lima (Cercado)»', () => {
    const e = { ...caso('S91111'), zona: 'Zona 2', destino: { distrito: 'Lima', acreditado: true, fuente: 'x' } }
    expect(simularTarifa(e).ruleIds).toEqual(['Z2-LIMA-GEN'])
  })
})

describe('P2 · Crosland', () => {
  it('A integral → una línea S/90 CR-01', () => {
    const r = correr('S90011')
    expect(r).toMatchObject({ estado: 'simulado', total: 90, ruleIds: ['CR-01'] })
    expect(r.lineas).toHaveLength(1)
  })

  it('A principal + B ordinaria → 70 + 20 por conductor', () => {
    const r = correr('S90012')
    expect(r).toMatchObject({ total: 90, ruleIds: ['CR-02', 'CR-03'] })
    expect(r.lineas.map(l => [l.conductorId, l.monto, l.hito?.codigo])).toEqual([[101, 70, 'I08'], [102, 20, 'I12']])
  })

  it('B en DPW → 70 + 30', () => {
    expect(correr('S90013')).toMatchObject({ total: 100, ruleIds: ['CR-02', 'CR-04'] })
  })

  it('B sin I12 → nadie cobra', () => {
    expect(correr('S90014')).toMatchObject({ estado: 'requiere_revision', total: null, ruleIds: [] })
  })

  it('A sin I08/I09 → revisión', () => {
    expect(simularTarifa({ ...caso('S90012'), principal: { ...caso('S90012').principal, hito: null } }).estado).toBe('requiere_revision')
  })

  it('no usa la tarifa de Ancón aunque haya destino', () => {
    const e = { ...caso('S90011'), destino: { distrito: 'Ancón', acreditado: true, fuente: 'x' } }
    expect(simularTarifa(e).ruleIds).toEqual(['CR-01'])
  })

  it('Crosland exportación no entra en los repartos A/B', () => {
    expect(simularTarifa({ ...caso('S90011'), tipoServicio: 'Exportación' }).estado).toBe('requiere_revision')
  })
})

describe('P3 · Lurín', () => {
  it('General S/100 · IMO S/110 · IQBF S/110', () => {
    expect(correr('S91171')).toMatchObject({ total: 100, ruleIds: ['Z7-LURIN-GEN'] })
    expect(correr('S91172')).toMatchObject({ total: 110, ruleIds: ['Z7-LURIN-IMO'] })
    expect(simularTarifa({ ...caso('S91172'), tipoCarga: 'IQBF' }).total).toBe(110)
  })

  it('fecha anterior a la fuente → bloqueo por vigencia', () => {
    const r = correr('S90023')
    expect(r).toMatchObject({ estado: 'requiere_revision', total: null })
    expect(r.motivos[0]).toMatch(/retroactivo/)
  })

  it('Pachacamac (Zona 7) no hereda Lurín', () => {
    expect(correr('S90024')).toMatchObject({ estado: 'requiere_revision', total: null })
  })
})

describe('bloqueos y rutas', () => {
  it('zona de la tarea distinta a la del destino', () => {
    expect(correr('S90031').motivos[0]).toMatch(/no coinciden/)
  })

  it('Provincia sin itinerario', () => {
    expect(correr('S90032').motivos[0]).toMatch(/Zona 0/)
  })

  it('ruta exacta RT08 → S/200; ruta «no activar» → revisión', () => {
    expect(correr('S90033')).toMatchObject({ estado: 'simulado', total: 200, ruleIds: ['RT08'] })
    expect(correr('S90034').motivos[0]).toMatch(/NO ACTIVAR/)
  })

  it('ruta con producto distinto → revisión', () => {
    expect(simularTarifa({ ...caso('S90033'), tipoCarga: 'IMO' }).estado).toBe('requiere_revision')
  })

  it('itinerario parecido pero no exacto → revisión', () => {
    expect(simularTarifa({ ...caso('S90033'), itinerario: 'CALLAO - MELCHORITA - CALLAO' }).estado).toBe('requiere_revision')
  })

  it('sin hito operativo (solo cierre administrativo) → revisión', () => {
    expect(correr('S90035').motivos[0]).toMatch(/cierre administrativo/)
  })

  it('campos nulos se listan', () => {
    expect(correr('S90036').motivos[0]).toMatch(/zona Odoo, modalidad, tipo de carga/)
  })

  it('cada línea lleva versión, regla, hito y fuente; nunca S/0, duplicados ni efecto financiero', () => {
    for (const c of CASOS_DEMO) {
      const r = simularTarifa(c.entrada)
      expect(r.efectoFinanciero).toBe(false)
      expect(lineasDuplicadas(r.lineas)).toEqual([])
      for (const l of r.lineas) {
        expect(l.monto).not.toBe(0)
        expect(l.version).toMatch(/v0\.9/)
        if (l.estado === 'simulado') expect(l).toMatchObject({ ruleId: expect.any(String), fuente: expect.any(String), hito: expect.any(Object) })
      }
      if (r.estado === 'requiere_revision') expect(r.motivos.length).toBeGreaterThan(0)
    }
  })
})

describe('entradaDesdeOdoo', () => {
  const linea = (key: string, label: string, min: number | null) => ({ key, label, min, real: true })
  const s: ServicioPago = {
    id: 5, name: 'S03117 - Servicio', fecha: '2026-11-10', etapa: 'Servicio Finalizado', cliente: 'CROSLAND MOTOS S.A.C',
    clienteId: 308, conductorId: 1, conductor: 'A', placa: null, horaCita: null, flujo: 'importacion',
    devolucionOtroConductor: true,
    horarios: { inicio: null, fin: null, devolucion: null, linea: [linea('fin_descarga', 'Fin descarga', 14 * 60), linea('salida_cliente', 'Salida de cliente', null)] },
    atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', zona: 'Zona 5' },
  }
  const d: DevolucionPago = {
    id: 6, name: 'Devolución', etapa: 'Servicio Finalizado', conductorId: 2, conductor: 'B', almacen: 'APMT',
    fecha: '2026-11-10', padreId: 5, padreName: s.name, padreConductorId: 1, padreConductor: 'A', devueltoMin: 25 * 60,
  }

  it('acredita A por I08 y B por el I12 de su subtarea', () => {
    const e = entradaDesdeOdoo(s, [d])
    expect(e.principal.hito).toMatchObject({ codigo: 'I08', momento: '2026-11-10 14:00' })
    expect(e.retorno?.hito).toMatchObject({ codigo: 'I12', momento: '2026-11-11 01:00' })
    expect(simularTarifa(e)).toMatchObject({ total: 100, ruleIds: ['CR-02', 'CR-04'] })
  })

  it('subtarea finalizada pero sin I12 → revisión (el cierre no acredita)', () => {
    expect(simularTarifa(entradaDesdeOdoo(s, [{ ...d, devueltoMin: null }])).estado).toBe('requiere_revision')
  })

  it('servicio finalizado sin hitos operativos → principal sin acreditar', () => {
    const sinHitos = { ...s, horarios: { ...s.horarios, linea: [] } }
    expect(entradaDesdeOdoo(sinHitos, [d]).principal.hito).toBeNull()
  })

  it('ordinario real sin destino estructurado → revisión', () => {
    const e = entradaDesdeOdoo({ ...s, cliente: 'OTRO', clienteId: 9001, devolucionOtroConductor: false }, [])
    expect(simularTarifa(e).motivos[0]).toMatch(/Destino físico/)
  })

  it('distrito del Almacén de Destino de Odoo → simulado con alerta de fuente por confirmar', () => {
    const base = { ...s, clienteId: 326, cliente: 'QUIMTIA S.A.', devolucionOtroConductor: false, atributos: { ...s.atributos, zona: 'Zona 4' } }
    const r = simularTarifa(entradaDesdeOdoo({ ...base, almacenDestino: { id: 875, nombre: 'FOSFORERA PERUANA S.A., ATE LA MOLINA', distrito: 'Ate' } }, []))
    expect(r).toMatchObject({ estado: 'simulado', total: 80, ruleIds: ['Z4-ATE-GEN'] })
    expect(r.alertas.join(' ')).toMatch(/fuente por confirmar con Operaciones/)
  })

  it('Almacén de Destino: distrito de otra zona, sin distrito o exportación → revisión', () => {
    const base = { ...s, clienteId: 326, cliente: 'QUIMTIA S.A.', devolucionOtroConductor: false }
    const lurin = { id: 1, nombre: 'X, LURIN', distrito: 'Lurin' }
    expect(simularTarifa(entradaDesdeOdoo({ ...base, almacenDestino: lurin }, [])).motivos[0]).toMatch(/no coinciden/)
    expect(simularTarifa(entradaDesdeOdoo({ ...base, almacenDestino: { ...lurin, distrito: null } }, [])).motivos[0]).toMatch(/no acreditado/)
    const expo = { ...base, atributos: { ...base.atributos, tipoServicio: 'Exportación', zona: 'Zona 7' }, almacenDestino: lurin }
    expect(simularTarifa(entradaDesdeOdoo(expo, [])).motivos[0]).toMatch(/Destino físico/)
  })

  it('Margiory 12/11: Hertford y Crosland Repuestos van con tarifa Crosland', () => {
    for (const [clienteId, cliente] of [[317, 'HERTFORD AUTOMOTRIZ S.A.'], [421, 'CROSLAND REPUESTOS S.A.C., Almacén Callao']] as const) {
      expect(simularTarifa(entradaDesdeOdoo({ ...s, clienteId, cliente }, [d])).ruleIds).toEqual(['CR-02', 'CR-04'])
    }
  })

  it('Crosland Técnica y Crossland Facturas no entran al contrato: ordinario con alerta', () => {
    for (const [clienteId, cliente] of [[804, 'CROSLAND TECNICA S.A.'], [918, 'CROSLAND MOTOS S.A.C, Crossland Facturas']] as const) {
      const r = simularTarifa(entradaDesdeOdoo({ ...s, clienteId, cliente, devolucionOtroConductor: false }, []))
      expect(r.ruleIds.some(id => id.startsWith('CR-'))).toBe(false)
      expect(r.alertas.join(' ')).toMatch(/excluyó del contrato/)
    }
  })

  it('nombre Crosland fuera de la lista → ordinario con alerta para confirmar', () => {
    const r = simularTarifa(entradaDesdeOdoo({ ...s, clienteId: 5555, cliente: 'CROSLAND NUEVA SEDE', devolucionOtroConductor: false }, []))
    expect(r.alertas.join(' ')).toMatch(/no está en la lista/)
  })
})
