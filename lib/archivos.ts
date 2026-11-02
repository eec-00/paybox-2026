// Las fotos y comprobantes se guardan en la base con su URL pública de Storage.
// Para que solo se vean con sesión, al mostrarlos se pasa por /api/archivos: así
// no hay que reescribir lo ya guardado y sirve con el bucket público o privado.

export const BUCKET_COMPROBANTES = 'comprobantes'

const MARCA = `/storage/v1/object/public/${BUCKET_COMPROBANTES}/`

/** Ruta dentro del bucket, o null si la URL no es de un comprobante. */
export function rutaComprobante(url: string): string | null {
  const inicio = url.indexOf(MARCA)
  if (inicio === -1) return null
  try {
    return decodeURIComponent(url.slice(inicio + MARCA.length).split('?')[0]) || null
  } catch {
    return null
  }
}

/** URL para mostrar un archivo. Lo que no es del bucket queda igual (ej. blob:). */
export function urlArchivo(url: string): string {
  const ruta = rutaComprobante(url)
  return ruta ? `/api/archivos?ruta=${encodeURIComponent(ruta)}` : url
}
