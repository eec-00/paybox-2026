// Validación del alta de un gasto de conductor (POST /api/conductor/gastos).
// La foto no se exige acá: su obligatoriedad sigue pendiente de política.

export const MONEDAS_GASTO = ['soles', 'dolares'] as const
export type MonedaGasto = (typeof MONEDAS_GASTO)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AltaGasto {
  /** Generado por la app en cada gasto: permite reintentar sin duplicar */
  id: string | null
  servicioId: number
  descripcion: string
  monto: number
  moneda: MonedaGasto
  fotos: string[]
}

export type ResultadoAlta =
  | { ok: true; datos: AltaGasto }
  | { ok: false; error: string }

export function validarAltaGasto(body: Record<string, unknown> | null): ResultadoAlta {
  const { id, servicioId, descripcion, monto, moneda = 'soles', fotos = [] } = body ?? {}

  const texto = typeof descripcion === 'string' ? descripcion.trim() : ''
  if (!servicioId || !texto || !monto) return { ok: false, error: 'Faltan campos requeridos' }

  if (!Number.isInteger(servicioId) || (servicioId as number) <= 0) {
    return { ok: false, error: 'Servicio inválido' }
  }
  if (id !== undefined && id !== null && (typeof id !== 'string' || !UUID.test(id))) {
    return { ok: false, error: 'Identificador de gasto inválido' }
  }
  const montoNum = parseFloat(String(monto))
  if (!Number.isFinite(montoNum) || montoNum <= 0) return { ok: false, error: 'Monto inválido' }
  if (!(MONEDAS_GASTO as readonly unknown[]).includes(moneda)) {
    return { ok: false, error: 'Moneda inválida' }
  }
  if (!Array.isArray(fotos) || fotos.some(f => typeof f !== 'string')) {
    return { ok: false, error: 'Fotos inválidas' }
  }

  return {
    ok: true,
    datos: {
      id: (id as string | null | undefined) ?? null,
      servicioId: servicioId as number,
      descripcion: texto,
      monto: montoNum,
      moneda: moneda as MonedaGasto,
      fotos: fotos as string[],
    },
  }
}
