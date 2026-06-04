const SUNAT_CLIENT_ID = (process.env.SUNAT_CLIENT_ID || '').trim()
const SUNAT_CLIENT_SECRET = (process.env.SUNAT_CLIENT_SECRET || '').trim()
const SUNAT_RUC = (process.env.SUNAT_RUC || '').trim()
const SUNAT_SOL_USER = (process.env.SUNAT_SOL_USER || '').trim()
const SUNAT_SOL_PASS = (process.env.SUNAT_SOL_PASS || '').trim()

// clientessol = GRE Desktop | clientesextranet = consulta Web
const TOKEN_URL = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${SUNAT_CLIENT_ID}/oauth2/token/`
const GRE_BASE = 'https://api-cpe.sunat.gob.pe'

let cachedToken: { value: string; expiresAt: number; isSession?: boolean } | null = null

export async function getSunatToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'https://api-cpe.sunat.gob.pe',
    client_id: SUNAT_CLIENT_ID,
    client_secret: SUNAT_CLIENT_SECRET,
    username: SUNAT_SOL_USER,
    password: SUNAT_SOL_PASS,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const rawText = await res.text()

  if (!res.ok) {
    throw new Error(`SUNAT auth error ${res.status}: ${rawText}`)
  }

  // 204 = SUNAT Desktop session flow — cookie IS the auth credential
  if (res.status === 204) {
    const setCookie = res.headers.get('set-cookie')
    if (!setCookie) throw new Error('SUNAT: 204 sin cookie de sesión')

    const cookieValue = setCookie.split(';')[0]
    console.log('[sunat token] session established via cookie')

    // Cache cookie as "token" — 55 min expiry (SUNAT sessions ~1hr)
    cachedToken = {
      value: cookieValue,
      expiresAt: Date.now() + 55 * 60 * 1000,
      isSession: true,
    }
    return cachedToken.value
  }

  if (!rawText) throw new Error(`SUNAT auth: respuesta vacía (status ${res.status})`)

  const data = JSON.parse(rawText)
  const expiresIn: number = data.expires_in ?? 3600

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  }

  return cachedToken.value
}

export async function sunatFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const credential = await getSunatToken()
  const authHeader = cachedToken?.isSession
    ? { Cookie: credential }
    : { Authorization: `Bearer ${credential}` }

  return fetch(`${GRE_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(options.headers ?? {}),
    },
  })
}
