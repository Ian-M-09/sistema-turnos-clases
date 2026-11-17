-- =====================================================================
-- 021: limpieza de mitad de mes (paso E4)
-- Decidido (17/11): de las reservas cuya clase fue hace más de 30 días se
-- borran los archivos (comprobante y apuntes) y el chat de Gemini. La
-- fila de la reserva queda como historial (fecha, materia, monto, estado).
-- También se borran los archivos "huérfanos": los que no están en
-- ninguna reserva (por ejemplo, un alumno los subió y no terminó).
--
-- Quién borra: la ruta del servidor /api/limpieza, con la clave
-- service_role (la única que puede tocar archivos de los dos profesores).
-- Los archivos se borran con la API de Storage desde esa ruta, NUNCA con
-- DELETE sobre storage.objects (dejaría los archivos de verdad en el disco).
-- Estas funciones solo hacen la LISTA de qué borrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Marca de "ya limpiada".
-- ---------------------------------------------------------------------
-- comprobante_url y apuntes se quedan con los nombres (comprobante_url
-- no puede ser null, y además así nadie puede reusar ese nombre). Esta
-- columna dice que esos archivos ya no existen.
alter table reservas
  add column if not exists archivos_borrados_en timestamptz;

-- ---------------------------------------------------------------------
-- 2. Qué reservas se limpian.
-- ---------------------------------------------------------------------
-- RETURNS TABLE (...): la función devuelve filas, como una consulta.
-- LEFT JOIN: como JOIN, pero si la reserva no tiene horarios (un horario
-- que se dio de baja después de rechazarla, ver 011) igual aparece, con
-- los datos del horario en null.
-- GROUP BY r.id: junta todas las filas de una misma reserva (una por
-- horario) en una sola. HAVING: como WHERE, pero para los grupos.
-- La fecha que se mira: la de la clase (max(d.fecha)) o, si no tiene
-- horarios, la de creación.
create or replace function reservas_para_limpiar()
returns table (reserva_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from reservas r
  left join reserva_horarios rh on rh.reserva_id = r.id
  left join disponibilidad d on d.id = rh.disponibilidad_id
  where r.archivos_borrados_en is null
    -- Las pendientes nunca (igual vencen a los 30 minutos).
    and r.estado <> 'pendiente_pago'
    -- Una vencida que todavía no se devolvió se guarda hasta devolverla.
    and not (r.vencida and r.devuelto_en is null)
  group by r.id
  having coalesce(max(d.fecha), max(r.creado_en)::date)
    < (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30;
    -- max(r.creado_en): dentro de un grupo hay que usar una función de
    -- grupo (max) aunque todas las filas tengan el mismo valor.
$$;

-- ---------------------------------------------------------------------
-- 3. Qué archivos se borran.
-- ---------------------------------------------------------------------
-- Devuelve cada archivo con su bucket, su nombre, su tamaño en bytes y
-- la reserva a la que pertenece (null si es huérfano).
-- storage.objects: la tabla donde Supabase anota los archivos subidos.
-- metadata->>'size': el tamaño, que Supabase guarda adentro del jsonb.
-- (->> saca un valor de un jsonb como texto; ::bigint lo pasa a número.)
-- UNION ALL: junta los resultados de dos consultas, una abajo de la otra.
create or replace function archivos_para_limpiar()
returns table (bucket text, nombre text, bytes bigint, reserva_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  -- a) Los archivos de las reservas viejas.
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0), r.id
  from storage.objects o
  join reservas r
    on (o.bucket_id = 'comprobantes' and o.name = r.comprobante_url)
    or (o.bucket_id = 'apuntes' and o.name = any(r.apuntes))
  where r.id in (select reserva_id from reservas_para_limpiar())

  union all

  -- b) Los huérfanos: no están en ninguna reserva. Solo los de más de 1
  -- día, para no borrar el archivo de un alumno que lo acaba de subir y
  -- todavía está terminando de reservar.
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0), null::uuid
  from storage.objects o
  where o.bucket_id in ('comprobantes', 'apuntes')
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from reservas r
      where (o.bucket_id = 'comprobantes' and r.comprobante_url = o.name)
         or (o.bucket_id = 'apuntes' and o.name = any(r.apuntes))
    );
$$;

-- Solo las usa la ruta del servidor con la clave service_role. Nadie
-- desde la página (ni siquiera los profesores con su sesión).
revoke execute on function reservas_para_limpiar() from public, anon, authenticated;
revoke execute on function archivos_para_limpiar() from public, anon, authenticated;
grant execute on function reservas_para_limpiar() to service_role;
grant execute on function archivos_para_limpiar() to service_role;
