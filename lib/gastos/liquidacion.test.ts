import { describe, expect, it } from 'vitest'
import { aplicarPago, revertirPago, saldoGasto, type Aplicacion, type GastoLiquidable, type Pago } from './liquidacion'

const g1: GastoLiquidable = { id: 'g1', monto: 30, moneda: 'soles' }
const g2: GastoLiquidable = { id: 'g2', monto: 20.5, moneda: 'soles' }
const usd: GastoLiquidable = { id: 'g3', monto: 15, moneda: 'dolares' }
const gastos = [g1, g2, usd]

const pago = (over: Partial<Pago> = {}): Pago => ({
  id: 'p1', moneda: 'soles', monto: 50.5, modalidad: 'individual',
  lineas: [{ gastoId: 'g1', monto: 30 }, { gastoId: 'g2', monto: 20.5 }], ...over,
})
const aplicar = (p: Pago, previas: Aplicacion[] = []) => {
  const r = aplicarPago(p, gastos, previas)
  if (!r.ok) throw new Error(r.error)
  return [...previas, ...r.nuevas]
}
const error = (p: Pago, previas: Aplicacion[] = []) => {
  const r = aplicarPago(p, gastos, previas)
  return r.ok ? null : r.error
}

describe('Enlace gasto → pago', () => {
  it('2 gastos / 1 pago: ambos quedan en saldo 0', () => {
    const a = aplicar(pago())
    expect(a).toHaveLength(2)
    expect([saldoGasto(g1, a), saldoGasto(g2, a)]).toEqual([0, 0])
  })

  it('pago parcial deja saldo y permite completar', () => {
    const a = aplicar(pago({ monto: 10, lineas: [{ gastoId: 'g1', monto: 10 }] }))
    expect(saldoGasto(g1, a)).toBe(20)
    const b = aplicar(pago({ id: 'p2', monto: 20, lineas: [{ gastoId: 'g1', monto: 20 }] }), a)
    expect(saldoGasto(g1, b)).toBe(0)
  })

  it('reintento del mismo pago no duplica', () => {
    const a = aplicar(pago())
    expect(aplicarPago(pago(), gastos, a)).toEqual({ ok: true, reintento: true, nuevas: [] })
  })

  it('doble reembolso con otro pago se rechaza', () => {
    const a = aplicar(pago())
    expect(error(pago({ id: 'p2', monto: 30, lineas: [{ gastoId: 'g1', monto: 30 }] }), a)).toBe('El pago supera el saldo del gasto')
  })

  it('individual O semanal, nunca ambos', () => {
    const a = aplicar(pago({ monto: 10, lineas: [{ gastoId: 'g1', monto: 10 }] }))
    expect(error(pago({ id: 'p2', monto: 10, modalidad: 'semanal', lineas: [{ gastoId: 'g1', monto: 10 }] }), a))
      .toBe('El gasto ya está en otra modalidad de reembolso')
  })

  it('USD no se mezcla ni se convierte', () => {
    expect(error(pago({ monto: 15, lineas: [{ gastoId: 'g3', monto: 15 }] }))).toBe('La moneda del pago no coincide con la del gasto')
    expect(saldoGasto(usd, aplicar(pago({ moneda: 'dolares', monto: 15, lineas: [{ gastoId: 'g3', monto: 15 }] })))).toBe(0)
  })

  it('líneas que no suman el total, repetidas o vacías se rechazan', () => {
    expect(error(pago({ monto: 40 }))).toBe('Las líneas no suman el total del pago')
    expect(error(pago({ monto: 20, lineas: [{ gastoId: 'g1', monto: 10 }, { gastoId: 'g1', monto: 10 }] }))).toBe('Gasto repetido en el pago')
    expect(error(pago({ monto: 0, lineas: [] }))).toBe('El pago no tiene gastos')
    expect(error(pago({ monto: 5, lineas: [{ gastoId: 'nope', monto: 5 }] }))).toContain('no existe')
  })

  it('reversión conserva historial, libera saldo y exige motivo', () => {
    const a = aplicar(pago())
    const r = revertirPago('p1', a, 'Transferencia rechazada', 'Rosario')
    expect(r).toHaveLength(2)
    expect(r.every(x => x.revertida?.motivo === 'Transferencia rechazada')).toBe(true)
    expect(saldoGasto(g1, r)).toBe(30)
    expect(() => revertirPago('p1', a, ' ', 'Rosario')).toThrow()
    expect(aplicarPago(pago(), gastos, r)).toMatchObject({ ok: true, reintento: false })
  })

  it('céntimos no dejan saldo fantasma', () => {
    const g: GastoLiquidable = { id: 'g1', monto: 0.3, moneda: 'soles' }
    const r = aplicarPago(pago({ monto: 0.3, lineas: [{ gastoId: 'g1', monto: 0.3 }] }), [g], [])
    expect(r.ok).toBe(true)
    if (r.ok) expect(saldoGasto(g, r.nuevas)).toBe(0)
  })
})
