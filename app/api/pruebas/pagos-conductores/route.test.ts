import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa
const odooAuth = vi.fn(async () => 1)

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso(db) }))
vi.mock('@/lib/odoo', () => ({ odooAuth, odooCall: async () => [] }))

const { GET } = await import('./route')

const consultar = (query = '?start=2026-10-10&end=2026-10-16') =>
  GET(new Request(`http://x/api/pruebas/pagos-conductores${query}`))

beforeEach(() => {
  db = crearDb()
  odooAuth.mockClear()
})

describe('GET /api/pruebas/pagos-conductores', () => {
  it('sin sesión → 401 y no consulta Odoo', async () => {
    db.user = null
    expect((await consultar()).status).toBe(401)
    expect(odooAuth).not.toHaveBeenCalled()
  })

  it('conductor → 403 y no consulta Odoo', async () => {
    expect((await consultar()).status).toBe(403)
    expect(odooAuth).not.toHaveBeenCalled()
  })

  it('admin y developer pasan el permiso', async () => {
    for (const role of ['admin', 'developer']) {
      db.profile = { role }
      expect((await consultar('?start=mal&end=mal')).status).toBe(400)
    }
  })
})
