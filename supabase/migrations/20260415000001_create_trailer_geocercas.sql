-- Tabla para geocercas múltiples por servicio de trailer
-- Reemplaza los campos únicos navitel_zone_id / navitel_zone_name en servicios_trailers
-- permitiendo asignar N geocercas de entrada o salida y registrar la hora exacta de arribo.

CREATE TABLE IF NOT EXISTS trailer_geocercas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id  UUID        NOT NULL REFERENCES servicios_trailers(id) ON DELETE CASCADE,
  orden        INTEGER     NOT NULL DEFAULT 1,
  zone_id      INTEGER     NOT NULL,
  zone_name    TEXT        NOT NULL,
  event_type   TEXT        NOT NULL DEFAULT 'zone_in'
                           CHECK (event_type IN ('zone_in', 'zone_out')),
  arrived_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trailer_geocercas_servicio
  ON trailer_geocercas(servicio_id);

COMMENT ON TABLE  trailer_geocercas                IS 'Geocercas de llegada/salida asignadas a cada servicio de trailer';
COMMENT ON COLUMN trailer_geocercas.event_type     IS 'zone_in = entrada al área, zone_out = salida del área';
COMMENT ON COLUMN trailer_geocercas.arrived_at     IS 'Hora exacta detectada por Navitel GPS cuando el tracker llegó/salió';
COMMENT ON COLUMN trailer_geocercas.orden          IS 'Orden de visualización de la geocerca dentro del servicio';
