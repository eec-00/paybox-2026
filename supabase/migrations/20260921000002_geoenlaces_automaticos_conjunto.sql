-- ============================================================================
-- GEOENLACES AUTOMÁTICOS — soporte para "servicio en conjunto"
--
-- Cuando varios servicios comparten la misma Referencia/Booking (varios
-- camiones para el mismo pedido), además del geoenlace individual de cada
-- uno se crea UN geoenlace más con todas las placas del grupo, para verlas
-- juntas en un solo mapa. Eso significa que un mismo servicio_id puede tener
-- ahora 2 filas (una individual, una "en conjunto" compartida con los demás
-- servicios del mismo booking) — por eso servicio_id deja de ser PK.
--
-- También: el create de Navitel no devuelve un "hash" (solo el id numérico
-- en el campo "value"), así que geolink_hash pasa a ser opcional; el hash/url
-- para mostrar se resuelve después contra /tracker/location/link/list.
-- ============================================================================

ALTER TABLE public.geoenlaces_automaticos DROP CONSTRAINT IF EXISTS geoenlaces_automaticos_pkey;

ALTER TABLE public.geoenlaces_automaticos ADD COLUMN IF NOT EXISTS row_id BIGSERIAL;
ALTER TABLE public.geoenlaces_automaticos ADD CONSTRAINT geoenlaces_automaticos_pkey PRIMARY KEY (row_id);

ALTER TABLE public.geoenlaces_automaticos ALTER COLUMN geolink_hash DROP NOT NULL;
ALTER TABLE public.geoenlaces_automaticos ADD COLUMN IF NOT EXISTS es_conjunto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.geoenlaces_automaticos ADD COLUMN IF NOT EXISTS referencia_booking TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS geoenlaces_automaticos_servicio_tipo_uniq
  ON public.geoenlaces_automaticos (servicio_id, es_conjunto);

CREATE INDEX IF NOT EXISTS geoenlaces_automaticos_servicio_idx
  ON public.geoenlaces_automaticos (servicio_id);

CREATE INDEX IF NOT EXISTS geoenlaces_automaticos_geolink_idx
  ON public.geoenlaces_automaticos (geolink_id);

COMMENT ON COLUMN public.geoenlaces_automaticos.es_conjunto IS
  'true = fila del geoenlace compartido "SERVICIO EN CONJUNTO" (mismo geolink_id para todos los servicios de un mismo Referencia/Booking). false = geoenlace individual de ese servicio.';
