-- ============================================================================
-- ASISTENCIA DE OFICINA (sticker NFC + selfie)
--
-- El personal de oficina marca 4 veces al día (entrada, salida a almuerzo,
-- regreso de almuerzo, salida) acercando el celular a un sticker NFC
-- (NTAG213/215/216) pegado en la oficina. El sticker abre
--   https://paybox.eemersonsac.com/oficina/marcar?m=<UID>x<CONTADOR>
-- donde UID (14 hex) y CONTADOR (6 hex) los agrega el propio chip ("UID
-- mirror" + "counter mirror"); el contador sube solo con cada toque.
--
-- Seguridad en 3 capas:
--   1. Link de un solo uso: cada (sticker, contador) se puede usar una vez.
--      Reabrir el link del historial o pasárselo a un compañero se rechaza.
--   2. Detección de trampa: si alguien escribe a mano un contador que el
--      sticker todavía no generó, tarde o temprano un toque real choca con
--      él (o llega un contador menor que uno ya usado) y la marca tramposa
--      queda como sospechosa para RRHH.
--   3. Selfie obligatoria en cada marca (bucket privado, solo RRHH la ve).
--
-- Todas las marcas del trabajador pasan por la API (/api/oficina/*) con el
-- cliente admin; la hora es siempre la del servidor (now()). RRHH puede
-- corregir/agregar marcas a mano desde el panel (quedan con manual = true).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Parámetros generales (una sola fila)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_config (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  meta_semanal_horas NUMERIC(5,2) NOT NULL DEFAULT 48,
  tolerancia_min     INTEGER NOT NULL DEFAULT 10,
  almuerzo_min       INTEGER NOT NULL DEFAULT 45,
  almuerzo_max       INTEGER NOT NULL DEFAULT 75,
  hora_limite        TEXT NOT NULL DEFAULT '22:00',
  selfie_obligatoria BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.oficina_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.oficina_config IS
  'Parámetros de asistencia de oficina: meta de horas semanales (sin almuerzo), tolerancia de tardanza, almuerzo mínimo/máximo, hora límite (después = horario nocturno) y si la selfie es obligatoria al marcar (RRHH la puede apagar).';

-- ----------------------------------------------------------------------------
-- 2. Trabajadores que marcan en oficina, con su horario de referencia
--    horario: { "1": {"entrada":"09:00","salida":"19:00"}, ..., "6": null, "7": null }
--    (1 = lunes ... 7 = domingo; null = no trabaja ese día)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_trabajadores (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre             TEXT NOT NULL,
  activo             BOOLEAN NOT NULL DEFAULT true,
  horario            JSONB NOT NULL DEFAULT '{
    "1": {"entrada": "09:00", "salida": "19:00"},
    "2": {"entrada": "09:00", "salida": "19:00"},
    "3": {"entrada": "09:00", "salida": "19:00"},
    "4": {"entrada": "09:00", "salida": "19:00"},
    "5": {"entrada": "09:00", "salida": "19:00"},
    "6": null,
    "7": null
  }'::jsonb,
  meta_semanal_horas NUMERIC(5,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.oficina_trabajadores.meta_semanal_horas IS
  'Meta de horas semanales propia del trabajador. NULL = usa la meta general de oficina_config.';

-- ----------------------------------------------------------------------------
-- 3. Stickers NFC registrados
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_stickers (
  uid          TEXT PRIMARY KEY CHECK (uid ~ '^[0-9A-F]{14}$'),
  nombre       TEXT NOT NULL DEFAULT 'Oficina',
  activo       BOOLEAN NOT NULL DEFAULT true,
  max_contador INTEGER NOT NULL DEFAULT -1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.oficina_stickers.max_contador IS
  'Mayor contador de toque aceptado hasta ahora (-1 = sin toques).';

-- ----------------------------------------------------------------------------
-- 4. Marcas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_marcas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre          TEXT,
  fecha           DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida')),
  marcado_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sticker_uid     TEXT,
  contador        INTEGER,
  selfie_path     TEXT,
  manual          BOOLEAN NOT NULL DEFAULT false,
  sospechosa      BOOLEAN NOT NULL DEFAULT false,
  motivo_sospecha TEXT,
  editado_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fecha, tipo)
);

CREATE INDEX IF NOT EXISTS idx_oficina_marcas_fecha ON public.oficina_marcas (fecha);

-- ----------------------------------------------------------------------------
-- 5. Tickets: cada toque aceptado del sticker. Se "reclama" al abrir el link
--    y se consume al confirmar la marca con la selfie.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_uid TEXT NOT NULL REFERENCES public.oficina_stickers(uid) ON DELETE CASCADE,
  contador    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  usado_at    TIMESTAMPTZ,
  marca_id    UUID REFERENCES public.oficina_marcas(id) ON DELETE SET NULL,
  UNIQUE (sticker_uid, contador)
);

-- ----------------------------------------------------------------------------
-- 6. Intentos rechazados (link reusado, link de otro, contador inválido...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oficina_intentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      TEXT,
  sticker_uid TEXT,
  contador    INTEGER,
  motivo      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oficina_intentos_created ON public.oficina_intentos (created_at DESC);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.oficina_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_stickers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_marcas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_intentos     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oficina_config_select" ON public.oficina_config FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "oficina_config_update_rrhh" ON public.oficina_config FOR UPDATE
  USING (public.can_manage_vacaciones('can_edit')) WITH CHECK (public.can_manage_vacaciones('can_edit'));

CREATE POLICY "oficina_trabajadores_select" ON public.oficina_trabajadores FOR SELECT
  USING (user_id = auth.uid() OR public.can_manage_vacaciones());
CREATE POLICY "oficina_trabajadores_insert_rrhh" ON public.oficina_trabajadores FOR INSERT
  WITH CHECK (public.can_manage_vacaciones('can_edit'));
CREATE POLICY "oficina_trabajadores_update_rrhh" ON public.oficina_trabajadores FOR UPDATE
  USING (public.can_manage_vacaciones('can_edit')) WITH CHECK (public.can_manage_vacaciones('can_edit'));
CREATE POLICY "oficina_trabajadores_delete_rrhh" ON public.oficina_trabajadores FOR DELETE
  USING (public.can_manage_vacaciones('can_delete'));

CREATE POLICY "oficina_stickers_select_rrhh" ON public.oficina_stickers FOR SELECT
  USING (public.can_manage_vacaciones());
CREATE POLICY "oficina_stickers_update_rrhh" ON public.oficina_stickers FOR UPDATE
  USING (public.can_manage_vacaciones('can_edit')) WITH CHECK (public.can_manage_vacaciones('can_edit'));
CREATE POLICY "oficina_stickers_delete_rrhh" ON public.oficina_stickers FOR DELETE
  USING (public.can_manage_vacaciones('can_delete'));

CREATE POLICY "oficina_marcas_select" ON public.oficina_marcas FOR SELECT
  USING (user_id = auth.uid() OR public.can_manage_vacaciones());
CREATE POLICY "oficina_marcas_insert_rrhh" ON public.oficina_marcas FOR INSERT
  WITH CHECK (public.can_manage_vacaciones('can_edit') AND manual);
CREATE POLICY "oficina_marcas_update_rrhh" ON public.oficina_marcas FOR UPDATE
  USING (public.can_manage_vacaciones('can_edit')) WITH CHECK (public.can_manage_vacaciones('can_edit'));
CREATE POLICY "oficina_marcas_delete_rrhh" ON public.oficina_marcas FOR DELETE
  USING (public.can_manage_vacaciones('can_delete'));

-- Tickets: solo los toca la API (cliente admin). Sin policies = nadie más.

CREATE POLICY "oficina_intentos_select_rrhh" ON public.oficina_intentos FOR SELECT
  USING (public.can_manage_vacaciones());

-- ----------------------------------------------------------------------------
-- Selfies: bucket privado. Sube la API (admin); RRHH las ve con URL firmada.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('asistencia-oficina', 'asistencia-oficina', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "asistencia_oficina_select_rrhh" ON storage.objects;
CREATE POLICY "asistencia_oficina_select_rrhh" ON storage.objects FOR SELECT
  USING (bucket_id = 'asistencia-oficina' AND public.can_manage_vacaciones());

-- ----------------------------------------------------------------------------
-- Reclamo atómico de un toque del sticker. Lo llama la API con el cliente
-- admin (p_user ya validado por la sesión). Bloquea la fila del sticker para
-- que dos toques simultáneos no se pisen.
-- Devuelve: { ok: true, ticket_id } o { ok: false, codigo, mensaje }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oficina_reclamar_toque(p_user UUID, p_uid TEXT, p_contador INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sticker     public.oficina_stickers%ROWTYPE;
  v_trabajador  public.oficina_trabajadores%ROWTYPE;
  v_ticket      public.oficina_tickets%ROWTYPE;
  v_ticket_id   UUID;
BEGIN
  SELECT * INTO v_sticker FROM public.oficina_stickers WHERE uid = p_uid FOR UPDATE;
  IF NOT FOUND OR NOT v_sticker.activo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'sticker_desconocido',
      'mensaje', 'Este sticker no está registrado en PayBox.');
  END IF;

  SELECT * INTO v_trabajador FROM public.oficina_trabajadores WHERE user_id = p_user AND activo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_habilitado',
      'mensaje', 'Tu usuario no está habilitado para marcar asistencia en oficina. Pídeselo a Recursos Humanos.');
  END IF;

  -- ¿Ese número de toque ya se usó?
  SELECT * INTO v_ticket FROM public.oficina_tickets WHERE sticker_uid = p_uid AND contador = p_contador;
  IF FOUND THEN
    -- Recargar la página recién abierta (mismo usuario, ticket vigente y sin usar): se devuelve el mismo.
    IF v_ticket.user_id = p_user AND v_ticket.usado_at IS NULL AND v_ticket.expira_at > now() THEN
      RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket.id);
    END IF;

    IF v_ticket.user_id = p_user THEN
      INSERT INTO public.oficina_intentos (user_id, nombre, sticker_uid, contador, motivo)
      VALUES (p_user, v_trabajador.nombre, p_uid, p_contador, 'Abrió un link que ya había usado');
    ELSE
      INSERT INTO public.oficina_intentos (user_id, nombre, sticker_uid, contador, motivo)
      VALUES (p_user, v_trabajador.nombre, p_uid, p_contador,
        'Abrió un link que ya había usado ' || COALESCE((SELECT nombre FROM public.oficina_trabajadores WHERE user_id = v_ticket.user_id), 'otra persona'));
      -- Link compartido, o un número escrito a mano que chocó con un toque real: la marca original queda sospechosa.
      UPDATE public.oficina_marcas
      SET sospechosa = true,
          motivo_sospecha = 'El mismo link lo abrió también ' || v_trabajador.nombre || ' (' || to_char(now() AT TIME ZONE 'America/Lima', 'DD/MM HH24:MI') || ')'
      WHERE id = v_ticket.marca_id;
    END IF;

    RETURN jsonb_build_object('ok', false, 'codigo', 'link_usado',
      'mensaje', 'Este link ya se usó. Vuelve a acercar tu celular al sticker para marcar.');
  END IF;

  -- Un número muy por delante del último toque real no puede venir del sticker.
  IF v_sticker.max_contador >= 0 AND p_contador > v_sticker.max_contador + 50 THEN
    INSERT INTO public.oficina_intentos (user_id, nombre, sticker_uid, contador, motivo)
    VALUES (p_user, v_trabajador.nombre, p_uid, p_contador, 'Link con un número de toque que el sticker no generó');
    RETURN jsonb_build_object('ok', false, 'codigo', 'contador_invalido',
      'mensaje', 'Este link no es válido. Vuelve a acercar tu celular al sticker para marcar.');
  END IF;

  -- Llega un número menor que otros ya usados: esos mayores se usaron antes
  -- de que el sticker los generara, o sea, se escribieron a mano. Se deja un
  -- margen de 2 minutos por dos toques casi simultáneos que llegan desordenados.
  IF p_contador < v_sticker.max_contador THEN
    UPDATE public.oficina_marcas m
    SET sospechosa = true,
        motivo_sospecha = 'Usó un número de toque que el sticker todavía no había generado'
    FROM public.oficina_tickets t
    WHERE t.marca_id = m.id
      AND t.sticker_uid = p_uid
      AND t.contador > p_contador
      AND t.created_at < now() - interval '2 minutes'
      AND NOT m.sospechosa;
  END IF;

  INSERT INTO public.oficina_tickets (user_id, sticker_uid, contador)
  VALUES (p_user, p_uid, p_contador)
  RETURNING id INTO v_ticket_id;

  UPDATE public.oficina_stickers SET max_contador = GREATEST(max_contador, p_contador) WHERE uid = p_uid;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id);
END;
$$;

REVOKE ALL ON FUNCTION public.oficina_reclamar_toque(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Personal de oficina inicial (horario de referencia L-V 09:00-19:00)
-- ----------------------------------------------------------------------------
INSERT INTO public.oficina_trabajadores (user_id, nombre)
SELECT id, full_name FROM public.user_profiles
WHERE email IN (
  'coordinador2@eemersonsac.com',   -- Jaren Arias
  'contabilidad@eemersonsac.com',   -- Guiuliana Cosme
  'facturacion@eemersonsac.com',    -- Margiory Cosme
  'documentacion@eemersonsac.com',  -- Sandra García
  'coordinador@eemersonsac.com',    -- Luis Chancas
  'rcosme@eemersonsac.com'          -- Rosario Cosme
)
ON CONFLICT (user_id) DO NOTHING;
