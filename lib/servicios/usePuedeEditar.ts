'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserProfile } from '@/lib/utils/auth'
import { puedeEditarServicios } from '@/lib/servicios/permisos'

/** ¿El usuario puede modificar servicios? Arranca en false para que un
 * usuario de solo lectura nunca vea (ni por un instante) los botones de
 * editar/reiniciar/finalizar. El servidor valida igual en cada acción. */
export function usePuedeEditarServicios(): boolean {
  const [puede, setPuede] = useState(false)
  useEffect(() => {
    let vivo = true
    getCurrentUserProfile().then((p) => { if (vivo) setPuede(puedeEditarServicios(p)) })
    return () => { vivo = false }
  }, [])
  return puede
}
