-- =============================================================
-- Automatización de alertas de vencimientos — PayBox Eemerson SAC
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- Tabla de configuración por tipo (trailers / conductores)
CREATE TABLE IF NOT EXISTS automatizacion_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT        NOT NULL UNIQUE CHECK (tipo IN ('trailers', 'conductores')),
  job_title   TEXT        NOT NULL,
  alertas     JSONB       NOT NULL DEFAULT '[
    {"dias": 30,  "activo": true, "nombre": "1 mes"},
    {"dias": 90,  "activo": true, "nombre": "3 meses"}
  ]',
  activo      BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de log de alertas enviadas (evita duplicados por mismo ciclo)
CREATE TABLE IF NOT EXISTS automatizacion_alertas_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_odoo_id    INTEGER     NOT NULL,
  empleado_nombre     TEXT,
  campo               TEXT        NOT NULL,
  dias_anticipacion   INTEGER     NOT NULL,
  fecha_vencimiento   DATE        NOT NULL,
  enviado_a           TEXT        NOT NULL,
  enviado_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único: no re-enviar la misma alerta para la misma fecha de vencimiento
CREATE UNIQUE INDEX IF NOT EXISTS automatizacion_alertas_log_unique
  ON automatizacion_alertas_log (empleado_odoo_id, campo, dias_anticipacion, fecha_vencimiento);

-- Datos iniciales
INSERT INTO automatizacion_config (tipo, job_title, alertas)
VALUES
  ('trailers',    'Conductor', '[{"dias":30,"activo":true,"nombre":"1 mes"},{"dias":90,"activo":true,"nombre":"3 meses"}]'),
  ('conductores', 'Conductor', '[{"dias":30,"activo":true,"nombre":"1 mes"},{"dias":90,"activo":true,"nombre":"3 meses"}]')
ON CONFLICT (tipo) DO NOTHING;
