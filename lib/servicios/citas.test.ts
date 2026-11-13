import { describe, expect, it } from 'vitest'
import { citaDevolucionMin, diasEntre } from './citas'

describe('cita de devolución = Fecha de Devolucion + Hora de Devolucion', () => {
  it('mismo día del recojo', () => {
    expect(citaDevolucionMin('2026-11-14', '2026-11-14', 18)).toBe(1080)
  })

  it('otro día → suma días en minutos', () => {
    expect(citaDevolucionMin('2026-11-14', '2026-11-15', 9.5)).toBe(1440 + 570)
  })

  it('sin fecha de devolución → mismo día del recojo', () => {
    expect(citaDevolucionMin('2026-11-14', false, 18)).toBe(1080)
  })

  it('sin hora (vacío o 00:00) → null', () => {
    expect(citaDevolucionMin('2026-11-14', '2026-11-15', false)).toBeNull()
    expect(citaDevolucionMin('2026-11-14', '2026-11-15', 0)).toBeNull()
  })

  it('días entre fechas', () => {
    expect(diasEntre('2026-11-14', '2026-11-15')).toBe(1)
    expect(diasEntre('2026-11-14', '2026-11-14')).toBe(0)
  })
})
