-- Eliminar la columna subido_por si existe (ya no es necesaria)
-- El nombre del usuario se obtiene dinámicamente desde user_profiles usando creado_por
ALTER TABLE public.registros DROP COLUMN IF EXISTS subido_por;
