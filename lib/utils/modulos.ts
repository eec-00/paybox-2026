// Quién ve cada sección del menú. Regla única para el menú, las pantallas y
// el servidor, así no se desalinean.
import { DEFAULT_MODULE_PERMISSIONS, type ModulePermissions } from '@/lib/types/user-profile.types'

interface PerfilModulos {
  role?: string | null
  module_permissions?: Partial<ModulePermissions> | null
}

/** Id del módulo en module_permissions → id de la sección en el menú. */
const SECCION_DE_MODULO: Record<keyof ModulePermissions, string> = {
  pagos: 'finanzas',
  servicios: 'servicios',
  automatizacion: 'automatizacion',
  rrhh: 'rrhh',
  sunat: 'sunat',
  detracciones: 'detracciones',
  pruebas: 'pruebas',
}

const esAdmin = (p: PerfilModulos) => p.role === 'admin' || p.role === 'developer'

/**
 * ¿Puede ver el módulo? Admin y developer, siempre. Sin module_permissions =
 * acceso a todo lo histórico (igual que antes), pero Pruebas nunca: es opt-in.
 */
export function puedeVerModulo(
  p: PerfilModulos | null | undefined,
  modulo: keyof ModulePermissions,
): boolean {
  if (!p || p.role === 'conductor') return false
  if (esAdmin(p)) return true
  if (!p.module_permissions) return modulo !== 'pruebas'
  const access = p.module_permissions[modulo] ?? DEFAULT_MODULE_PERMISSIONS[modulo]
  return access.enabled === true
}

/** Secciones del menú visibles para un usuario que no es admin. */
export function seccionesPermitidas(p: PerfilModulos): string[] {
  return (Object.keys(SECCION_DE_MODULO) as (keyof ModulePermissions)[])
    .filter(m => puedeVerModulo(p, m))
    .map(m => SECCION_DE_MODULO[m])
}
