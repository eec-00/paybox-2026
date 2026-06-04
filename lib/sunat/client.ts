import { createAdminClient } from '@/lib/supabase/admin'

const GRE_BASE = 'https://api-cpe.sunat.gob.pe'
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getSunatToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sunat_tokens')
    .select('access_token, expires_at')
    .eq('id', SINGLETON_ID)
    .single()

  if (error || !data?.access_token) {
    throw new Error('Token SUNAT no configurado. Ve a /sunat y pega el Bearer token.')
  }

  const expiresAt = new Date(data.expires_at).getTime()
  if (Date.now() >= expiresAt) {
    throw new Error('Token SUNAT expirado. Ve a /sunat y pega un nuevo Bearer token.')
  }

  cachedToken = { value: data.access_token, expiresAt }
  return data.access_token
}

export async function sunatFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSunatToken()
  return fetch(`${GRE_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'es-PE,es;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      Origin: 'https://e-factura.sunat.gob.pe',
      Referer: 'https://e-factura.sunat.gob.pe/',
      ...(options.headers ?? {}),
    },
  })
}
