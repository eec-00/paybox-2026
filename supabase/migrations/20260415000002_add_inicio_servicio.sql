-- Campo editable para indicar desde cuándo rastrear llegadas a geocercas.
-- Si es NULL se usa created_at como fallback.

ALTER TABLE servicios_trailers
  ADD COLUMN IF NOT EXISTS inicio_servicio TIMESTAMPTZ;

COMMENT ON COLUMN servicios_trailers.inicio_servicio
  IS 'Hora de inicio real del servicio (hora Lima). Se usa como punto de partida para verificar llegadas GPS. Si es NULL se usa created_at.';
