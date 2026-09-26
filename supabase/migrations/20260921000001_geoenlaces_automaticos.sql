-- ============================================================================
-- GEOENLACES AUTOMÁTICOS POR SERVICIO
-- Registra qué servicio (tarea principal o subtarea de Odoo) ya tiene un
-- geoenlace de Navitel creado automáticamente, para no duplicarlo en cada
-- corrida del cron y para saber cuál cerrar cuando el conductor termine.
-- Solo lo escribe el endpoint de automatización (service role) — los
-- usuarios normales solo pueden leerlo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geoenlaces_automaticos (
  servicio_id  INTEGER PRIMARY KEY,           -- id de la tarea en Odoo (project.task)
  servicio_nombre TEXT,
  geolink_id   INTEGER NOT NULL,              -- id del geoenlace en Navitel (para poder borrarlo)
  geolink_hash TEXT NOT NULL,
  placa        TEXT,
  creado_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_at   TIMESTAMPTZ                    -- NULL = todavía activo
);

CREATE INDEX IF NOT EXISTS geoenlaces_automaticos_activos_idx
  ON public.geoenlaces_automaticos (servicio_id) WHERE cerrado_at IS NULL;

ALTER TABLE public.geoenlaces_automaticos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geoenlaces_automaticos_select_authenticated"
  ON public.geoenlaces_automaticos FOR SELECT
  TO authenticated
  USING (true);

-- Sin policies de INSERT/UPDATE/DELETE para el cliente: solo el endpoint de
-- automatización (con la service_role key) puede escribir esta tabla.

COMMENT ON TABLE public.geoenlaces_automaticos IS
  'Geoenlaces de Navitel creados automáticamente por servicio (1h antes de iniciar, cerrados cuando el conductor termina). Ver app/api/automatizacion/geoenlaces-auto.';
