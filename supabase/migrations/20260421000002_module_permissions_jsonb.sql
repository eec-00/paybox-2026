-- Reemplaza allowed_modules TEXT[] por module_permissions JSONB
-- Estructura: { pagos: { enabled, can_create, can_edit, can_delete },
--               servicios: { ... }, automatizacion: { ... } }
-- NULL = acceso total (admin/developer)

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS allowed_modules;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT NULL;

COMMENT ON COLUMN user_profiles.module_permissions IS
  'NULL = acceso total. JSONB con estructura { pagos, servicios, automatizacion } cada uno con { enabled, can_create, can_edit, can_delete }';

-- Actualiza get_my_profile para retornar module_permissions
DROP FUNCTION IF EXISTS public.get_my_profile();
CREATE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role user_role,
  can_create BOOLEAN,
  can_edit BOOLEAN,
  can_delete BOOLEAN,
  module_permissions JSONB,
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
    CASE WHEN role IN ('admin', 'developer') THEN NULL ELSE module_permissions END as module_permissions,
    created_at,
    updated_at,
    last_sign_in_at
  FROM user_profiles
  WHERE id = auth.uid()
$$;
