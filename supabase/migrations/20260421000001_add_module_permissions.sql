-- Añade permisos por módulo a user_profiles
-- NULL = acceso a todos los módulos (comportamiento por defecto / admins)
-- Array de IDs = solo esos módulos visibles para el usuario

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT NULL;

COMMENT ON COLUMN user_profiles.allowed_modules IS
  'NULL = acceso total (admin). Array de section IDs permitidos para usuarios restringidos. Ej: {pagos, automatizacion, trailers}';

-- Actualiza get_my_profile para incluir allowed_modules y last_sign_in_at
DROP FUNCTION IF EXISTS public.get_my_profile();
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role user_role,
  can_create BOOLEAN,
  can_edit BOOLEAN,
  can_delete BOOLEAN,
  allowed_modules TEXT[],
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    id,
    email,
    full_name,
    role,
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_create END as can_create,
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_edit END as can_edit,
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_delete END as can_delete,
    CASE WHEN role IN ('admin', 'developer') THEN NULL ELSE allowed_modules END as allowed_modules,
    created_at,
    updated_at,
    last_sign_in_at
  FROM user_profiles
  WHERE id = auth.uid()
$$;
