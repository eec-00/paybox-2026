// Quién puede ver y quién puede modificar servicios desde el panel. Regla
// única para el servidor (rutas /api/servicios*) y la pantalla (qué botones
// se muestran), así no se desalinean.

interface PerfilPermisos {
  role?: string | null
  can_edit?: boolean | null
  module_permissions?: { servicios?: { enabled?: boolean; can_edit?: boolean } } | null
}

const esAdmin = (p: PerfilPermisos) => p.role === 'admin' || p.role === 'developer'

/** Ver el módulo. Sin module_permissions = acceso a todo (igual que el Sidebar). */
export function puedeVerServicios(p: PerfilPermisos | null | undefined): boolean {
  if (!p || p.role === 'conductor') return false
  if (esAdmin(p) || !p.module_permissions) return true
  return p.module_permissions.servicios?.enabled === true
}

/** Editar, reiniciar, finalizar y cambiar de etapa. El rol "viewer" nunca;
 * el resto según su permiso "editar" de Servicios (o el global si no tiene
 * permisos por módulo). */
export function puedeEditarServicios(p: PerfilPermisos | null | undefined): boolean {
  if (!puedeVerServicios(p) || p!.role === 'viewer') return false
  if (esAdmin(p!)) return true
  if (!p!.module_permissions) return p!.can_edit === true
  return p!.module_permissions.servicios?.can_edit === true
}

export const SIN_PERMISO_EDITAR = 'No tienes permiso para modificar servicios (solo lectura)'
