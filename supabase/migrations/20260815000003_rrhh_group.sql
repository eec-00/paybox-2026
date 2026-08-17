-- ============================================================================
-- AGRUPA VACACIONES + ASISTENCIA BAJO UN SOLO PERMISO "Recursos Humanos"
-- ============================================================================

-- 1. Denormaliza el nombre/DNI del conductor en cada marca de asistencia
--    (mismo criterio que gastos_conductor.conductor_nombre): evita que la
--    vista de administración necesite leer user_profiles, que solo admins
--    pueden listar completo.
ALTER TABLE public.asistencias_conductor
  ADD COLUMN IF NOT EXISTS conductor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS conductor_dni    TEXT;

-- 2. Migra cualquier module_permissions.vacaciones ya configurado a la nueva
--    clave "rrhh" (no debería haber datos aún, pero por seguridad).
UPDATE public.user_profiles
SET module_permissions = (module_permissions - 'vacaciones') || jsonb_build_object('rrhh', module_permissions->'vacaciones')
WHERE module_permissions ? 'vacaciones';

-- 3. can_manage_vacaciones() ahora gobierna todo el módulo de Recursos
--    Humanos (Vacaciones + Asistencia); se mantiene el nombre para no tener
--    que reescribir las políticas ya creadas sobre vacaciones_* que la usan.
CREATE OR REPLACE FUNCTION public.can_manage_vacaciones(perm TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_role  public.user_role;
  v_perms JSONB;
BEGIN
  SELECT role, module_permissions INTO v_role, v_perms
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF v_role IN ('admin', 'developer') THEN
    RETURN TRUE;
  END IF;

  IF v_perms IS NULL OR (v_perms->'rrhh'->>'enabled') IS DISTINCT FROM 'true' THEN
    RETURN FALSE;
  END IF;

  IF perm IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN (v_perms->'rrhh'->>perm) = 'true';
END;
$$;

COMMENT ON FUNCTION public.can_manage_vacaciones(TEXT) IS
  'TRUE si el usuario actual (admin/developer o con module_permissions.rrhh) puede administrar Recursos Humanos (Vacaciones + Asistencia). Pasar can_create/can_edit/can_delete para chequear una acción puntual.';

-- 4. Reemplaza las políticas admin-only de asistencias_conductor por el
--    mismo criterio de permiso de RRHH usado en las tablas de vacaciones.
DROP POLICY IF EXISTS "asistencias_conductor_select_admin" ON public.asistencias_conductor;
DROP POLICY IF EXISTS "asistencias_conductor_delete_admin" ON public.asistencias_conductor;

CREATE POLICY "asistencias_conductor_select_rrhh"
  ON public.asistencias_conductor FOR SELECT
  USING (public.can_manage_vacaciones());

CREATE POLICY "asistencias_conductor_delete_rrhh"
  ON public.asistencias_conductor FOR DELETE
  USING (public.can_manage_vacaciones('can_delete'));
