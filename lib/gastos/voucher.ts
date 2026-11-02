// Al pagar un gasto de conductor, lo que se debe viene del gasto: lo leído del
// voucher no lo reemplaza, solo se compara para que Finanzas lo revise.

export interface VoucherLeido {
  monto: number | null
  moneda: string
}

const simbolo = (moneda: string) => (moneda === 'soles' ? 'S/' : '$')
const formato = (monto: number, moneda: string) => `${simbolo(moneda)} ${monto.toFixed(2)}`

/** Aviso si el voucher no coincide con el gasto. Sin monto leído no hay qué comparar. */
export function diferenciaVoucher(gasto: { monto: number; moneda: string }, voucher: VoucherLeido): string | null {
  if (voucher.monto === null) return null
  const mismoMonto = Math.round(voucher.monto * 100) === Math.round(gasto.monto * 100)
  if (mismoMonto && voucher.moneda === gasto.moneda) return null
  return `El voucher dice ${formato(voucher.monto, voucher.moneda)} y el gasto ${formato(gasto.monto, gasto.moneda)}. Revisa antes de guardar.`
}
