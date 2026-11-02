import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { clienteFalso, crearDb, type DbFalsa } from '@/test/supabaseFalso'

let db: DbFalsa

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => clienteFalso(db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso(db) }))

const { DELETE } = await import('./route')

const borrar = (id = 'g1') => DELETE(new NextRequest(`http://x/api/finanzas/gastos-conductor?id=${id}`, { method: 'DELETE' }))
const gastos = () => db.tablas.gastos_conductor
const calendario = () => db.tablas.calendario_pagos

beforeEach(() => {
  db = crearDb({ profile: { role: 'admin' } })
  gastos().push({ id: 'g1', estado: 'pendiente' })
  calendario().push({ id: 'c1', gasto_conductor_id: 'g1', registro_id: null })
})

describe('DELETE /api/finanzas/gastos-conductor', () => {
  it('borra gasto pendiente y su calendario', async () => {
    expect((await borrar()).status).toBe(200)
    expect(gastos()).toHaveLength(0)
    expect(calendario()).toHaveLength(0)
  })

  it('H09: gasto pagado no se borra', async () => {
    gastos()[0].estado = 'pagado'
    expect((await borrar()).status).toBe(409)
    expect(gastos()).toHaveLength(1)
    expect(calendario()).toHaveLength(1)
  })

  it('H09: gasto con pago vinculado no se borra aunque figure pendiente', async () => {
    calendario()[0].registro_id = 'r1'
    expect((await borrar()).status).toBe(409)
    expect(gastos()).toHaveLength(1)
  })

  it('sin sesión → 401; sin permiso → 403; sin cambios', async () => {
    db.user = null
    expect((await borrar()).status).toBe(401)
    db.user = { id: 'u1' }
    db.profile = { role: 'conductor', module_permissions: {} }
    expect((await borrar()).status).toBe(403)
    expect(gastos()).toHaveLength(1)
  })

  it('permiso pagos con can_delete=false → 403', async () => {
    db.profile = { role: 'finanzas', module_permissions: { pagos: { enabled: true, can_delete: false } } }
    expect((await borrar()).status).toBe(403)
  })

  it('gasto inexistente → 404', async () => {
    expect((await borrar('nope')).status).toBe(404)
  })
})
