import { describe, expect, it } from 'vitest'
import { diferenciaVoucher } from './voucher'

const gasto = { monto: 30, moneda: 'soles' }

describe('diferenciaVoucher', () => {
  it('sin aviso si monto y moneda coinciden', () => {
    expect(diferenciaVoucher(gasto, { monto: 30, moneda: 'soles' })).toBeNull()
  })

  it('no confunde decimales al comparar', () => {
    expect(diferenciaVoucher({ monto: 0.3, moneda: 'soles' }, { monto: 0.1 + 0.2, moneda: 'soles' })).toBeNull()
  })

  it('avisa si el monto no coincide', () => {
    expect(diferenciaVoucher(gasto, { monto: 25, moneda: 'soles' }))
      .toBe('El voucher dice S/ 25.00 y el gasto S/ 30.00. Revisa antes de guardar.')
  })

  it('avisa si la moneda no coincide', () => {
    expect(diferenciaVoucher(gasto, { monto: 30, moneda: 'dolares' })).toContain('$ 30.00')
  })

  it('si el OCR no leyó el monto no avisa', () => {
    expect(diferenciaVoucher(gasto, { monto: null, moneda: 'dolares' })).toBeNull()
  })
})
