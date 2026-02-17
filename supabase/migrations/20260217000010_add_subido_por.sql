-- Agregar columna para el nombre del usuario que creó el registro
-- Esto evita tener que usar Edge Functions o joins complejos

ALTER TABLE public.registros 
ADD COLUMN IF NOT EXISTS subido_por TEXT;

COMMENT ON COLUMN public.registros.subido_por IS 
'Nombre completo del usuario que creó el registro';

-- Actualizar registros existentes con valor por defecto
UPDATE public.registros 
SET subido_por = 'Usuario desconocido'
WHERE subido_por IS NULL;
