import { describe, expect, it } from 'vitest'
import { compararCrosland } from './comparacionMotor'
import type { DevolucionPago, ServicioPago } from './pagosConductores'

const servicio = (over: Partial<ServicioPago> = {}): ServicioPago => ({
  id: 1, name: 'S09001 - Servicio', fecha: '2026-10-16', etapa: 'Servicio Finalizado', cliente: 'CROSLAND SAC',
  conductorId: 1, conductor: 'A', placa: null, horaCita: null, flujo: 'importacion',
  devolucionOtroConductor: false, horarios: { inicio: null, fin: null, devolucion: null, linea: [] },
  atributos: { tipoServicio: 'Importación', modalidad: 'Contenedor 20', tipoCarga: 'General', zona: 'Zona 3' },
  ...over,
})
const devolucion = (over: Partial<DevolucionPago> = {}): DevolucionPago => ({
  id: 2, name: 'Devolución', etapa: 'Servicio Finalizado', conductorId: 2, conductor: 'B', almacen: 'Almacén',
  fecha: '2026-10-16', padreId: 1, padreName: 'S09001 - Servicio', padreConductorId: 1, padreConductor: 'A',
  ...over,
})

describe('compararCrosland', () => {
  it('mismo conductor: sin diferencia si la zona da S/90', () => {
    expect(compararCrosland([servicio()], [])[0]).toMatchObject({ anterior: 90, motor: 90, diferencia: 0 })
  })

  it('otro conductor: muestra los S/20 de más', () => {
    expect(compararCrosland([servicio({ devolucionOtroConductor: true })], [devolucion()])[0])
      .toMatchObject({ anterior: 110, motor: 90, diferencia: -20, conductorRetorno: 'B' })
  })

  it('DPW: 120 contra 100', () => {
    expect(compararCrosland([servicio({ devolucionOtroConductor: true })], [devolucion({ almacen: 'DPW Callao' })])[0])
      .toMatchObject({ anterior: 120, motor: 100, diferencia: -20 })
  })

  it('zona distinta deja ver la diferencia de RF-040', () => {
    const atributos = { ...servicio().atributos, zona: 'Zona 1' }
    expect(compararCrosland([servicio({ atributos })], [])[0]).toMatchObject({ anterior: 70, motor: 90, diferencia: 20 })
  })

  it('sin tarifa por zona: el motor igual calcula, sin diferencia', () => {
    const atributos = { ...servicio().atributos, zona: 'Zona 6' }
    expect(compararCrosland([servicio({ atributos })], [])[0]).toMatchObject({ anterior: null, motor: 90, diferencia: null })
  })

  it('retorno de otro sin subtarea, sin finalizar o duplicado va a revisión', () => {
    const otro = servicio({ devolucionOtroConductor: true })
    expect(compararCrosland([otro], [])[0]).toMatchObject({ motor: null, diferencia: null })
    expect(compararCrosland([otro], [devolucion({ etapa: 'En curso' })])[0].motor).toBeNull()
    expect(compararCrosland([otro], [devolucion(), devolucion({ id: 3 })])[0].motivo).toContain('Más de una')
  })

  it('ignora otros clientes y exportaciones', () => {
    expect(compararCrosland([servicio({ cliente: 'OTRO' }), servicio({ flujo: 'exportacion' })], [])).toEqual([])
  })
})
