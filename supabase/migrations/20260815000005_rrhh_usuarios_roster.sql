-- ============================================================================
-- ROSTER DE USUARIOS PARA RECURSOS HUMANOS (Vacaciones + Asistencia)
--
-- Las políticas RLS de user_profiles solo dejan listar TODOS los perfiles a
-- role = 'admin' (ni siquiera 'developer'). Eso impedía:
--   - En Vacaciones: vincular un trabajador a su cuenta si quien administra
--     no es 'admin' literal.
--   - En Asistencia: mostrar el roster completo de conductores (quién marcó
--     y quién no) a cualquiera con permiso de RRHH.
--
-- Esta función expone solo los campos mínimos (sin datos sensibles) a quien
-- tenga permiso de RRHH (can_manage_vacaciones), sin tocar las políticas
-- generales de user_profiles.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_rrhh_usuarios()
RETURNS TABLE (
  id                  UUID,
  full_name           TEXT,
  email               TEXT,
  role                public.user_role,
  dni                 TEXT,
  odoo_employee_name  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.can_manage_vacaciones() THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT up.id, up.full_name, up.email, up.role, up.dni, up.odoo_employee_name
    FROM public.user_profiles up
    ORDER BY up.full_name;
END;
$$;

COMMENT ON FUNCTION public.get_rrhh_usuarios() IS
  'Lista de usuarios (id, nombre, email, rol, DNI) para quien tenga permiso de Recursos Humanos: vincular trabajadores en Vacaciones y listar el roster de conductores en Asistencia. Devuelve 0 filas si el usuario actual no tiene permiso.';
