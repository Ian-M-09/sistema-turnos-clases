-- =====================================================================
-- A6, paso 4: borrar los datos de prueba (correr el archivo entero).
-- Correrlo recién después de revisar con a6_3_revisar.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Borrar los datos de prueba.
-- ---------------------------------------------------------------------
-- El orden importa por las claves foráneas: primero las reservas (sus
-- filas de reserva_horarios se borran solas por el on delete cascade),
-- después los horarios y al final los alumnos.
-- like '990000__': "_" significa "cualquier carácter", así que agarra
-- de 99000001 a 99000009 y nada más.
delete from reservas
where alumno_id in (select id from alumnos where dni like '990000__');

delete from disponibilidad
where (fecha in ('2028-03-15', '2028-03-16') and hora in ('10:00', '12:00', '14:00', '15:00', '16:00', '16:30', '18:00', '20:00'))
   or hora = '05:13';

delete from alumnos where dni like '990000__';

-- ---------------------------------------------------------------------
-- 2. Los comprobantes de prueba (PNG de 1 píxel, 68 bytes cada uno).
-- ---------------------------------------------------------------------
-- No se borran con SQL (ver E4 del plan: siempre con la API de Storage).
-- Esta consulta solo los lista; borralos desde Storage → comprobantes
-- en el panel de Supabase, o dejalos para la limpieza de huérfanos (E4).
select name, created_at
from storage.objects
where bucket_id = 'comprobantes'
  and (metadata->>'size')::int < 100
order by created_at desc;
