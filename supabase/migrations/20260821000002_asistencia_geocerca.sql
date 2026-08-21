-- ============================================================================
-- ASISTENCIA: geocerca obligatoria
-- El admin define una o más "zonas permitidas" (centro lat/lng + radio en
-- metros). Al marcar entrada o salida, un trigger valida en el servidor que
-- la ubicación GPS enviada caiga dentro de al menos una zona activa; si no,
-- rechaza el INSERT/UPDATE con un mensaje claro. La validación es server-side
-- (no solo en el cliente) para que no se pueda "marcar desde casa" enviando
-- coordenadas falsas al cliente.
--
-- Sin zonas activas configuradas, no se restringe nada (mismo comportamiento
-- que hasta ahora) — así el admin puede activar esto cuando quiera sin dejar
-- a los conductores sin poder marcar mientras configura las zonas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.asistencia_ubicaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  radio_metros INTEGER NOT NULL DEFAULT 150 CHECK (radio_metros > 0),
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.asistencia_ubicaciones IS
  'Zonas permitidas (centro + radio en metros) donde un conductor puede marcar asistencia. Sin filas activas, no se restringe nada.';

ALTER TABLE public.asistencia_ubicaciones ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede ver las zonas (el conductor necesita
-- saber dónde debe pararse para marcar).
CREATE POLICY "asistencia_ubicaciones_select_authenticated"
  ON public.asistencia_ubicaciones FOR SELECT
  TO authenticated
  USING (true);

-- Solo admin/developer administra las zonas.
CREATE POLICY "asistencia_ubicaciones_write_admin"
  ON public.asistencia_ubicaciones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'developer'))
  );

-- ----------------------------------------------------------------------------
-- Trigger de validación: corre en el servidor, no se puede saltar desde el
-- cliente. Valida lat/lng en INSERT (marca de entrada) y salida_lat/salida_lng
-- cuando un UPDATE recién fija salida_at (marca de salida). Otros UPDATEs
-- (ej. una corrección de datos hecha por un admin) no se validan.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asistencia_check_geocerca()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chk_lat         DOUBLE PRECISION;
  chk_lng         DOUBLE PRECISION;
  zona            RECORD;
  distancia_m     DOUBLE PRECISION;
  mejor_nombre    TEXT;
  mejor_distancia DOUBLE PRECISION;
  dentro          BOOLEAN := false;
  total_zonas     INTEGER;
  accion_txt      TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    chk_lat := NEW.lat;
    chk_lng := NEW.lng;
    accion_txt := 'entrada';
  ELSIF TG_OP = 'UPDATE' AND OLD.salida_at IS NULL AND NEW.salida_at IS NOT NULL THEN
    chk_lat := NEW.salida_lat;
    chk_lng := NEW.salida_lng;
    accion_txt := 'salida';
  ELSE
    RETURN NEW; -- otros updates (ej. correcciones de admin) no se validan
  END IF;

  SELECT count(*) INTO total_zonas FROM public.asistencia_ubicaciones WHERE activo;
  IF total_zonas = 0 THEN
    RETURN NEW; -- sin zonas configuradas todavía: no se restringe
  END IF;

  FOR zona IN SELECT nombre, lat, lng, radio_metros FROM public.asistencia_ubicaciones WHERE activo LOOP
    -- Haversine (radio de la Tierra ≈ 6,371,000 m)
    distancia_m := 6371000 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(chk_lat)) * cos(radians(zona.lat)) * cos(radians(zona.lng) - radians(chk_lng))
        + sin(radians(chk_lat)) * sin(radians(zona.lat))
      ))
    );
    IF mejor_distancia IS NULL OR distancia_m < mejor_distancia THEN
      mejor_distancia := distancia_m;
      mejor_nombre := zona.nombre;
    END IF;
    IF distancia_m <= zona.radio_metros THEN
      dentro := true;
    END IF;
  END LOOP;

  IF NOT dentro THEN
    RAISE EXCEPTION 'Estás fuera del área permitida para marcar tu %. Estás a %m de "%". Acércate e intenta de nuevo.',
      accion_txt, round(coalesce(mejor_distancia, 0)::numeric)::int, coalesce(mejor_nombre, 'la zona más cercana')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asistencia_check_geocerca ON public.asistencias_conductor;
CREATE TRIGGER trg_asistencia_check_geocerca
  BEFORE INSERT OR UPDATE ON public.asistencias_conductor
  FOR EACH ROW
  EXECUTE FUNCTION public.asistencia_check_geocerca();
