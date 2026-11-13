import { describe, expect, it } from 'vitest'
import { aplicarCitasNuevas, citaLima, diasEntre } from './citas'

describe('citas con fecha y hora (Odoo guarda UTC, Perú es UTC−5)', () => {
  it('convierte el datetime de Odoo a fecha y hora de Lima', () => {
    expect(citaLima('2026-11-14 08:00:00')).toEqual({ fecha: '2026-11-14', hora: 3 })
    expect(citaLima('2026-11-15 03:30:00')).toEqual({ fecha: '2026-11-14', hora: 22.5 })
  })

  it('vacío o inválido → null', () => {
    expect(citaLima(false)).toBeNull()
    expect(citaLima('')).toBeNull()
    expect(citaLima('basura')).toBeNull()
  })

  it('el campo nuevo reemplaza a la hora antigua; vacío deja la antigua', () => {
    const conNueva = aplicarCitasNuevas({
      x_studio_hora_de_cita: 9, x_studio_fecha_y_hora_de_cita_de_retiro: '2026-11-14 08:00:00',
      x_studio_hora_de_devolucion: 0, x_studio_fecha_y_hora_de_cita_de_devolucion: '2026-11-14 23:00:00',
    })
    expect(conNueva).toMatchObject({ x_studio_hora_de_cita: 3, x_studio_hora_de_devolucion: 18 })
    const sinNueva = aplicarCitasNuevas({ x_studio_hora_de_cita: 9, x_studio_fecha_y_hora_de_cita_de_retiro: false })
    expect(sinNueva.x_studio_hora_de_cita).toBe(9)
  })

  it('días entre fechas', () => {
    expect(diasEntre('2026-11-14', '2026-11-15')).toBe(1)
    expect(diasEntre('2026-11-14', '2026-11-14')).toBe(0)
  })
})
