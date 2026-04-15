-- Agrega campos de rastreo GPS Navitel a servicios_trailers
-- Permite asignar un rastreador, generar geoenlaces y detectar llegada a geocercas

ALTER TABLE servicios_trailers
  ADD COLUMN IF NOT EXISTS navitel_tracker_id    INTEGER,
  ADD COLUMN IF NOT EXISTS navitel_tracker_label TEXT,
  ADD COLUMN IF NOT EXISTS geolink_url           TEXT,
  ADD COLUMN IF NOT EXISTS geolink_hash          TEXT,
  ADD COLUMN IF NOT EXISTS geolink_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS navitel_zone_id       INTEGER,
  ADD COLUMN IF NOT EXISTS navitel_zone_name     TEXT;

COMMENT ON COLUMN servicios_trailers.navitel_tracker_id    IS 'ID del rastreador Navitel asignado al servicio';
COMMENT ON COLUMN servicios_trailers.navitel_tracker_label IS 'Nombre/placa del rastreador en Navitel';
COMMENT ON COLUMN servicios_trailers.geolink_url           IS 'URL del geoenlace de seguimiento (válido 6h)';
COMMENT ON COLUMN servicios_trailers.geolink_hash          IS 'Hash del geoenlace para identificación';
COMMENT ON COLUMN servicios_trailers.geolink_expires_at    IS 'Fecha y hora de expiración del geoenlace';
COMMENT ON COLUMN servicios_trailers.navitel_zone_id       IS 'ID de la geocerca de llegada asignada en Navitel';
COMMENT ON COLUMN servicios_trailers.navitel_zone_name     IS 'Nombre de la geocerca de llegada';
