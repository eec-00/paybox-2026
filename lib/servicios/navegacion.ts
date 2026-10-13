// Lista de servicios (ya filtrada y ordenada) que se estaba viendo en la tabla
// al abrir un detalle, para poder ir al anterior/siguiente desde ahí
// respetando los mismos filtros. Vive en sessionStorage: si se entra al
// detalle por URL directa no hay lista y no se muestran las flechas.

const KEY = 'servicios:navegacion'

export type ServicioNav = { id: number; codigo: string }

export function guardarListaNavegacion(lista: ServicioNav[]): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(lista)) } catch {}
}

export function vecinosDe(id: number): { anterior: ServicioNav | null; siguiente: ServicioNav | null } | null {
  try {
    const lista = JSON.parse(sessionStorage.getItem(KEY) || 'null') as ServicioNav[] | null
    if (!Array.isArray(lista)) return null
    const i = lista.findIndex((s) => s.id === id)
    if (i === -1) return null
    return { anterior: lista[i - 1] ?? null, siguiente: lista[i + 1] ?? null }
  } catch {
    return null
  }
}
