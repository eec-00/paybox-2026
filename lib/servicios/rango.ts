// Ventana por defecto de servicios que se bajan de Odoo. El proyecto ya pasa
// las 2500 tareas y crece cada día: bajar todo en cada carga de Trailers y
// Sobrecostos es lento. Lo más antiguo queda a un clic con
// "Ver histórico".
export const DIAS_RECIENTES = 45

/** Fecha (YYYY-MM-DD, hora local) de hace `dias` días — el corte de la ventana. */
export function fechaCorte(dias: number = DIAS_RECIENTES): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** URL de la lista de servicios: últimos DIAS_RECIENTES días, o todo si `historico`. */
export function serviciosUrl(historico: boolean): string {
  return historico ? '/api/servicios' : `/api/servicios?dias=${DIAS_RECIENTES}`
}
