-- Actualizar registros existentes con los nombres desde user_profiles
UPDATE public.registros r
SET subido_por = up.full_name
FROM public.user_profiles up
WHERE r.creado_por = up.id
  AND r.subido_por IS NULL;

-- Si hay registros sin coincidencia en user_profiles, intentar con auth.users
UPDATE public.registros r
SET subido_por = COALESCE(
  (au.raw_user_meta_data->>'full_name')::text,
  au.email
)
FROM auth.users au
WHERE r.creado_por = au.id
  AND r.subido_por IS NULL;
