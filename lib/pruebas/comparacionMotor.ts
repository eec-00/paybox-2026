// Compara, por servicio Crosland de importación, lo que hoy muestra el módulo
// Pruebas con lo que daría el motor nuevo. Solo para revisar con Margiory y
// Rosario: no es monto de pago. Odoo aún no da la fecha real del retorno, así
// que acá se usa la programada y la comparación no sirve para asignar semana.

import { calcularTarifa, servicioCodigo, type DevolucionPago, type ServicioPago } from './pagosConductores'
import { esFinalizado, esPuerto } from './adicionalesConductores'
import { liquidarCrosland, type Tramo } from './motorConductores'

export interface ComparacionCrosland {
  servicioId: number
  servicio: string
  conductor: string | null
  conductorRetorno: string | null
  anterior: number | null
  motor: number | null
  diferencia: number | null
  /** Por qué el motor no da importe */
  motivo: string | null
}

function retornoDe(s: ServicioPago, subtareas: DevolucionPago[]): Tramo | null {
  const [d] = subtareas
  if (d) {
    return {
      servicio: servicioCodigo(s.name), tipo: 'retorno', conductorId: d.conductorId,
      fechaEjecucion: d.fecha || null, acreditado: esFinalizado(d.etapa), almacen: d.almacen,
    }
  }
  if (s.devolucionOtroConductor) return null
  return {
    servicio: servicioCodigo(s.name), tipo: 'retorno', conductorId: s.conductorId,
    fechaEjecucion: s.fecha || null, acreditado: esFinalizado(s.etapa),
  }
}

/** Tarifa por zona más S/20 o S/30 si otro conductor hizo la devolución. */
function montoAnterior(s: ServicioPago, d: DevolucionPago | undefined): number | null {
  const tarifa = calcularTarifa(s.atributos).monto
  if (tarifa === null) return null
  if (!d?.conductorId || d.conductorId === s.conductorId) return tarifa
  return tarifa + (esPuerto(d.almacen) ? 30 : 20)
}

export function compararCrosland(servicios: ServicioPago[], devoluciones: DevolucionPago[]): ComparacionCrosland[] {
  return servicios
    .filter(s => s.flujo === 'importacion' && (s.cliente ?? '').toUpperCase().includes('CROSLAND'))
    .map(s => {
      const subtareas = devoluciones.filter(d => d.padreId === s.id)
      const anterior = montoAnterior(s, subtareas[0])
      const base = {
        servicioId: s.id, servicio: servicioCodigo(s.name), conductor: s.conductor,
        conductorRetorno: subtareas[0]?.conductor ?? (s.devolucionOtroConductor ? null : s.conductor), anterior,
      }
      if (subtareas.length > 1) return { ...base, motor: null, diferencia: null, motivo: 'Más de una devolución en el servicio' }

      const lineas = liquidarCrosland({
        servicio: servicioCodigo(s.name), tipo: 'principal', conductorId: s.conductorId,
        fechaEjecucion: s.fecha || null, acreditado: esFinalizado(s.etapa),
      }, retornoDe(s, subtareas))

      const enRevision = lineas.find(l => l.estado === 'revision')
      const motor = enRevision ? null : lineas.reduce((t, l) => t + l.monto!, 0)
      return {
        ...base, motor, motivo: enRevision?.motivo ?? null,
        diferencia: motor !== null && anterior !== null ? motor - anterior : null,
      }
    })
}
