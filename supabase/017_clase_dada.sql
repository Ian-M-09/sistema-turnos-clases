-- =====================================================================
-- 017: marcar clases dadas (paso C4, parte opcional)
-- 1. Columna dada_en en reservas: cuándo el profesor marcó que la clase
--    se dio. Queda null mientras no se marque.
-- 2. marcar_clase_dada: marca o desmarca (por si se tocó sin querer).
-- La agenda (AgendaAdmin.js) no necesita nada nuevo en la base: lee con
-- las políticas de 012 (cada profesor sus reservas) y la lectura pública
-- de disponibilidad (003).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columna nueva.
-- ---------------------------------------------------------------------
alter table reservas
  add column if not exists dada_en timestamptz;

-- ---------------------------------------------------------------------
-- 2. marcar_clase_dada.
-- ---------------------------------------------------------------------
-- p_dada = true: marca la clase como dada (solo si ya empezó).
-- p_dada = false: la desmarca.
create or replace function marcar_clase_dada(p_reserva_id uuid, p_dada boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
  v_inicio timestamptz;
begin
  -- Igual que en cambiar_estado_reserva (012): FOR UPDATE bloquea la
  -- reserva, y si no existe o es de otro profesor, el mensaje es el mismo.
  select id, estado, profesor_id into v_reserva
  from reservas
  where id = p_reserva_id
  for update;

  if not found or v_reserva.profesor_id is distinct from mi_profesor_id() then
    raise exception 'No se encontró la reserva.';
  end if;

  if v_reserva.estado <> 'confirmado' then
    raise exception 'Solo se puede marcar una clase confirmada.';
  end if;

  if p_dada then
    -- Cuándo empieza la clase (el primer horario, en hora de Argentina),
    -- igual que al cancelar en 012.
    select min((d.fecha + d.hora) at time zone 'America/Argentina/Buenos_Aires')
    into v_inicio
    from reserva_horarios rh
    join disponibilidad d on d.id = rh.disponibilidad_id
    where rh.reserva_id = p_reserva_id;

    -- Si no tiene horarios (v_inicio null) o todavía no empezó, no se marca.
    if v_inicio is null or v_inicio > now() then
      raise exception 'La clase todavía no empezó.';
    end if;

    -- coalesce(dada_en, now()): si ya estaba marcada, se deja la fecha
    -- que tenía (tocar dos veces no la cambia).
    update reservas set dada_en = coalesce(dada_en, now()) where id = p_reserva_id;
  else
    update reservas set dada_en = null where id = p_reserva_id;
  end if;
end;
$$;

revoke execute on function marcar_clase_dada(uuid, boolean) from public, anon;
grant execute on function marcar_clase_dada(uuid, boolean) to authenticated;
