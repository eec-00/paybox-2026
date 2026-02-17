-- ============================================================================
-- MIGRACIÓN: Agregar rol Developer al ENUM
-- ============================================================================
-- IMPORTANTE: Los nuevos valores de ENUM deben ser committeados antes de usarse
-- Por eso esta migración solo agrega el valor al ENUM

-- Agregar nuevo rol 'developer' al ENUM existente
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'developer';

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================
-- NOTA: Ejecuta la siguiente migración (20260217000003) DESPUÉS de esta
