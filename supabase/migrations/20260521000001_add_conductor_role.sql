-- ============================================================
-- Portal del Conductor: nuevo rol + campos de vinculación Odoo
-- ============================================================

-- 1. Agregar valor al ENUM (solo si no existe)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'conductor';

-- 2. Columnas nuevas en user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS dni                TEXT,
  ADD COLUMN IF NOT EXISTS odoo_employee_id   INTEGER,
  ADD COLUMN IF NOT EXISTS odoo_employee_name TEXT;

-- 3. DNI único por conductor
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_dni
  ON public.user_profiles(dni)
  WHERE dni IS NOT NULL;

-- 4. Actualizar get_my_profile() con los nuevos campos
DROP FUNCTION IF EXISTS public.get_my_profile();
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id                  UUID,
  email               TEXT,
  full_name           TEXT,
  role                user_role,
  can_create          BOOLEAN,
  can_edit            BOOLEAN,
  can_delete          BOOLEAN,
  module_permissions  JSONB,
  dni                 TEXT,
  odoo_employee_id    INTEGER,
  odoo_employee_name  TEXT,
  created_at          TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE
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
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_create END,
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_edit   END,
    CASE WHEN role IN ('admin', 'developer') THEN TRUE ELSE can_delete END,
    module_permissions,
    dni,
    odoo_employee_id,
    odoo_employee_name,
    created_at,
    updated_at
  FROM public.user_profiles
  WHERE id = auth.uid();
$$;
