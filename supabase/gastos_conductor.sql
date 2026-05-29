-- ============================================================
-- Gastos de Conductor
-- ============================================================

-- 1. Create gastos_conductor table
CREATE TABLE IF NOT EXISTS public.gastos_conductor (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id      INTEGER NOT NULL,
  servicio_nombre  TEXT    NOT NULL,
  conductor_id     UUID    NOT NULL,
  conductor_nombre TEXT    NOT NULL,
  descripcion      TEXT    NOT NULL,
  monto            DECIMAL(10,2) NOT NULL,
  moneda           TEXT    NOT NULL DEFAULT 'soles' CHECK (moneda IN ('soles', 'dolares')),
  fotos            TEXT[]  DEFAULT '{}',
  foto_pago        TEXT,
  estado           TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  pagado_at        TIMESTAMPTZ
);

-- 2. Add tipo + gasto_conductor_id to calendario_pagos
ALTER TABLE public.calendario_pagos
  ADD COLUMN IF NOT EXISTS tipo              TEXT DEFAULT 'gasto_fijo',
  ADD COLUMN IF NOT EXISTS gasto_conductor_id UUID REFERENCES public.gastos_conductor(id) ON DELETE SET NULL;

-- 3. Backfill existing rows
UPDATE public.calendario_pagos SET tipo = 'gasto_fijo' WHERE tipo IS NULL;

-- 4. RLS
ALTER TABLE public.gastos_conductor ENABLE ROW LEVEL SECURITY;

-- Conductors: insert own
CREATE POLICY "conductores_insert_gastos"
  ON public.gastos_conductor FOR INSERT
  WITH CHECK (conductor_id = auth.uid());

-- Conductors: view own
CREATE POLICY "conductores_select_gastos"
  ON public.gastos_conductor FOR SELECT
  USING (conductor_id = auth.uid());


-- Admins: view all
CREATE POLICY "admins_select_gastos"
  ON public.gastos_conductor FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );

-- Admins + finanzas: delete
CREATE POLICY "admins_delete_gastos"
  ON public.gastos_conductor FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'pagos')::jsonb->>'enabled' = 'true'
        )
    )
  );

-- Admins + finanzas users: update (mark paid)
CREATE POLICY "admins_update_gastos"
  ON public.gastos_conductor FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'developer')
          OR (module_permissions->>'pagos')::jsonb->>'enabled' = 'true'
        )
    )
  );
