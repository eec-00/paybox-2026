// Reparto de un pago entre gastos de conductor, en memoria. Fija las reglas del
// enlace gasto → pago (N gastos / 1 pago, parciales, reintento, reversión) antes
// de tocar la base: ver supabase/propuestas/h06_enlace_gasto_pago.sql.
// La política final de parciales y correcciones la define Rosario (Q01, Q02).

export type Modalidad = 'individual' | 'semanal'

export interface GastoLiquidable {
  id: string
  monto: number
  moneda: string
}

/** Una línea del pago aplicada a un gasto. No se borra: se revierte. */
export interface Aplicacion {
  pagoId: string
  gastoId: string
  monto: number
  modalidad: Modalidad
  revertida: { motivo: string; actor: string } | null
}

export interface Pago {
  id: string
  moneda: string
  monto: number
  modalidad: Modalidad
  lineas: { gastoId: string; monto: number }[]
}

export type ResultadoPago =
  | { ok: true; reintento: boolean; nuevas: Aplicacion[] }
  | { ok: false; error: string }

// En céntimos, para que 0.1 + 0.2 no deje saldos fantasma
const cent = (monto: number) => Math.round(monto * 100)

function vigentes(gastoId: string, aplicaciones: Aplicacion[]): Aplicacion[] {
  return aplicaciones.filter(a => a.gastoId === gastoId && !a.revertida)
}

export function saldoGasto(gasto: GastoLiquidable, aplicaciones: Aplicacion[]): number {
  const pagado = vigentes(gasto.id, aplicaciones).reduce((s, a) => s + cent(a.monto), 0)
  return (cent(gasto.monto) - pagado) / 100
}

export function aplicarPago(pago: Pago, gastos: GastoLiquidable[], aplicaciones: Aplicacion[]): ResultadoPago {
  if (aplicaciones.some(a => a.pagoId === pago.id && !a.revertida)) {
    return { ok: true, reintento: true, nuevas: [] }
  }
  if (pago.lineas.length === 0) return { ok: false, error: 'El pago no tiene gastos' }

  const suma = pago.lineas.reduce((s, l) => s + cent(l.monto), 0)
  if (suma !== cent(pago.monto)) return { ok: false, error: 'Las líneas no suman el total del pago' }

  const ids = new Set(pago.lineas.map(l => l.gastoId))
  if (ids.size !== pago.lineas.length) return { ok: false, error: 'Gasto repetido en el pago' }

  for (const linea of pago.lineas) {
    const gasto = gastos.find(g => g.id === linea.gastoId)
    if (!gasto) return { ok: false, error: `Gasto ${linea.gastoId} no existe` }
    if (cent(linea.monto) <= 0) return { ok: false, error: 'Importe de línea inválido' }
    if (gasto.moneda !== pago.moneda) return { ok: false, error: 'La moneda del pago no coincide con la del gasto' }
    if (vigentes(gasto.id, aplicaciones).some(a => a.modalidad !== pago.modalidad)) {
      return { ok: false, error: 'El gasto ya está en otra modalidad de reembolso' }
    }
    if (cent(linea.monto) > cent(saldoGasto(gasto, aplicaciones))) {
      return { ok: false, error: 'El pago supera el saldo del gasto' }
    }
  }

  return {
    ok: true,
    reintento: false,
    nuevas: pago.lineas.map(l => ({
      pagoId: pago.id, gastoId: l.gastoId, monto: l.monto, modalidad: pago.modalidad, revertida: null,
    })),
  }
}

/** Marca las líneas del pago como revertidas; el saldo de cada gasto se libera. */
export function revertirPago(
  pagoId: string,
  aplicaciones: Aplicacion[],
  motivo: string,
  actor: string,
): Aplicacion[] {
  if (!motivo.trim() || !actor.trim()) throw new Error('La reversión exige motivo y responsable')
  return aplicaciones.map(a => (a.pagoId === pagoId && !a.revertida ? { ...a, revertida: { motivo, actor } } : a))
}
