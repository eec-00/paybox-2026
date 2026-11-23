import { describe, expect, it } from 'vitest'
import { calcularAdicionales, totalAdicionales } from './adicionalesConductores'
import type { PernoctePago, ServicioPago } from './pagosConductores'

function servicio(over: Partial<ServicioPago> = {}): ServicioPago {
  return {
    id: 1, name: 'S01001 - Servicio', fecha: '2026-11-10', etapa: 'Servicio Finalizado', cliente: 'CLIENTE',
    clienteId: 1, conductorId: 1, conductor: 'A', placa: null, horaCita: null, flujo: 'importacion', devolucionOtroConductor: false,
    atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', zona: 'Zona 3' },
    horarios: { inicio: null, fin: null, devolucion: null, linea: [] },
    ...over,
  }
}

function pernocte(over: Partial<PernoctePago> = {}): PernoctePago {
  return {
    id: 'p1', servicioId: 1, servicio: 'S01001 - Servicio', conductorId: 1, conductor: 'A', noche: '2026-11-10',
    estado: 'aprobado', motivo: 'cola_puerto', exclusiones: [], revisadoPor: 'Charito', evidencias: 1, ...over,
  }
}

function calc(servicios: ServicioPago[], pernoctes: PernoctePago[]) {
  return calcularAdicionales({
    servicios, devoluciones: [], todos: servicios, conductorId: 1, asistencias: [], gastos: [], pernoctes,
  })
}
const de = (lista: ReturnType<typeof calc>, c: string) => lista.filter(a => a.concepto === c)

describe('08 · Pernocte', () => {
  it('aprobado → S/40 simulado y suma al total', () => {
    const lista = calc([servicio()], [pernocte()])
    const [p] = de(lista, 'pernocte')
    expect(p).toMatchObject({ estado: 'simulado', monto: 40, fecha: '2026-11-10', servicio: 'S01001' })
    expect(totalAdicionales(lista)).toBe(40)
  })

  it('una línea por noche', () => {
    const lista = de(calc([servicio()], [pernocte(), pernocte({ id: 'p2', noche: '2026-11-11' })]), 'pernocte')
    expect(lista.map(p => p.monto)).toEqual([40, 40])
  })

  it('pendiente o escalado → requiere revisión, no suma', () => {
    const lista = calc([servicio()], [pernocte({ estado: 'pendiente' }), pernocte({ id: 'p2', noche: '2026-11-11', estado: 'escalado' })])
    expect(de(lista, 'pernocte').map(p => p.estado)).toEqual(['requiere_revision', 'requiere_revision'])
    expect(totalAdicionales(lista)).toBe(0)
  })

  it('rechazado no aparece', () => {
    expect(de(calc([servicio()], [pernocte({ estado: 'rechazado' })]), 'pernocte')).toHaveLength(0)
  })

  it('aprobado con una exclusión marcada → revisión', () => {
    const [p] = de(calc([servicio()], [pernocte({ exclusiones: ['hotel_depositado'] })]), 'pernocte')
    expect(p).toMatchObject({ estado: 'requiere_revision', monto: null })
    expect(p.motivo).toMatch(/hotel/)
  })

  it('servicio a provincia en Odoo → revisión', () => {
    const s = servicio({ atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 40', tipoCarga: 'General', zona: 'Provincia' } })
    const [p] = de(calc([s], [pernocte()]), 'pernocte')
    expect(p.estado).toBe('requiere_revision')
    expect(p.motivo).toMatch(/provincia/)
  })

  it('de otro conductor no entra', () => {
    expect(de(calc([servicio()], [pernocte({ conductorId: 2 })]), 'pernocte')).toHaveLength(0)
  })

  it('retiro 03:00 a la mañana siguiente de un pernocte aprobado → retiro en revisión', () => {
    const retiro = servicio({
      id: 2, name: 'S01002 - Servicio', fecha: '2026-11-11', horaCita: 180,
      horarios: { inicio: 170, fin: null, devolucion: null, linea: [{ key: 'inicio_ruta', label: 'Inicio', min: 170, real: true }] },
    })
    const lista = calc([servicio(), retiro], [pernocte()])
    const [r] = de(lista, 'retiro_0300')
    expect(r).toMatchObject({ estado: 'requiere_revision', monto: null })
    expect(r.motivo).toMatch(/Pernocte/)
    expect(de(lista, 'pernocte')[0].estado).toBe('simulado')
  })
})
