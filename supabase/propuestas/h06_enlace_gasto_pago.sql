-- ============================================================================
-- PROPUESTA H06/H07 · NO APLICAR EN PRODUCCIÓN · NO PROBADA CONTRA POSTGRES
-- ============================================================================
-- Enlace estable gastos_conductor.id → registros.id para N gastos / 1 pago,
-- parciales, reintento y reversión. Mismas reglas que lib/gastos/liquidacion.ts.
-- Depende de Rosario/Contabilidad (Q01, Q02): modalidad, parciales, corrección.
-- No rellena historia: los 37 calendarios sin registro_id se concilian con
-- evidencia, nunca por parecido de nombre, fecha o monto.
-- Reversible con el bloque ROLLBACK del final.

-- Evita dos filas de calendario para un mismo gasto (reintentos concurrentes).
-- Antes de crear: revisar duplicados con
--   SELECT gasto_conductor_id, count(*) FROM calendario_pagos
--   WHERE gasto_conductor_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS calendario_pagos_gasto_unico
  ON public.calendario_pagos (gasto_conductor_id)
  WHERE gasto_conductor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gasto_pago_lineas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_conductor_id UUID NOT NULL REFERENCES public.gastos_conductor(id) ON DELETE RESTRICT,
  registro_id        UUID NOT NULL REFERENCES public.registros(id) ON DELETE RESTRICT,
  monto              DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  moneda             TEXT NOT NULL CHECK (moneda IN ('soles', 'dolares')),
  modalidad          TEXT NOT NULL CHECK (modalidad IN ('individual', 'semanal')),
  creado_por         UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revertida_at       TIMESTAMPTZ,
  revertida_por      UUID,
  motivo_reversion   TEXT,
  CHECK ((revertida_at IS NULL) = (motivo_reversion IS NULL))
);

-- Reintento del mismo pago: no se repite la línea
CREATE UNIQUE INDEX IF NOT EXISTS gasto_pago_lineas_unica
  ON public.gasto_pago_lineas (gasto_conductor_id, registro_id)
  WHERE revertida_at IS NULL;

ALTER TABLE public.gasto_pago_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagos_select_lineas" ON public.gasto_pago_lineas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'developer') OR (module_permissions->'pagos'->>'enabled') = 'true')
  )
);
-- Sin políticas de escritura: solo la función de abajo, con permiso propio.

CREATE OR REPLACE FUNCTION public.aplicar_pago_gastos(
  p_registro_id UUID,
  p_modalidad   TEXT,
  p_lineas      JSONB  -- [{"gasto_id": "...", "monto": 10.50}]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_registro public.registros%ROWTYPE;
  v_gasto    public.gastos_conductor%ROWTYPE;
  v_linea    JSONB;
  v_monto    DECIMAL(10,2);
  v_pagado   DECIMAL(10,2);
  v_suma     DECIMAL(10,2) := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'developer') OR (module_permissions->'pagos'->>'enabled') = 'true')
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- Reintento: el pago ya se aplicó
  IF EXISTS (SELECT 1 FROM gasto_pago_lineas WHERE registro_id = p_registro_id AND revertida_at IS NULL) THEN
    RETURN;
  END IF;

  SELECT * INTO v_registro FROM registros WHERE id = p_registro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago inexistente'; END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_monto := (v_linea->>'monto')::DECIMAL(10,2);

    -- Bloquea el gasto: dos pagos simultáneos no pueden pasar el saldo
    SELECT * INTO v_gasto FROM gastos_conductor WHERE id = (v_linea->>'gasto_id')::UUID FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gasto inexistente'; END IF;
    IF v_gasto.moneda <> v_registro.moneda THEN RAISE EXCEPTION 'Moneda distinta'; END IF;

    IF EXISTS (
      SELECT 1 FROM gasto_pago_lineas
      WHERE gasto_conductor_id = v_gasto.id AND revertida_at IS NULL AND modalidad <> p_modalidad
    ) THEN
      RAISE EXCEPTION 'El gasto ya está en otra modalidad de reembolso';
    END IF;

    SELECT COALESCE(SUM(monto), 0) INTO v_pagado
    FROM gasto_pago_lineas WHERE gasto_conductor_id = v_gasto.id AND revertida_at IS NULL;
    IF v_pagado + v_monto > v_gasto.monto THEN RAISE EXCEPTION 'El pago supera el saldo del gasto'; END IF;

    INSERT INTO gasto_pago_lineas (gasto_conductor_id, registro_id, monto, moneda, modalidad, creado_por)
    VALUES (v_gasto.id, p_registro_id, v_monto, v_gasto.moneda, p_modalidad, auth.uid());

    IF v_pagado + v_monto = v_gasto.monto THEN
      UPDATE gastos_conductor SET estado = 'pagado', pagado_at = NOW() WHERE id = v_gasto.id;
      UPDATE calendario_pagos SET estado = 'pagado', registro_id = p_registro_id WHERE gasto_conductor_id = v_gasto.id;
    END IF;

    v_suma := v_suma + v_monto;
  END LOOP;

  IF v_suma <> v_registro.monto THEN RAISE EXCEPTION 'Las líneas no suman el total del pago'; END IF;
END;
$$;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS public.aplicar_pago_gastos(UUID, TEXT, JSONB);
-- DROP TABLE IF EXISTS public.gasto_pago_lineas;
-- DROP INDEX IF EXISTS public.calendario_pagos_gasto_unico;
