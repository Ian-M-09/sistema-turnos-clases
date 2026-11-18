-- =====================================================================
-- 029: se puede reservar con 3 horas de anticipación (antes eran 24)
-- Ejemplo: a las 14:00 el alumno puede reservar desde las 17:00 de ese día.
-- Las 24 horas siguen valiendo SOLO para la devolución del dinero: esa
-- regla está en cambiar_estado_reserva (018) y no se toca.
--
-- Es la función crear_reserva de 015 con un solo cambio, marcado con
-- "NUEVO EN 029". Los parámetros no cambian: alcanza con CREATE OR REPLACE.
-- Se puede volver a correr.
--
-- ORDEN: correr este archivo ANTES de publicar la página nueva. Si no, la
-- página ofrecería horarios que la base todavía rechaza.
-- =====================================================================

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

      -- NUEVO EN 029: se puede reservar hasta 3 horas antes de que empiece
      -- la clase, también el mismo día. Si faltan exactamente 3 horas, se acepta.
      -- at time zone: interpreta la fecha y la hora del horario como hora
      -- de Argentina, sin importar la zona del servidor.
      if (v_horario.fecha + v_horario.hora) at time zone 'America/Argentina/Buenos_Aires'
         < now() + interval '3 hours' then
        raise exception 'Las reservas se hacen con al menos 3 horas de anticipación.';
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
