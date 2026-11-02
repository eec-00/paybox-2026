-- ============================================================================
-- Bucket comprobantes privado: fotos y comprobantes solo con sesión iniciada.
-- ============================================================================
-- Ejecutar DESPUÉS de que el código con /api/archivos esté en producción. Si se
-- ejecuta antes, las fotos dejan de verse hasta desplegar.
-- Al ejecutarlo, revisar que subir una foto siga funcionando en la app y en
-- Finanzas: las subidas dependen de las políticas de storage.objects.

UPDATE storage.buckets SET public = false WHERE id = 'comprobantes';

-- ROLLBACK
-- UPDATE storage.buckets SET public = true WHERE id = 'comprobantes';
