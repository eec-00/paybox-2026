import { describe, expect, it } from 'vitest'
import { ERROR_SIN_UBICACION, estadoTrasAccion, nocheDe, validarAccion, validarAltaPernocte, type ChecklistPernocte } from './reglas'

const todoNo: ChecklistPernocte = { volvio_a_casa: false, hotel_depositado: false, movilidad_depositada: false, es_provincia: false }
const charito = { esAdmin: false }
const emerson = { esAdmin: true }

describe('nocheDe (hora de Lima)', () => {
  it('a las 22:00 es la noche de ese día', () => {
    expect(nocheDe(new Date('2026-11-18T03:00:00Z'))).toBe('2026-11-17') // 22:00 del 17 en Lima
  })
  it('a la 01:00 cuenta para la noche anterior', () => {
    expect(nocheDe(new Date('2026-11-18T06:00:00Z'))).toBe('2026-11-17') // 01:00 del 18
  })
  it('desde las 06:00 ya es el día nuevo', () => {
    expect(nocheDe(new Date('2026-11-18T11:00:00Z'))).toBe('2026-11-18') // 06:00 del 18
  })
})

describe('validarAltaPernocte', () => {
  const base = { servicioId: 10, motivo: 'cola_puerto', duermeEnUnidad: true, lat: -12.05, lng: -77.1, precision: 15 }

  it('alta válida', () => {
    const r = validarAltaPernocte(base)
    expect(r).toMatchObject({ ok: true, datos: { servicioId: 10, motivo: 'cola_puerto', lat: -12.05, evidencias: [] } })
  })
  it('sin confirmar que duerme en la unidad → error', () => {
    expect(validarAltaPernocte({ ...base, duermeEnUnidad: false }).ok).toBe(false)
  })
  it('motivo desconocido → error', () => {
    expect(validarAltaPernocte({ ...base, motivo: 'paseo' }).ok).toBe(false)
  })
  it('«otro» exige detalle', () => {
    expect(validarAltaPernocte({ ...base, motivo: 'otro' }).ok).toBe(false)
    expect(validarAltaPernocte({ ...base, motivo: 'otro', motivoDetalle: 'Huelga en la vía' }).ok).toBe(true)
  })
  it('sin ubicación → error, no se registra', () => {
    expect(validarAltaPernocte({ ...base, lat: undefined, lng: undefined })).toEqual({ ok: false, error: ERROR_SIN_UBICACION })
    expect(validarAltaPernocte({ ...base, lat: 200 }).ok).toBe(false)
  })
  it('más de 3 fotos → error', () => {
    expect(validarAltaPernocte({ ...base, evidencias: ['a', 'b', 'c', 'd'] }).ok).toBe(false)
  })
})

describe('validarAccion', () => {
  it('aprobar exige el checklist completo', () => {
    expect(validarAccion('pendiente', 'aprobar', { volvio_a_casa: false }, '', charito)).toMatch(/4 preguntas/)
    expect(validarAccion('pendiente', 'aprobar', todoNo, '', charito)).toBeNull()
  })
  it('una exclusión en «sí» impide aprobar', () => {
    expect(validarAccion('pendiente', 'aprobar', { ...todoNo, hotel_depositado: true }, '', charito)).toMatch(/hotel/)
  })
  it('rechazar y escalar exigen observación', () => {
    expect(validarAccion('pendiente', 'rechazar', {}, '', charito)).not.toBeNull()
    expect(validarAccion('pendiente', 'rechazar', {}, 'Volvió a su casa', charito)).toBeNull()
    expect(validarAccion('pendiente', 'escalar', {}, '', charito)).not.toBeNull()
    expect(validarAccion('pendiente', 'escalar', {}, 'Foto borrosa', charito)).toBeNull()
  })
  it('lo escalado lo decide solo un admin', () => {
    expect(validarAccion('escalado', 'aprobar', todoNo, '', charito)).toMatch(/administrador/)
    expect(validarAccion('escalado', 'aprobar', todoNo, '', emerson)).toBeNull()
    expect(validarAccion('escalado', 'comentar', {}, 'Llamé al conductor', charito)).toBeNull()
  })
  it('lo ya decidido solo lo cambia un admin', () => {
    expect(validarAccion('aprobado', 'rechazar', {}, 'Error', charito)).not.toBeNull()
    expect(validarAccion('aprobado', 'rechazar', {}, 'Error', emerson)).toBeNull()
  })
  it('lo anulado no se toca', () => {
    expect(validarAccion('anulado', 'aprobar', todoNo, '', emerson)).not.toBeNull()
  })
  it('estado resultante', () => {
    expect(estadoTrasAccion('pendiente', 'aprobar')).toBe('aprobado')
    expect(estadoTrasAccion('pendiente', 'escalar')).toBe('escalado')
    expect(estadoTrasAccion('escalado', 'comentar')).toBe('escalado')
  })
})
