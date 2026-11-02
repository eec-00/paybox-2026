// Recorre las rutas del personal: si se agrega una sin exigirPersonal, falla acá.

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa
const externo = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso(db) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => clienteFalso(db) }))
vi.mock('@/lib/odoo', () => ({ odooAuth: externo, odooCall: externo }))
vi.mock('openai', () => ({ default: class { chat = { completions: { create: externo } } } }))

const RAIZ = join(process.cwd(), 'app', 'api')

function rutasBajo(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return dir.endsWith('route.ts') ? [dir] : []
  return readdirSync(dir).flatMap(n => rutasBajo(join(dir, n)))
}

const RUTAS = [
  'automatizacion', 'navitel', 'sunat', 'ocr', 'odoo-axis-options',
  join('servicios', '[id]', 'geoenlace-automatico'),
].flatMap(d => rutasBajo(join(RAIZ, d)))

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type Handler = (req: Request, ctx: unknown) => Promise<Response>

beforeEach(() => {
  db = crearDb()
  externo.mockClear()
  vi.unstubAllGlobals()
})

it('encuentra las rutas', () => {
  expect(RUTAS.length).toBe(29)
})

describe.each(RUTAS.map(r => [relative(RAIZ, r).replaceAll('\\', '/'), r]))('%s', (_, archivo) => {
  it('sin sesión → 401, conductor → 403, sin llamar a terceros', async () => {
    const mod = await import(/* @vite-ignore */ archivo) as Partial<Record<(typeof METODOS)[number], Handler>>
    const handlers = METODOS.filter(m => mod[m])
    expect(handlers.length).toBeGreaterThan(0)

    // Después de importar: algunas librerías usan fetch al cargarse
    vi.stubGlobal('fetch', externo)

    for (const metodo of handlers) {
      const llamar = () => mod[metodo]!(
        new Request('http://x/api', { method: metodo, ...(metodo === 'GET' ? {} : { body: '{}' }) }),
        { params: Promise.resolve({ id: '1' }) },
      )

      db.user = null
      expect((await llamar()).status, metodo).toBe(401)

      db = crearDb()
      expect((await llamar()).status, metodo).toBe(403)
    }
    expect(externo).not.toHaveBeenCalled()
  })
})

describe('exigirPersonal', () => {
  it('deja pasar a cualquier rol que no sea conductor', async () => {
    const { exigirPersonal } = await import('@/lib/supabase/permisos')
    for (const role of ['admin', 'developer', 'finanzas', 'user']) {
      db.profile = { role }
      expect(await exigirPersonal()).toBeNull()
    }
  })

  it('sin perfil → 403', async () => {
    const { exigirPersonal } = await import('@/lib/supabase/permisos')
    db.profile = null
    expect((await exigirPersonal())?.status).toBe(403)
  })
})
