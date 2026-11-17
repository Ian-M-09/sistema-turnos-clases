-- =====================================================================
-- 015: antiabuso (paso A5 del plan)
-- 1. Tabla intentos_dni: anota cada DNI que NO existe, con la IP de
--    quien lo probó.
-- 2. Funciones internas: ip_cliente(), dni_bloqueado_por_intentos() y
--    anotar_intento_fallido().
-- 3. verificar_alumno: si una IP probó más de 10 DNIs que no existen en
--    15 minutos, la frena. Además avisa si el alumno ya tiene una
--    reserva pendiente.
-- 4. crear_reserva: el mismo límite de DNIs (si no, se podría probar
--    DNIs por acá) y como máximo 1 reserva pendiente_pago por alumno.
--    Ahora devuelve NULL cuando el DNI no existe (ver el porqué abajo).
-- El captcha queda para la Fase F (necesita servidor y clave secreta).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla de intentos fallidos.
-- ---------------------------------------------------------------------
-- bigint generated always as identity: un número que la base va
-- sumando sola (1, 2, 3...). Alcanza: no hace falta un uuid.
create table if not exists intentos_dni (
  id bigint generated always as identity primary key,
  ip text not null,
  creado_en timestamptz not null default now()
);

-- Índice: la consulta que más se hace es "intentos de esta IP en los
-- últimos 15 minutos". El índice por (ip, creado_en) hace que la base
-- no tenga que recorrer toda la tabla para contestarla.
create index if not exists intentos_dni_ip_creado_en_idx
  on intentos_dni (ip, creado_en);

-- Cerrada: RLS activado y sin políticas. Solo la tocan las funciones de
-- abajo (que son security definer, o sea, corren como el dueño).
alter table intentos_dni enable row level security;
revoke all on intentos_dni from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Funciones internas.
-- ---------------------------------------------------------------------

-- ip_cliente(): de qué IP viene la llamada.
-- Supabase (por medio de PostgREST) guarda los encabezados HTTP del
-- pedido en la configuración 'request.headers', como texto JSON.
--   current_setting('nombre', true): lee esa configuración. El true
--     significa "si no existe, devolvé NULL en vez de dar error" (pasa
--     cuando corrés la función desde el SQL Editor).
--   ::json        convierte el texto a JSON.
--   ->> 'clave'   saca un valor del JSON como texto.
-- cf-connecting-ip lo pone Cloudflare (que está delante de Supabase) y
-- el navegador no lo puede falsificar. x-forwarded-for sí se puede
-- falsificar en parte, por eso va como segunda opción.
-- split_part(texto, ',', 1): x-forwarded-for puede traer varias IPs
-- separadas por coma ("cliente, proxy"); nos quedamos con la primera.
-- coalesce(a, b, c): devuelve el primero que no sea NULL.
-- stable: dentro de una misma consulta devuelve siempre lo mismo (le
-- permite a Postgres no recalcularla).
create or replace function ip_cliente()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    'sin-ip'
  );
$$;

-- dni_bloqueado_por_intentos(): true si esta IP ya probó demasiados DNIs
-- que no existen. Los dos valores (10 intentos, 15 minutos) se cambian acá.
-- Solo cuentan los fallidos: un alumno que escribe bien su DNI y vuelve
-- a entrar no gasta intentos. Tampoco molesta a varios alumnos que usan
-- el mismo wifi (comparten IP), salvo que se equivoquen muchas veces.
create or replace function dni_bloqueado_por_intentos()
returns boolean
language sql
security definer
set search_path = public
as $$
  select count(*) >= 10
  from intentos_dni
  where ip = ip_cliente()
    and creado_en > now() - interval '15 minutes';
$$;

-- anotar_intento_fallido(): guarda el intento y, de paso, borra los de
-- hace más de un día (así la tabla nunca crece mucho).
create or replace function anotar_intento_fallido()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into intentos_dni (ip) values (ip_cliente());
  delete from intentos_dni where creado_en < now() - interval '1 day';
end;
$$;

-- Estas tres son internas: anon no las puede llamar directo (las llaman
-- verificar_alumno y crear_reserva por dentro).
revoke execute on function ip_cliente() from public, anon, authenticated;
revoke execute on function dni_bloqueado_por_intentos() from public, anon, authenticated;
revoke execute on function anotar_intento_fallido() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. verificar_alumno con límite de intentos.
-- ---------------------------------------------------------------------
-- Cambia lo que devuelve (suma tiene_pendiente) pero no los parámetros,
-- así que alcanza con CREATE OR REPLACE.
create or replace function verificar_alumno(p_dni text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno record;
begin
  -- Primero el límite: si ya se pasó, ni siquiera buscamos el DNI.
  if dni_bloqueado_por_intentos() then
    raise exception 'Hubo demasiados intentos con DNIs que no están registrados. Esperá 15 minutos y probá de nuevo.';
  end if;

  select id, nombre, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni);

  if not found then
    -- Importante: acá NO usamos raise exception. Un raise deshace todo
    -- lo que hizo la función (también el insert del intento), y el
    -- intento no quedaría anotado. Por eso devolvemos NULL, como antes.
    perform anotar_intento_fallido();
    -- PERFORM: llama a una función y descarta lo que devuelve (en plpgsql
    -- no se puede escribir "select funcion()" sin un INTO).
    return null;
  end if;

  return json_build_object(
    'nombre', v_alumno.nombre,
    'habilitado', not v_alumno.bloqueado,
    -- exists (...): true si la consulta de adentro encuentra al menos
    -- una fila. Así la página avisa en el primer paso, antes de que el
    -- alumno elija horario y suba archivos.
    'tiene_pendiente', exists (
      select 1 from reservas
      where alumno_id = v_alumno.id and estado = 'pendiente_pago'
    )
  );
end;
$$;

revoke execute on function verificar_alumno(text) from public;
grant execute on function verificar_alumno(text) to anon;

-- ---------------------------------------------------------------------
-- 4. crear_reserva con límite de intentos y de pendientes.
-- ---------------------------------------------------------------------
-- Es la de 014 con tres cambios, marcados con "015":
--   a) chequea el límite de intentos de DNI al empezar;
--   b) si el DNI no existe, anota el intento y devuelve NULL (en vez de
--      raise exception, por lo mismo que en verificar_alumno);
--   c) bloquea la fila del alumno (FOR UPDATE) y no lo deja tener más de
--      1 reserva pendiente_pago.
-- Los parámetros no cambian: alcanza con CREATE OR REPLACE.
create or replace function crear_reserva(
  p_horarios uuid[],
  p_dni text,
  p_materia text,
  p_anio_cursando text,       -- opcional
  p_notas text,               -- opcional
  p_apuntes text[],           -- opcional: nombres de archivos en el bucket apuntes
  p_comprobante_url text      -- nombre del archivo en el bucket comprobantes
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno record;
  v_profesor_id smallint;
  v_horario record;
  v_cantidad integer := 0;
  v_fecha date;
  v_fin time;
  v_anterior_era_media boolean := false;
  v_minutos integer := 0;
  v_precio numeric(10, 2);
  v_reserva_id uuid;
  v_apuntes text[];
  v_encontrados integer;
  v_bytes bigint;
begin
  -- -------------------------------------------------------------------
  -- 0. Límite de intentos de DNI (015 a).
  -- -------------------------------------------------------------------
  if dni_bloqueado_por_intentos() then
    raise exception 'Hubo demasiados intentos con DNIs que no están registrados. Esperá 15 minutos y probá de nuevo.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. El alumno y la materia.
  -- -------------------------------------------------------------------
  if p_horarios is null or cardinality(p_horarios) = 0 then
    raise exception 'Elegí al menos un horario.';
  end if;

  if (select count(distinct x) from unnest(p_horarios) as x) <> cardinality(p_horarios) then
    raise exception 'Hay un horario repetido.';
  end if;

  -- FOR UPDATE (015 c): bloquea la fila de este alumno hasta que termine
  -- la función. Si el mismo alumno manda dos reservas al mismo tiempo
  -- (dos pestañas, doble clic), la segunda espera a que termine la
  -- primera, y ahí ya ve la pendiente y no pasa el chequeo de abajo.
  select id, nombre, apellido, telefono, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni)
  for update;

  if not found then
    -- 015 b: devolver NULL (la página muestra "Ese DNI no está registrado").
    perform anotar_intento_fallido();
    return null;
  end if;

  -- Un alumno bloqueado recibe el mismo mensaje que cuando no hay lugar
  -- (la página tampoco le dice que está bloqueado).
  if v_alumno.bloqueado then
    raise exception 'Ya no queda lugar en los horarios elegidos. Elegí otro horario.';
  end if;

  -- 015 c: como máximo 1 reserva esperando confirmación.
  if exists (
    select 1 from reservas
    where alumno_id = v_alumno.id and estado = 'pendiente_pago'
  ) then
    raise exception 'Ya tenés una reserva esperando que el profesor la confirme. Cuando la confirme o la rechace vas a poder hacer otra.';
  end if;

  select profesor_id into v_profesor_id
  from materias
  where nombre = p_materia;

  if not found then
    raise exception 'La materia no es válida.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Los archivos (igual que en 014).
  -- -------------------------------------------------------------------
  if coalesce(trim(p_comprobante_url), '') = '' then
    raise exception 'Falta el comprobante.';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'comprobantes' and name = p_comprobante_url
  ) then
    raise exception 'No se encontró el comprobante. Volvé a subirlo.';
  end if;

  if exists (select 1 from reservas where comprobante_url = p_comprobante_url) then
    raise exception 'Ese comprobante ya se usó en otra reserva.';
  end if;

  v_apuntes := coalesce(array_remove(p_apuntes, null), '{}');

  if cardinality(v_apuntes) > 0 then
    if (select count(distinct x) from unnest(v_apuntes) as x) <> cardinality(v_apuntes) then
      raise exception 'Hay un archivo de apuntes repetido.';
    end if;

    select count(*), coalesce(sum((metadata->>'size')::bigint), 0)
    into v_encontrados, v_bytes
    from storage.objects
    where bucket_id = 'apuntes' and name = any(v_apuntes);

    if v_encontrados <> cardinality(v_apuntes) then
      raise exception 'No se encontró alguno de los apuntes. Volvé a subirlos.';
    end if;

    if v_bytes > 3 * 1024 * 1024 then
      raise exception 'Los apuntes no pueden sumar más de 3 MB.';
    end if;

    if exists (select 1 from reservas where apuntes && v_apuntes) then
      raise exception 'Alguno de los apuntes ya se usó en otra reserva.';
    end if;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Los horarios (igual que en 014).
  -- -------------------------------------------------------------------
  for v_horario in
    select id, fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos
    from disponibilidad
    where id = any(p_horarios)
    order by fecha, hora
    for update
  loop
    v_cantidad := v_cantidad + 1;

    if v_cantidad = 1 then
      v_fecha := v_horario.fecha;

      if v_horario.duracion_minutos <> 60 then
        raise exception 'La reserva tiene que empezar con un horario de 1 hora.';
      end if;

      if (v_horario.fecha + v_horario.hora) at time zone 'America/Argentina/Buenos_Aires'
         < now() + interval '24 hours' then
        raise exception 'Las reservas se hacen con al menos 24 horas de anticipación.';
      end if;
    else
      if v_horario.fecha <> v_fecha then
        raise exception 'Todos los horarios tienen que ser del mismo día.';
      end if;

      if v_anterior_era_media then
        raise exception 'La media hora solo puede ir al final de la reserva.';
      end if;

      if v_horario.hora <> v_fin then
        raise exception 'Los horarios tienen que ser seguidos.';
      end if;
    end if;

    if v_horario.cupo_ocupado >= v_horario.cupo_maximo then
      raise exception 'Ya no queda lugar en el horario de las %. Elegí otro horario.',
        to_char(v_horario.hora, 'HH24:MI');
    end if;

    v_fin := v_horario.hora + make_interval(mins => v_horario.duracion_minutos);
    v_anterior_era_media := v_horario.duracion_minutos = 30;
    v_minutos := v_minutos + v_horario.duracion_minutos;
  end loop;

  if v_cantidad <> cardinality(p_horarios) then
    raise exception 'Alguno de los horarios ya no existe. Volvé a elegir.';
  end if;

  -- -------------------------------------------------------------------
  -- 4. Guardar (igual que en 014).
  -- -------------------------------------------------------------------
  select precio_por_hora into v_precio from profesores where id = v_profesor_id;

  update disponibilidad
  set cupo_ocupado = cupo_ocupado + 1
  where id = any(p_horarios);

  insert into reservas (
    alumno_id, profesor_id, nombre, apellido, telefono, materia,
    anio_cursando, notas, apuntes, comprobante_url, monto
  )
  values (
    v_alumno.id, v_profesor_id, v_alumno.nombre, v_alumno.apellido, v_alumno.telefono, p_materia,
    nullif(trim(p_anio_cursando), ''), nullif(trim(p_notas), ''),
    v_apuntes, trim(p_comprobante_url),
    round(v_precio * v_minutos / 60)
  )
  returning id into v_reserva_id;

  insert into reserva_horarios (reserva_id, disponibilidad_id)
  select v_reserva_id, unnest(p_horarios);

  return v_reserva_id;
end;
$$;

revoke execute on function crear_reserva(uuid[], text, text, text, text, text[], text) from public;
grant execute on function crear_reserva(uuid[], text, text, text, text, text[], text) to anon;
grant execute on function crear_reserva(uuid[], text, text, text, text, text[], text) to authenticated;
