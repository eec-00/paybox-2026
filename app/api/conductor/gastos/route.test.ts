import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa
let tareas: { name: string }[]

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/odoo', () => ({
  odooAuth: async () => 1,
  odooCall: async (_u: number, _m: string, metodo: string) =>
    metodo === 'fields_get' ? { x_studio_conductor: { type: 'many2one' } } : tareas,
}))

const { POST, PATCH } = await import('./route')

const ID = '11111111-1111-4111-8111-111111111111'
const cuerpo = { id: ID, servicioId: 10, descripcion: 'Peaje', monto: 12.5, moneda: 'soles', fotos: [] }
const req = (metodo: string, body: unknown) =>
  new NextRequest('http://x/api/conductor/gastos', { method: metodo, body: JSON.stringify(body) })
const gastos = () => db.tablas.gastos_conductor
const calendario = () => db.tablas.calendario_pagos

beforeEach(() => {
  db = crearDb()
  tareas = [{ name: 'S09001 - Servicio real' }]
})

describe('POST /api/conductor/gastos', () => {
  it('registra gasto y calendario, con el nombre real de Odoo', async () => {
    const res = await POST(req('POST', { ...cuerpo, servicioNombre: 'Inventado' }))
    expect(res.status).toBe(200)
    expect(gastos()[0]).toMatchObject({ id: ID, servicio_nombre: 'S09001 - Servicio real', conductor_id: 'u1' })
    expect(calendario()).toHaveLength(1)
    expect(calendario()[0].gasto_conductor_id).toBe(ID)
  })

  it('sin sesión → 401 y sin escritura', async () => {
    db.user = null
    expect((await POST(req('POST', cuerpo))).status).toBe(401)
    expect(gastos()).toHaveLength(0)
  })

  it('no conductor → 403 y sin escritura', async () => {
    db.profile = { role: 'admin' }
    expect((await POST(req('POST', cuerpo))).status).toBe(403)
    expect(gastos()).toHaveLength(0)
  })

  it('servicio ajeno → 403 y sin escritura', async () => {
    tareas = []
    expect((await POST(req('POST', cuerpo))).status).toBe(403)
    expect(gastos()).toHaveLength(0)
  })

  it('moneda inválida → 400', async () => {
    expect((await POST(req('POST', { ...cuerpo, moneda: 'euros' }))).status).toBe(400)
  })

  it('doble envío con el mismo id no duplica', async () => {
    expect((await POST(req('POST', cuerpo))).status).toBe(200)
    expect((await POST(req('POST', cuerpo))).status).toBe(200)
    expect(gastos()).toHaveLength(1)
    expect(calendario()).toHaveLength(1)
  })

  it('USD conserva moneda en gasto y calendario', async () => {
    await POST(req('POST', { ...cuerpo, moneda: 'dolares' }))
    expect([gastos()[0].moneda, calendario()[0].moneda]).toEqual(['dolares', 'dolares'])
  })

  it('H04: si falla el calendario avisa, y el reintento lo completa sin duplicar', async () => {
    db.fallar.add('calendario_pagos')
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fallo = await POST(req('POST', cuerpo))
    expect(fallo.status).toBe(500)
    expect(await fallo.json()).toMatchObject({ gastoId: ID })
    expect(espia).toHaveBeenCalled()
    expect(calendario()).toHaveLength(0)

    expect((await POST(req('POST', cuerpo))).status).toBe(200)
    expect(gastos()).toHaveLength(1)
    expect(calendario()).toHaveLength(1)
    espia.mockRestore()
  })

  it('un id de otro conductor no expone ni reescribe su gasto', async () => {
    gastos().push({ id: ID, conductor_id: 'otro', estado: 'pendiente' })
    expect((await POST(req('POST', cuerpo))).status).toBe(409)
    expect(gastos()).toHaveLength(1)
    expect(calendario()).toHaveLength(0)
  })
})

describe('PATCH /api/conductor/gastos', () => {
  beforeEach(() => {
    db.profile = { role: 'admin' }
    gastos().push({ id: ID, estado: 'pendiente' })
    calendario().push({ id: 'c1', gasto_conductor_id: ID, estado: 'pendiente', registro_id: null })
  })

  it('marca pagado y guarda el vínculo al registro', async () => {
    expect((await PATCH(req('PATCH', { id: ID, registroId: 'r1' }))).status).toBe(200)
    expect(gastos()[0].estado).toBe('pagado')
    expect(calendario()[0]).toMatchObject({ estado: 'pagado', registro_id: 'r1' })
  })

  it('segundo pago del mismo gasto → 409, sin pisar el vínculo', async () => {
    await PATCH(req('PATCH', { id: ID, registroId: 'r1' }))
    expect((await PATCH(req('PATCH', { id: ID, registroId: 'r2' }))).status).toBe(409)
    expect(calendario()[0].registro_id).toBe('r1')
  })

  it('sin permiso de Finanzas → 403 y sin cambios', async () => {
    db.profile = { role: 'conductor', module_permissions: {} }
    expect((await PATCH(req('PATCH', { id: ID }))).status).toBe(403)
    expect(gastos()[0].estado).toBe('pendiente')
  })

  it('con permiso de módulo pagos pasa', async () => {
    db.profile = { role: 'finanzas', module_permissions: { pagos: { enabled: true } } }
    expect((await PATCH(req('PATCH', { id: ID }))).status).toBe(200)
  })

  it('fallo del calendario se informa', async () => {
    db.fallar.add('calendario_pagos')
    expect((await PATCH(req('PATCH', { id: ID }))).status).toBe(500)
  })
})
