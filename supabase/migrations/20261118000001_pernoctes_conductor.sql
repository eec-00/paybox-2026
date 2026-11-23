-- ============================================================================
-- Pernocte (08 · S/40): el conductor lo solicita desde la app («Voy a
-- pernoctar») y Operaciones lo aprueba o rechaza en Paybox (Pruebas >
-- Pernoctes). Una solicitud = una noche. Ver lib/pernoctes/reglas.ts.
--
-- Escrituras: solo por las rutas /api/conductor/pernoctes y
-- /api/pruebas/pernoctes con el cliente admin (validan permiso y servicio de
-- Odoo). RLS: el conductor puede leer las suyas; nadie escribe directo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pernoctes_conductor (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id         UUID    NOT NULL REFERENCES auth.users(id),
  conductor_nombre     TEXT    NOT NULL,
  odoo_employee_id     INTEGER,
  servicio_id          INTEGER NOT NULL,
  servicio_nombre      TEXT    NOT NULL,
  -- Día en que empieza la noche (hora de Lima; antes de las 06:00 = día anterior)
  noche                DATE    NOT NULL,
  motivo               TEXT    NOT NULL CHECK (motivo IN ('cita_dia_siguiente', 'espera_cliente', 'cola_puerto', 'exportacion', 'otro')),
  motivo_detalle       TEXT,
  duerme_en_unidad     BOOLEAN NOT NULL DEFAULT TRUE CHECK (duerme_en_unidad),
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  precision_m          DOUBLE PRECISION,
  evidencias           TEXT[]  NOT NULL DEFAULT '{}',
  estado               TEXT    NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente', 'escalado', 'aprobado', 'rechazado', 'anulado')),
  -- Checklist de exclusiones (null = sin responder; true = no corresponde)
  volvio_a_casa        BOOLEAN,
  hotel_depositado     BOOLEAN,
  movilidad_depositada BOOLEAN,
  es_provincia         BOOLEAN,
  revisado_por         UUID REFERENCES auth.users(id),
  revisado_por_nombre  TEXT,
  revisado_at          TIMESTAMPTZ,
  observacion          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una noche por conductor (las anuladas no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS pernoctes_conductor_noche_unica
  ON public.pernoctes_conductor (conductor_id, noche)
  WHERE estado <> 'anulado';

CREATE INDEX IF NOT EXISTS pernoctes_conductor_noche_idx ON public.pernoctes_conductor (noche);
CREATE INDEX IF NOT EXISTS pernoctes_conductor_estado_idx ON public.pernoctes_conductor (estado);

CREATE TABLE IF NOT EXISTS public.pernoctes_historial (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pernocte_id      UUID NOT NULL REFERENCES public.pernoctes_conductor(id) ON DELETE CASCADE,
  accion           TEXT NOT NULL CHECK (accion IN ('solicitar', 'aprobar', 'rechazar', 'escalar', 'comentar', 'anular')),
  estado_anterior  TEXT,
  estado_nuevo     TEXT NOT NULL,
  observacion      TEXT,
  usuario_id       UUID REFERENCES auth.users(id),
  usuario_nombre   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pernoctes_historial_pernocte_idx ON public.pernoctes_historial (pernocte_id, created_at);

ALTER TABLE public.pernoctes_conductor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pernoctes_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conductor_select_pernoctes" ON public.pernoctes_conductor;
CREATE POLICY "conductor_select_pernoctes"
  ON public.pernoctes_conductor FOR SELECT
  USING (conductor_id = auth.uid());
