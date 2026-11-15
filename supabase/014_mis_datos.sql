-- =====================================================================
-- 014: "Mis datos" en el panel
-- 1. deposito_por_hora pasa a llamarse precio_por_hora (desde que el
--    alumno paga el 100%, guarda el precio completo de 1 hora).
-- 2. crear_reserva se vuelve a crear para usar el nombre nuevo (es igual
--    a la de 009, solo cambia esa columna).
-- 3. Cada profesor puede cambiar SUS datos: nombre, precio, CBU, alias y
--    titular. No puede cambiar su id ni su color.
-- 4. Checks de formato para el CBU y el alias.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Renombrar la columna.
-- ---------------------------------------------------------------------
-- RENAME COLUMN: cambia el nombre sin tocar los datos. El check de
-- precio > 0 de 009 sigue valiendo (Postgres lo actualiza solo).
-- Va en un bloque DO para poder correr el archivo dos veces: la segunda
-- vez la columna vieja ya no existe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profesores' and column_name = 'deposito_por_hora'
  ) then
    alter table profesores rename column deposito_por_hora to precio_por_hora;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. crear_reserva con el nombre nuevo.
-- ---------------------------------------------------------------------
-- Hace falta volver a crearla: plpgsql no revisa las columnas cuando se
-- crea la función, sino cuando se ejecuta. Si no, la próxima reserva
-- daría error "column deposito_por_hora does not exist".
-- Los parámetros son los mismos, así que alcanza con CREATE OR REPLACE.
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
  -- 1. El alumno y la materia (nuevo en 009).
  -- -------------------------------------------------------------------
  if p_horarios is null or cardinality(p_horarios) = 0 then
    raise exception 'Elegí al menos un horario.';
  end if;

  if (select count(distinct x) from unnest(p_horarios) as x) <> cardinality(p_horarios) then
    raise exception 'Hay un horario repetido.';
  end if;

  select id, nombre, apellido, telefono, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni);

  if not found then
    raise exception 'Ese DNI no está registrado. Pedile a tu profesor que te registre.';
  end if;

  -- Un alumno bloqueado recibe el mismo mensaje que cuando no hay lugar
  -- (la página tampoco le dice que está bloqueado).
  if v_alumno.bloqueado then
    raise exception 'Ya no queda lugar en los horarios elegidos. Elegí otro horario.';
  end if;

  -- La materia tiene que estar en la tabla materias, y de ahí sale el
  -- profesor que va a recibir y confirmar la reserva.
  select profesor_id into v_profesor_id
  from materias
  where nombre = p_materia;

  if not found then
    raise exception 'La materia no es válida.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Los archivos (igual que en 008).
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
  -- 3. Los horarios (igual que en 006 y 008).
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
  -- 4. Guardar. El precio sale del profesor de la materia (en 014 la
  --    columna pasó a llamarse precio_por_hora).
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

-- ---------------------------------------------------------------------
-- 3. Cada profesor edita sus datos.
-- ---------------------------------------------------------------------
-- Dos capas:
-- a) GRANT por columnas: el rol authenticated solo puede hacer UPDATE en
--    estas cinco columnas (no en id ni en tema). REVOKE primero le saca
--    el permiso general que Supabase da por defecto sobre toda la tabla.
revoke update on profesores from authenticated;
grant update (nombre, precio_por_hora, cbu, alias, titular) on profesores to authenticated;

-- b) RLS: solo SU fila (id = mi_profesor_id(), de 010).
drop policy if exists "Cada profesor edita sus datos" on profesores;
create policy "Cada profesor edita sus datos"
  on profesores for update to authenticated
  using (id = mi_profesor_id())
  with check (id = mi_profesor_id());

-- ---------------------------------------------------------------------
-- 4. Formato del CBU y el alias.
-- ---------------------------------------------------------------------
-- CBU (o CVU de una billetera virtual): siempre 22 números.
-- Alias: de 6 a 20 caracteres, solo letras, números, puntos y guiones.
-- Si los datos que ya están cargados no cumplen, este paso da error:
-- corregirlos primero en el Table Editor.
alter table profesores drop constraint if exists profesores_cbu_check;
alter table profesores add constraint profesores_cbu_check check (cbu ~ '^[0-9]{22}$');

alter table profesores drop constraint if exists profesores_alias_check;
alter table profesores add constraint profesores_alias_check check (alias ~ '^[A-Za-z0-9.-]{6,20}$');

-- Nombre y titular no pueden quedar vacíos (solo espacios tampoco).
alter table profesores drop constraint if exists profesores_nombre_check;
alter table profesores add constraint profesores_nombre_check check (trim(nombre) <> '');

alter table profesores drop constraint if exists profesores_titular_check;
alter table profesores add constraint profesores_titular_check check (trim(titular) <> '');
