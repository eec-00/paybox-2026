import { BUCKET_COMPROBANTES } from '@/lib/archivos'
import { createAdminClient } from '@/lib/supabase/admin'

/** URL temporal de un archivo del bucket. SOLO en el servidor. */
export async function firmarComprobante(ruta: string, segundos: number): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_COMPROBANTES)
    .createSignedUrl(ruta, segundos)
  if (error) {
    console.error('No se pudo firmar el archivo:', ruta, error.message)
    return null
  }
  return data.signedUrl
}
