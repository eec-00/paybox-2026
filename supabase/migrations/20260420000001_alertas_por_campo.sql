-- =============================================================
-- Migrar alertas de array plano a estructura por campo
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- Convertir filas existentes que tengan el formato antiguo (array) al nuevo (objeto)
UPDATE automatizacion_config
SET alertas = jsonb_build_object('_global', alertas)
WHERE jsonb_typeof(alertas) = 'array';

-- Nuevo default con la estructura objeto
ALTER TABLE automatizacion_config
  ALTER COLUMN alertas SET DEFAULT
    '{"_global":[{"dias":7,"activo":true,"nombre":"1 semana"},{"dias":30,"activo":true,"nombre":"1 mes"},{"dias":90,"activo":true,"nombre":"3 meses"}]}';
