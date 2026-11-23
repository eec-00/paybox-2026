import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa
let tareas: { name: string }[]

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso(db) }))
vi.mock('@/lib/odoo', () => ({
  odooAuth: async () => 1,
  odooCall: async (_u: number, _m: string, metodo: string) =>
    metodo === 'fields_get' ? { x_studio_conductor: { type: 'many2one' } } : tareas,
}))

const { POST } = await import('./route')

const cuerpo = { servicioId: 10, motivo: 'cola_puerto', duermeEnUnidad: true, lat: -12.05, lng: -77.1, precision: 12 }
const req = (body: unknown) => new NextRequest('http://x/api/conductor/pernoctes', { method: 'POST', body: JSON.stringify(body) })
const pernoctes = () => db.tablas.pernoctes_conductor ?? []

beforeEach(() => {
  db = crearDb()
  db.tablas.conductor_servicios_progreso = [{ conductor_id: 'u1', servicio_id: 10, step_actual: 3 }]
  tareas = [{ name: 'S09001 - Servicio real' }]
})

describe('POST /api/conductor/pernoctes', () => {
  it('servicio en curso y con ubicación → registra pendiente e historial', async () => {
    const res = await POST(req(cuerpo))
    expect(res.status).toBe(200)
    expect(pernoctes()[0]).toMatchObject({ servicio_nombre: 'S09001 - Servicio real', estado: 'pendiente', lat: -12.05, conductor_id: 'u1' })
    expect(db.tablas.pernoctes_historial).toHaveLength(1)
  })

  it('servicio sin iniciar o ya finalizado (sin progreso) → 409 y no registra', async () => {
    db.tablas.conductor_servicios_progreso = []
    const res = await POST(req(cuerpo))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/en curso/)
    expect(pernoctes()).toHaveLength(0)
  })

  it('progreso de otro conductor no cuenta', async () => {
    db.tablas.conductor_servicios_progreso = [{ conductor_id: 'otro', servicio_id: 10, step_actual: 3 }]
    expect((await POST(req(cuerpo))).status).toBe(409)
  })

  it('sin ubicación → 400 y no registra', async () => {
    const res = await POST(req({ ...cuerpo, lat: null, lng: null }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ubicación/)
    expect(pernoctes()).toHaveLength(0)
  })

  it('servicio ajeno → 403', async () => {
    tareas = []
    expect((await POST(req(cuerpo))).status).toBe(403)
  })

  it('no conductor → 403', async () => {
    db.profile = { role: 'admin' }
    expect((await POST(req(cuerpo))).status).toBe(403)
  })
})
