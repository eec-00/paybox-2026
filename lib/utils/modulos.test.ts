import { describe, expect, it } from 'vitest'
import { puedeVerModulo, seccionesPermitidas } from '@/lib/utils/modulos'

const on = { enabled: true, can_create: false, can_edit: false, can_delete: false }

describe('puedeVerModulo', () => {
  it('admin y developer ven todo, Pruebas incluida', () => {
    for (const role of ['admin', 'developer']) {
      expect(puedeVerModulo({ role, module_permissions: null }, 'pruebas')).toBe(true)
    }
  })

  it('conductor y sin perfil: nada', () => {
    expect(puedeVerModulo({ role: 'conductor' }, 'sunat')).toBe(false)
    expect(puedeVerModulo(null, 'sunat')).toBe(false)
  })

  it('sin permisos por módulo: todo lo histórico menos Pruebas', () => {
    expect(puedeVerModulo({ role: 'user', module_permissions: null }, 'servicios')).toBe(true)
    expect(puedeVerModulo({ role: 'user', module_permissions: null }, 'pruebas')).toBe(false)
  })

  it('Pruebas solo si se la habilitan', () => {
    expect(puedeVerModulo({ role: 'user', module_permissions: { servicios: on } }, 'pruebas')).toBe(false)
    expect(puedeVerModulo({ role: 'user', module_permissions: { pruebas: on } }, 'pruebas')).toBe(true)
  })

  it('perfiles viejos (sin sunat/detracciones) siguen viéndolos', () => {
    const viejo = { role: 'user', module_permissions: { servicios: on } }
    expect(puedeVerModulo(viejo, 'sunat')).toBe(true)
    expect(puedeVerModulo(viejo, 'detracciones')).toBe(true)
    expect(puedeVerModulo(viejo, 'pagos')).toBe(false)
  })

  it('se puede quitar SUNAT explícitamente', () => {
    const p = { role: 'user', module_permissions: { sunat: { ...on, enabled: false } } }
    expect(puedeVerModulo(p, 'sunat')).toBe(false)
  })
})

describe('seccionesPermitidas', () => {
  it('traduce pagos → finanzas', () => {
    expect(seccionesPermitidas({ role: 'user', module_permissions: { pagos: on, pruebas: on } }))
      .toEqual(['finanzas', 'sunat', 'detracciones', 'pruebas'])
  })
})
