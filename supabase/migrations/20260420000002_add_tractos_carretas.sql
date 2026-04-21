-- =============================================================
-- Agregar soporte para Tractos y Carretas en automatización
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- 1. Eliminar fila antigua de 'trailers' si existe, luego actualizar constraint
DELETE FROM automatizacion_config WHERE tipo = 'trailers';

ALTER TABLE automatizacion_config
  DROP CONSTRAINT IF EXISTS automatizacion_config_tipo_check;

ALTER TABLE automatizacion_config
  ADD CONSTRAINT automatizacion_config_tipo_check
  CHECK (tipo IN ('conductores', 'tractos', 'carretas'));

-- 2. Columna para email de destino (vehículos no tienen email propio)
ALTER TABLE automatizacion_config
  ADD COLUMN IF NOT EXISTS destination_email TEXT;

-- 3. Columna para filtro de nombre en Odoo (nombre de vehículo o job_title)
-- (ya existe job_title — la reutilizamos como filtro de nombre genérico)

-- 4. Insertar configuraciones para tractos y carretas
INSERT INTO automatizacion_config (tipo, job_title, alertas, activo)
VALUES
  ('tractos',  'Camión',                  '{"_global":[{"dias":7,"activo":true},{"dias":30,"activo":true},{"dias":90,"activo":true}]}', true),
  ('carretas', 'Semirremolque Plataforma', '{"_global":[{"dias":7,"activo":true},{"dias":30,"activo":true},{"dias":90,"activo":true}]}', true)
ON CONFLICT (tipo) DO UPDATE SET job_title = EXCLUDED.job_title;
