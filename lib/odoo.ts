// Cliente JSON-RPC de Odoo compartido por las rutas del servidor.
//
// Antes cada ruta tenía su propia copia de odooAuth/odooCall y se autenticaba
// en cada request (un viaje extra a Odoo). Acá el uid se recuerda unos minutos
// y las autenticaciones simultáneas comparten un solo viaje. El uid no expira
// en Odoo (cada llamada viaja con la API key), el TTL solo acota el caso de que
// cambien las credenciales.

export const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
export const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
export const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
export const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

const AUTH_TTL_MS = 10 * 60_000

let authCache: { uid: number; expiresAt: number } | null = null
let authInFlight: Promise<number> | null = null

async function rpc(service: string, method: string, args: unknown[]): Promise<{ result?: unknown; error?: { message?: string; data?: { message?: string } } }> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Datos operativos en vivo: nunca se sirven desde la caché de fetch de Next
    cache: 'no-store',
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
  })
  return res.json()
}

const errorMsg = (e: { message?: string; data?: { message?: string } }) => e.data?.message ?? e.message ?? 'error desconocido'

/** uid de Odoo para las llamadas. Cacheado; pasar `force` para reautenticar. */
export async function odooAuth(force = false): Promise<number> {
  if (!force && authCache && authCache.expiresAt > Date.now()) return authCache.uid
  if (authInFlight) return authInFlight

  authInFlight = (async () => {
    const data = await rpc('common', 'authenticate', [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}])
    if (data.error) throw new Error(`Autenticación Odoo fallida: ${errorMsg(data.error)}`)
    if (!data.result) throw new Error('Autenticación Odoo fallida: credenciales incorrectas')
    const uid = data.result as number
    authCache = { uid, expiresAt: Date.now() + AUTH_TTL_MS }
    return uid
  })()

  try {
    return await authInFlight
  } finally {
    authInFlight = null
  }
}

/** execute_kw sobre un modelo de Odoo. */
export async function odooCall<T = unknown>(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const data = await rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs])
  if (data.error) {
    // Credenciales cambiadas/revocadas: se descarta el uid cacheado para que
    // la próxima request se vuelva a autenticar.
    if (/access ?denied|session|authenticat/i.test(errorMsg(data.error))) authCache = null
    throw new Error(errorMsg(data.error))
  }
  return data.result as T
}
