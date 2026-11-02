import { describe, expect, it } from 'vitest'
import { validarAltaGasto } from './validaciones'

const valido = { servicioId: 10, descripcion: ' Peaje ', monto: '12.50', moneda: 'dolares', fotos: ['a.jpg'] }

describe('validarAltaGasto', () => {
  it('acepta gasto válido y conserva moneda', () => {
    expect(validarAltaGasto(valido)).toEqual({
      ok: true,
      datos: { id: null, servicioId: 10, descripcion: 'Peaje', monto: 12.5, moneda: 'dolares', fotos: ['a.jpg'] },
    })
  })

  it('sin foto no se rechaza: la política sigue pendiente', () => {
    expect(validarAltaGasto({ ...valido, fotos: undefined }).ok).toBe(true)
  })

  it.each([
    [{ ...valido, monto: 0 }, 'Faltan campos requeridos'],
    [{ ...valido, monto: -5 }, 'Monto inválido'],
    [{ ...valido, monto: 'abc' }, 'Monto inválido'],
    [{ ...valido, monto: 'Infinity' }, 'Monto inválido'],
    [{ ...valido, moneda: 'euros' }, 'Moneda inválida'],
    [{ ...valido, servicioId: '10' }, 'Servicio inválido'],
    [{ ...valido, descripcion: '   ' }, 'Faltan campos requeridos'],
    [{ ...valido, id: 'x' }, 'Identificador de gasto inválido'],
    [{ ...valido, fotos: [1] }, 'Fotos inválidas'],
    [null, 'Faltan campos requeridos'],
  ])('rechaza %j', (body, error) => {
    expect(validarAltaGasto(body as Record<string, unknown> | null)).toEqual({ ok: false, error })
  })
})
