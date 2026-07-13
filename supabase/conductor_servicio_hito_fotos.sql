-- ============================================================
-- Fotos de hitos operativos por servicio (evidencia fotográfica)
-- Las fotos se suben a Supabase Storage (bucket "comprobantes",
-- prefijo hitos-servicio/) y aquí solo se guarda la URL pública.
-- No se usa Odoo para esto: evita inflar la DB (cupo de 100GB)
-- y mantiene livianas las lecturas de project.task.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conductor_servicio_hito_fotos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id   UUID    NOT NULL,
  servicio_id    INTEGER NOT NULL,
  tipo_servicio  TEXT    NOT NULL,
  hito_key       TEXT    NOT NULL,
  hito_label     TEXT    NOT NULL,
  foto_url       TEXT    NOT NULL,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conductor_servicio_hito_fotos_servicio_idx
  ON public.conductor_servicio_hito_fotos (servicio_id);

ALTER TABLE public.conductor_servicio_hito_fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conductor_insert_hito_fotos" ON public.conductor_servicio_hito_fotos;
CREATE POLICY "conductor_insert_hito_fotos"
  ON public.conductor_servicio_hito_fotos FOR INSERT
  WITH CHECK (conductor_id = auth.uid());

DROP POLICY IF EXISTS "conductor_select_hito_fotos" ON public.conductor_servicio_hito_fotos;
CREATE POLICY "conductor_select_hito_fotos"
  ON public.conductor_servicio_hito_fotos FOR SELECT
  USING (conductor_id = auth.uid());

-- Nombre usado en una corrida anterior de este archivo — se reemplaza por la policy de abajo
DROP POLICY IF EXISTS "admin_select_hito_fotos" ON public.conductor_servicio_hito_fotos;

-- Admins, developers y usuarios con permiso del módulo "servicios" pueden ver todas las fotos
DROP POLICY IF EXISTS "admin_or_servicios_select_hito_fotos" ON public.conductor_servicio_hito_fotos;
CREATE POLICY "admin_or_servicios_select_hito_fotos"
  ON public.conductor_servicio_hito_fotos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'servicios')::jsonb->>'enabled' = 'true'
        )
    )
  );
