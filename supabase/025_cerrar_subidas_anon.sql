-- =====================================================================
-- 025: cierra las subidas directas a Storage
-- CORRER RECIÉN CUANDO LA PÁGINA NUEVA (con /api/subir) ESTÉ PUBLICADA.
-- Si se corre antes, la página vieja no puede subir archivos y nadie
-- puede reservar.
--
-- Desde ahora la única forma de subir un archivo es con una URL firmada
-- que entrega /api/subir después de validar el DNI (024).
-- No cambian los buckets: siguen sus límites de tamaño y de tipo de
-- archivo (007), que también se aplican a las subidas con URL firmada.
-- =====================================================================

-- DROP POLICY IF EXISTS: borra la política si existe; si ya no está, no
-- da error, así el archivo se puede volver a correr.
-- storage.objects tiene RLS activado: al no quedar ninguna política de
-- INSERT para anon y authenticated, esos roles ya no pueden subir directo.
drop policy if exists "anon sube comprobantes" on storage.objects;
drop policy if exists "anon sube apuntes" on storage.objects;
