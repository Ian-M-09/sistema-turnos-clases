-- =====================================================================
-- 012: reservas en el panel (paso C3)
-- 1. Nuevo estado "cancelado" (el alumno avisó que no viene) y si
--    corresponde devolverle el pago.
-- 2. Cada profesor puede LEER solo las reservas de sus materias, y ver
--    sus comprobantes y apuntes.
-- 3. cambiar_estado_reserva: confirmar, rechazar o cancelar. Rechazar y
--    cancelar liberan los lugares.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estado cancelado.
-- ---------------------------------------------------------------------
-- El check de 004 solo acepta tres estados. Se borra y se crea de nuevo
-- con el cuarto. (Postgres lo llamó reservas_estado_check.)
alter table reservas drop constraint if exists reservas_estado_check;
alter table reservas add constraint reservas_estado_check
  check (estado in ('pendiente_pago', 'confirmado', 'rechazado', 'cancelado'));

-- cancelado_en: cuándo se canceló.
-- devolucion: true si se canceló con más de 24 hs de anticipación (hay
-- que devolver el 100%), false si no. Queda null si no está cancelada.
-- La devolución la hace el profesor por transferencia, fuera del sistema.
alter table reservas
  add column if not exists cancelado_en timestamptz,
  add column if not exists devolucion boolean;

-- ---------------------------------------------------------------------
-- 2. Lectura para los profesores.
-- ---------------------------------------------------------------------
-- Cada profesor ve solo las reservas de sus materias (profesor_id).
-- mi_profesor_id() es de 010. Los cambios NO se hacen con políticas: se
-- hacen con la función de abajo.
drop policy if exists "Cada profesor lee sus reservas" on reservas;
create policy "Cada profesor lee sus reservas"
  on reservas for select to authenticated
  using (profesor_id = mi_profesor_id());

-- Los horarios de esas reservas (para saber qué día y a qué hora son).
drop policy if exists "Cada profesor lee los horarios de sus reservas" on reserva_horarios;
create policy "Cada profesor lee los horarios de sus reservas"
  on reserva_horarios for select to authenticated
  using (
    exists (
      select 1 from reservas r
      where r.id = reserva_id and r.profesor_id = mi_profesor_id()
    )
  );

-- Los archivos: un profesor puede abrir un comprobante o un apunte solo
-- si está en una reserva SUYA. Con este permiso puede pedir una URL
-- firmada (un link que vence solo) para verlo.
-- name = any(r.apuntes): el nombre del archivo está en la lista de apuntes.
drop policy if exists "Profesor lee sus comprobantes" on storage.objects;
create policy "Profesor lee sus comprobantes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and exists (
      select 1 from public.reservas r
      where r.comprobante_url = name and r.profesor_id = public.mi_profesor_id()
    )
  );

drop policy if exists "Profesor lee sus apuntes" on storage.objects;
create policy "Profesor lee sus apuntes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'apuntes'
    and exists (
      select 1 from public.reservas r
      where name = any(r.apuntes) and r.profesor_id = public.mi_profesor_id()
    )
  );
-- Acá se escribe "public." adelante porque estas políticas son de una
-- tabla del esquema storage, y ahí Postgres no busca en public solo.

-- ---------------------------------------------------------------------
-- 3. cambiar_estado_reserva.
-- ---------------------------------------------------------------------
-- p_accion: 'confirmar', 'rechazar' o 'cancelar'.
--   confirmar: pendiente_pago → confirmado.
--   rechazar:  pendiente_pago → rechazado (libera los lugares).
--   cancelar:  confirmado     → cancelado (libera los lugares y calcula
--              si corresponde la devolución).
-- Devuelve la devolución (true/false) al cancelar, y null en los otros casos.
create or replace function cambiar_estado_reserva(p_reserva_id uuid, p_accion text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
  v_inicio timestamptz;
  v_devolucion boolean;
begin
  -- FOR UPDATE: bloquea la reserva mientras se cambia, así dos clics a la
  -- vez (o los dos profesores) no la cambian dos veces.
  select id, estado, profesor_id into v_reserva
  from reservas
  where id = p_reserva_id
  for update;

  -- Si no existe, o es de OTRO profesor, el mensaje es el mismo.
  if not found or v_reserva.profesor_id is distinct from mi_profesor_id() then
    raise exception 'No se encontró la reserva.';
  end if;
  -- IS DISTINCT FROM: como "<>", pero también da true si uno es null
  -- (con "<>", null <> 1 da null y el if no entraría).

  if p_accion = 'confirmar' then
    if v_reserva.estado <> 'pendiente_pago' then
      raise exception 'Solo se puede confirmar una reserva pendiente.';
    end if;
    update reservas set estado = 'confirmado' where id = p_reserva_id;
    return null;
  end if;

  if p_accion = 'rechazar' then
    if v_reserva.estado <> 'pendiente_pago' then
      raise exception 'Solo se puede rechazar una reserva pendiente.';
    end if;
    update reservas set estado = 'rechazado' where id = p_reserva_id;
  elsif p_accion = 'cancelar' then
    -- ELSIF: "si no, si..." (otra condición).
    if v_reserva.estado <> 'confirmado' then
      raise exception 'Solo se puede cancelar una reserva confirmada.';
    end if;

    -- Cuándo empieza la clase: el primer horario de la reserva, en hora
    -- de Argentina. min(...): el más temprano.
    select min((d.fecha + d.hora) at time zone 'America/Argentina/Buenos_Aires')
    into v_inicio
    from reserva_horarios rh
    join disponibilidad d on d.id = rh.disponibilidad_id
    where rh.reserva_id = p_reserva_id;

    -- Política: más de 24 hs antes de la clase → se devuelve el 100%.
    -- coalesce(..., false): si no se encontró el horario, sin devolución.
    v_devolucion := coalesce(v_inicio - now() > interval '24 hours', false);

    update reservas
    set estado = 'cancelado', cancelado_en = now(), devolucion = v_devolucion
    where id = p_reserva_id;
  else
    raise exception 'Acción no válida.';
  end if;

  -- Rechazar y cancelar llegan acá: se libera un lugar en cada horario.
  -- IN (subconsulta): los horarios que usaba esta reserva.
  update disponibilidad
  set cupo_ocupado = cupo_ocupado - 1
  where id in (select disponibilidad_id from reserva_horarios where reserva_id = p_reserva_id);

  return v_devolucion;
end;
$$;

revoke execute on function cambiar_estado_reserva(uuid, text) from public;
grant execute on function cambiar_estado_reserva(uuid, text) to authenticated;
