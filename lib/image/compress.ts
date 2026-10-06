/**
 * Comprime una imagen en el navegador antes de subirla a Storage:
 * la redimensiona para que su lado mayor no pase de `maxSize` y la
 * re-codifica como JPEG. Si el archivo no es una imagen comprimible, ya
 * es liviano, o el resultado sale más pesado, devuelve el original.
 */
export interface CompressOptions {
  /** Lado mayor máximo en px */
  maxSize?: number
  /** Calidad JPEG (0-1) */
  quality?: number
  /** Por debajo de este peso (bytes) no se toca el archivo */
  skipBelowBytes?: number
}

const COMPRESSIBLE = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Algunos navegadores no decodifican ciertos formatos con createImageBitmap
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxSize = 1600, quality = 0.7, skipBelowBytes = 300 * 1024 } = opts

  if (!COMPRESSIBLE.includes(file.type.toLowerCase())) return file
  if (file.size <= skipBelowBytes) return file

  try {
    const source = await loadBitmap(file)
    const w = 'naturalWidth' in source ? source.naturalWidth : source.width
    const h = 'naturalHeight' in source ? source.naturalHeight : source.height
    const scale = Math.min(1, maxSize / Math.max(w, h))
    const width = Math.round(w * scale)
    const height = Math.round(h * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Fondo blanco para PNG con transparencia (JPEG no tiene alfa)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    if ('close' in source) source.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (err) {
    console.warn('No se pudo comprimir la imagen, se sube la original:', err)
    return file
  }
}
