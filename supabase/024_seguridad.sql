-- =====================================================================
-- 024: seguridad de las subidas y de verificar_alumno
-- 1. Tabla subidas_firmadas: cuenta cuántas URLs de subida pidió cada alumno.
-- 2. permiso_subida(): decide si un DNI puede subir un archivo. La llama
--    SOLO el servidor (la ruta /api/subir), con la clave service_role.
-- 3. verificar_alumno: devuelve la inicial del nombre, no el nombre entero.
--
-- IMPORTANTE: este archivo NO cierra todavía las subidas de anon. Eso lo
-- hace 025, que se corre DESPUÉS de publicar la página nueva. Si se
-- cerraran antes, la página vieja no podría subir archivos y nadie
-- podría reservar.
-- Se puede volver a correr sin problema (if not exists / or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla subidas_firmadas.
-- ---------------------------------------------------------------------
-- Cada fila es una URL de subida entregada a un alumno.
-- references alumnos(id): solo acepta ids de alumnos que existan.
-- on delete cascade: si se borrara el alumno, se borran sus filas acá.
create table if not exists subidas_firmadas (
  id bigint generated always as identity primary key,
  alumno_id uuid not null references alumnos(id) on delete cascade,
  creado_en timestamptz not null default now()
);

-- Índice: la consulta que más se hace es "URLs de este alumno en los
-- últimos 30 minutos". Con el índice la base no recorre toda la tabla.
create index if not exists subidas_firmadas_alumno_creado_en_idx
  on subidas_firmadas (alumno_id, creado_en);

-- Cerrada: RLS activado y SIN políticas, así nadie la lee ni la escribe
-- desde el navegador. Solo la toca permiso_subida (security definer).
alter table subidas_firmadas enable row level security;
revoke all on subidas_firmadas from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. permiso_subida(): ¿este DNI puede recibir una URL de subida?
-- ---------------------------------------------------------------------
-- p_ip: la IP real del alumno. Viene como parámetro porque acá NO sirve
-- ip_cliente() (015): esa función lee los encabezados del pedido, y como
-- quien llama es el servidor, vería la IP de Netlify. Todos los alumnos
-- compartirían el mismo límite de intentos.
--
-- returns text: devuelve una palabra que la ruta traduce a un mensaje:
--   'ok'                  puede subir (y ya quedó contada la URL)
--   'demasiados_intentos' esta IP probó 3 DNIs inexistentes en 15 minutos
--   'dni_no_registrado'   el DNI no existe (queda anotado el intento)
--   'bloqueado'           el alumno está bloqueado
--   'tiene_pendiente'     ya tiene una reserva pendiente_pago
--   'limite_subidas'      ya pidió 6 URLs en los últimos 30 minutos
--
-- Por qué devuelve una palabra y no usa raise exception: un raise deshace
-- todo lo que hizo la función, también el insert del intento fallido, y
-- el intento no quedaría anotado (es lo mismo que explica 015).
--
-- security definer: corre con los permisos del dueño, así puede usar las
-- tablas cerradas. set search_path = public: fija dónde busca las tablas,
-- para que nadie la engañe con otra tabla del mismo nombre.
create or replace function permiso_subida(p_dni text, p_ip text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- nullif(a, ''): da NULL si a está vacío. coalesce(x, 'sin-ip'): usa
  -- 'sin-ip' si x es NULL (pasa al probar en la computadora, sin Netlify).
  v_ip text := coalesce(nullif(trim(p_ip), ''), 'sin-ip');
  v_alumno record;
begin
  -- a) Límite por IP: los mismos 3 intentos en 15 minutos de 023.
  -- Primero esto: si ya se pasó, ni siquiera buscamos el DNI.
  if (
    select count(*) from intentos_dni
    where ip = v_ip and creado_en > now() - interval '15 minutes'
  ) >= 3 then
    return 'demasiados_intentos';
  end if;

  -- b) El alumno.
  -- FOR UPDATE: bloquea la fila del alumno hasta que termine la función.
  -- Si un script pide 20 URLs a la vez con el mismo DNI, los pedidos
  -- esperan en fila y cada uno ve lo que contó el anterior. Sin esto,
  -- todos contarían 0 al mismo tiempo y pasarían el límite de 6.
  select id, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni)
  for update;

  -- FOUND: variable automática; es false si el SELECT no encontró filas.
  if not found then
    -- No usamos anotar_intento_fallido() porque esa guarda ip_cliente().
    insert into intentos_dni (ip) values (v_ip);
    delete from intentos_dni where creado_en < now() - interval '1 day';
    return 'dni_no_registrado';
  end if;

  if v_alumno.bloqueado then
    return 'bloqueado';
  end if;

  -- exists (...): true si la consulta de adentro encuentra alguna fila.
  if exists (
    select 1 from reservas
    where alumno_id = v_alumno.id and estado = 'pendiente_pago'
  ) then
    return 'tiene_pendiente';
  end if;

  -- c) Máximo 6 URLs por alumno en 30 minutos.
  if (
    select count(*) from subidas_firmadas
    where alumno_id = v_alumno.id and creado_en > now() - interval '30 minutes'
  ) >= 6 then
    return 'limite_subidas';
  end if;

  -- Pasó todo: contamos esta URL y borramos las filas de hace más de un
  -- día, así la tabla nunca crece mucho.
  insert into subidas_firmadas (alumno_id) values (v_alumno.id);
  delete from subidas_firmadas where creado_en < now() - interval '1 day';

  return 'ok';
end;
$$;

-- REVOKE EXECUTE: saca el permiso de ejecutar la función.
-- public es "todos los roles". Supabase además les da execute a anon y
-- authenticated por su cuenta, por eso se los sacamos uno por uno.
-- GRANT EXECUTE ... TO service_role: solo el servidor la puede llamar.
revoke execute on function permiso_subida(text, text) from public, anon, authenticated;
grant execute on function permiso_subida(text, text) to service_role;

-- ---------------------------------------------------------------------
-- 3. verificar_alumno: solo la inicial del nombre.
-- ---------------------------------------------------------------------
-- Antes devolvía el nombre completo: con un DNI conocido se podía saber
-- cómo se llama un alumno, y muchos son menores.
-- Los parámetros y el tipo de resultado no cambian, así que alcanza con
-- CREATE OR REPLACE.
create or replace function verificar_alumno(p_dni text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno record;
begin
  -- El límite de intentos sigue igual que en 015 y 023.
  if dni_bloqueado_por_intentos() then
    raise exception 'Hubo demasiados intentos con DNIs que no están registrados. Esperá 15 minutos y probá de nuevo.';
  end if;

  select id, nombre, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni);

  if not found then
    -- Sin raise, para que el intento quede anotado (ver 015).
    perform anotar_intento_fallido();
    return null;
  end if;

  return json_build_object(
    -- left(texto, 1): el primer carácter. upper: lo pasa a mayúscula.
    -- ||: une textos. Con "juan" queda "J.".
    'inicial', upper(left(trim(v_alumno.nombre), 1)) || '.',
    'habilitado', not v_alumno.bloqueado,
    'tiene_pendiente', exists (
      select 1 from reservas
      where alumno_id = v_alumno.id and estado = 'pendiente_pago'
    )
  );
end;
$$;

revoke execute on function verificar_alumno(text) from public;
grant execute on function verificar_alumno(text) to anon, authenticated;
