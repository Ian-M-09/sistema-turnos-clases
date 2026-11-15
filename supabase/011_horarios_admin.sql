-- =====================================================================
-- 011: cargar y dar de baja horarios desde el panel (paso C2)
-- Los dos profesores comparten los horarios, así que los dos pueden
-- cargarlos y darlos de baja. Se hace solo con estas dos funciones; el
-- navegador no puede insertar ni borrar directo en disponibilidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- cargar_horarios: arma los horarios de un día a partir de un rango.
-- Ejemplo: 14:00 a 17:30 → 14:00, 15:00 y 16:00 (de 1 hora) y 17:00 (la
-- media hora final). Devuelve cuántos horarios nuevos creó.
-- ---------------------------------------------------------------------
create or replace function cargar_horarios(p_fecha date, p_desde time, p_hasta time)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hora time := p_desde;      -- la hora del horario que se está armando
  v_duracion integer;          -- 60 o 30
  v_creados integer := 0;
  v_choque record;
begin
  -- Solo los profesores (010). Sin esto, como la función es security
  -- definer, cualquiera con sesión podría usarla.
  if mi_profesor_id() is null then
    raise exception 'No tenés permiso para cargar horarios.';
  end if;

  if p_fecha is null or p_desde is null or p_hasta is null then
    raise exception 'Faltan el día o el horario.';
  end if;

  -- now() at time zone '...': la fecha y hora de este momento en
  -- Argentina, y ::date se queda solo con la fecha (hoy). La zona horaria
  -- va a mano porque el servidor de Supabase usa la hora UTC.
  if p_fecha <= (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Solo se pueden cargar horarios desde mañana en adelante.';
  end if;

  if p_hasta <= p_desde then
    raise exception 'El horario de fin tiene que ser después del de inicio.';
  end if;

  -- extract(minute from hora): saca los minutos (por ejemplo 30 de 14:30).
  -- Solo se aceptan horas en punto o y media, así los horarios encajan.
  if extract(minute from p_desde) not in (0, 30) or extract(minute from p_hasta) not in (0, 30) then
    raise exception 'Los horarios tienen que ser en punto o y media (por ejemplo 14:00 o 14:30).';
  end if;

  if p_hasta - p_desde < interval '1 hour' then
    raise exception 'El rango tiene que ser de al menos 1 hora.';
  end if;

  -- WHILE condición LOOP ... END LOOP: repite mientras quede lugar en el
  -- rango para un horario más.
  while v_hora < p_hasta loop
    -- Si entra 1 hora entera, es de 60; si solo queda media hora, de 30.
    -- Se compara restando (hasta - hora = lo que falta) en vez de sumar,
    -- porque el tipo time da la vuelta a la medianoche: 23:00 + 1 hora
    -- da 00:00, que parecería "antes" que 23:30.
    if p_hasta - v_hora >= interval '1 hour' then
      v_duracion := 60;
    else
      v_duracion := 30;
    end if;

    -- ¿Ya hay un horario ese día que se pise con este? Dos horarios se
    -- pisan si cada uno empieza antes de que termine el otro.
    -- Si es EXACTAMENTE el mismo (misma hora y duración), no es un error:
    -- se saltea (así se puede volver a cargar la misma semana sin problemas).
    select hora, duracion_minutos into v_choque
    from disponibilidad
    where fecha = p_fecha
      and hora < v_hora + make_interval(mins => v_duracion)
      and v_hora < hora + make_interval(mins => duracion_minutos)
    limit 1;

    if found then
      if v_choque.hora <> v_hora or v_choque.duracion_minutos <> v_duracion then
        raise exception 'El % a las % se pisa con un horario que ya estaba cargado (%).',
          to_char(p_fecha, 'DD/MM'), to_char(v_hora, 'HH24:MI'), to_char(v_choque.hora, 'HH24:MI');
      end if;
    else
      -- cupo_maximo y cupo_ocupado toman sus valores por defecto (5 y 0).
      insert into disponibilidad (fecha, hora, duracion_minutos)
      values (p_fecha, v_hora, v_duracion);
      v_creados := v_creados + 1;
    end if;

    v_hora := v_hora + make_interval(mins => v_duracion);
  end loop;

  return v_creados;
end;
$$;

revoke execute on function cargar_horarios(date, time, time) from public;
grant execute on function cargar_horarios(date, time, time) to authenticated;

-- ---------------------------------------------------------------------
-- dar_de_baja_horario: borra un horario, solo si no tiene reservas
-- pendientes ni confirmadas.
-- ---------------------------------------------------------------------
create or replace function dar_de_baja_horario(p_id uuid)
returns void
-- returns void: no devuelve nada (solo hace el cambio).
language plpgsql
security definer
set search_path = public
as $$
begin
  if mi_profesor_id() is null then
    raise exception 'No tenés permiso para dar de baja horarios.';
  end if;

  -- PERFORM: como SELECT, pero descarta el resultado. Con FOR UPDATE
  -- bloquea la fila: si justo un alumno está reservando este horario,
  -- una de las dos operaciones espera a que termine la otra.
  perform 1 from disponibilidad where id = p_id for update;
  if not found then
    raise exception 'Ese horario ya no existe.';
  end if;

  if exists (
    select 1
    from reserva_horarios rh
    join reservas r on r.id = rh.reserva_id
    -- JOIN ... ON: une cada fila de reserva_horarios con su reserva.
    where rh.disponibilidad_id = p_id
      and r.estado in ('pendiente_pago', 'confirmado')
  ) then
    raise exception 'Este horario tiene reservas: no se puede dar de baja.';
  end if;

  -- Si quedaron reservas RECHAZADAS que usaban este horario, se suelta
  -- el vínculo (la reserva rechazada se conserva, pero sin este horario);
  -- si no, Postgres no deja borrar el horario (ver 004).
  delete from reserva_horarios where disponibilidad_id = p_id;
  delete from disponibilidad where id = p_id;
end;
$$;

revoke execute on function dar_de_baja_horario(uuid) from public;
grant execute on function dar_de_baja_horario(uuid) to authenticated;
