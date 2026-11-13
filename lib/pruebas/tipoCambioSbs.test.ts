import { describe, expect, it } from 'vitest'
import { fechaBcrp, parsearSerieBcrp, tipoCambioDelDia } from './tipoCambioSbs'

// Forma real de la respuesta del BCRP (serie PD04640PD, consultada el 12/11/2026)
const RESPUESTA = {
  config: { title: 'Tipo de cambio', series: [{ name: 'Tipo de cambio - TC Sistema bancario SBS (S/ por US$) - Venta', dec: '3' }] },
  periods: [
    { name: '06.Nov.26', values: ['3.433'] },
    { name: '09.Nov.26', values: ['3.418'] },
    { name: '10.Nov.26', values: ['3.421'] },
    { name: '11.Nov.26', values: ['3.414'] },
    { name: '12.Nov.26', values: ['n.d.'] },
  ],
}
const serie = parsearSerieBcrp(RESPUESTA)

describe('Tipo de cambio venta SBS (BCRP)', () => {
  it('lee las fechas del BCRP, en inglés o en español', () => {
    expect(fechaBcrp('26.Oct.26')).toBe('2026-10-26')
    expect(fechaBcrp('15.Set.26')).toBe('2026-09-15')
    expect(fechaBcrp('02.Dic.26')).toBe('2026-12-02')
    expect(fechaBcrp('basura')).toBeNull()
  })

  it('día publicado → su valor', () => {
    expect(tipoCambioDelDia(serie, '2026-11-11')).toEqual({ valor: 3.414, fecha: '2026-11-11' })
  })

  it('sábado o domingo → el último publicado (viernes)', () => {
    expect(tipoCambioDelDia(serie, '2026-11-07')).toEqual({ valor: 3.433, fecha: '2026-11-06' })
    expect(tipoCambioDelDia(serie, '2026-11-08')).toEqual({ valor: 3.433, fecha: '2026-11-06' })
  })

  it('día hábil aún no publicado («n.d.») → null', () => {
    expect(tipoCambioDelDia(serie, '2026-11-12')).toBeNull()
  })

  it('día hábil posterior al último dato → null (no se adelanta)', () => {
    expect(tipoCambioDelDia(serie, '2026-11-13')).toBeNull()
  })

  it('respuesta inválida → serie vacía', () => {
    expect(parsearSerieBcrp({ error: 'x' }).size).toBe(0)
    expect(tipoCambioDelDia(parsearSerieBcrp(null), '2026-11-11')).toBeNull()
  })
})
