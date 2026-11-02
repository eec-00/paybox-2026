import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso(db) }))

const { GET } = await import('./route')

const abrir = (ruta: string) =>
  GET(new NextRequest(`http://x/api/archivos?ruta=${encodeURIComponent(ruta)}`))

beforeEach(() => {
  db = crearDb()
})

describe('GET /api/archivos', () => {
  it('sin sesión → 401, sin enlace al archivo', async () => {
    db.user = null
    const res = await abrir('gastos-conductor/a.jpg')
    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
  })

  it('con sesión redirige a una URL temporal de 60 s', async () => {
    const res = await abrir('gastos-conductor/a.jpg')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://storage.test/comprobantes/gastos-conductor/a.jpg?exp=60')
    expect(res.headers.get('cache-control')).toBe('private, max-age=30')
  })

  it.each(['', '/a.jpg', '../secreto', 'a/../../b'])('rechaza ruta «%s»', async ruta => {
    expect((await abrir(ruta)).status).toBe(400)
  })

  it('archivo inexistente → 404', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await abrir('no-existe.jpg')).status).toBe(404)
    espia.mockRestore()
  })
})
