-- =====================================================================
-- 016: vencimiento de reservas pendientes (paso B1 del plan)
-- 1. Columnas nuevas en reservas: vencida y devuelto_en.
-- 2. vencer_reservas_pendientes(): las pendiente_pago con más de 30
--    minutos pasan a rechazado (marcadas como vencidas, con devolución)
--    y liberan sus lugares.
-- 3. marcar_devuelta(): el profesor avisa que ya devolvió la plata.
-- 4. pg_cron: corre la función de vencer cada 1 minuto, y una vez por
--    día borra el historial viejo de pg_cron.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas.
-- ---------------------------------------------------------------------
-- vencida: true si la rechazó el sistema por tiempo (no el profesor).
-- devuelto_en: cuándo el profesor marcó que ya devolvió la plata. Queda
-- null mientras falte devolverla. Mientras sea null, la reserva vencida
-- sigue apareciendo en el panel.
-- La columna devolucion (de 012) se reusa: en una vencida va en true
-- (el alumno pagó y no tuvo la clase: se le devuelve el 100%).
alter table reservas
  add column if not exists vencida boolean not null default false,
  add column if not exists devuelto_en timestamptz;

-- ---------------------------------------------------------------------
-- 2. Vencer las pendientes.
-- ---------------------------------------------------------------------
-- La ventana de 30 minutos se cuenta desde creado_en: la reserva se crea
-- en el mismo momento en que se sube el comprobante. Si algún día se
-- cambia el valor, cambiarlo también en ReservasAdmin.js (VENTANA_MINUTOS).
-- Devuelve cuántas reservas venció (sirve para probarla a mano).
create or replace function vencer_reservas_pendientes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  -- a) Elegir las vencidas y bloquearlas.
  -- array_agg(id): junta todos los id en una lista (uuid[]).
  -- FOR UPDATE SKIP LOCKED: bloquea esas filas, pero SALTEA las que ya
  -- estén bloqueadas por otro. Pasa si el profesor está confirmando esa
  -- misma reserva justo ahora: no la tocamos y la confirmación gana. Si
  -- al final no la confirmó, el próximo minuto se vence.
  -- (array_agg no se puede usar junto con FOR UPDATE en la misma consulta,
  -- por eso el FOR UPDATE va en la subconsulta de adentro.)
  select array_agg(id) into v_ids
  from (
    select id from reservas
    where estado = 'pendiente_pago'
      and creado_en < now() - interval '30 minutes'
    for update skip locked
  ) as vencidas;

  -- Si no hay ninguna, array_agg devuelve null: no hay nada que hacer.
  if v_ids is null then
    return 0;
  end if;

  -- b) Liberar los lugares.
  -- Ojo: si dos reservas vencidas usan el mismo horario, hay que restar 2
  -- en ese horario. Un "update ... where id in (...)" restaría 1 sola vez
  -- (cada fila se actualiza una vez). Por eso primero contamos cuántas
  -- reservas vencidas hay por horario (group by) y restamos ese número.
  -- UPDATE ... FROM (subconsulta): actualiza usando los datos de otra
  -- consulta; el WHERE une cada horario con su cantidad.
  update disponibilidad d
  set cupo_ocupado = d.cupo_ocupado - x.cantidad
  from (
    select disponibilidad_id, count(*) as cantidad
    from reserva_horarios
    where reserva_id = any(v_ids)
    group by disponibilidad_id
  ) as x
  where d.id = x.disponibilidad_id;

  -- c) Marcarlas como vencidas.
  update reservas
  set estado = 'rechazado', vencida = true, devolucion = true
  where id = any(v_ids);

  return cardinality(v_ids);
end;
$$;

-- Solo la corre pg_cron (como el usuario postgres). Nadie desde la página.
revoke execute on function vencer_reservas_pendientes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Marcar que ya se devolvió la plata.
-- ---------------------------------------------------------------------
create or replace function marcar_devuelta(p_reserva_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva record;
begin
  select id, profesor_id, vencida, devuelto_en into v_reserva
  from reservas
  where id = p_reserva_id
  for update;

  -- Igual que en cambiar_estado_reserva (012): si no existe o es de otro
  -- profesor, el mensaje es el mismo.
  if not found or v_reserva.profesor_id is distinct from mi_profesor_id() then
    raise exception 'No se encontró la reserva.';
  end if;

  if not v_reserva.vencida then
    raise exception 'Solo se puede marcar la devolución de una reserva vencida.';
  end if;

  if v_reserva.devuelto_en is not null then
    raise exception 'Esa devolución ya estaba marcada.';
  end if;

  update reservas set devuelto_en = now() where id = p_reserva_id;
end;
$$;

revoke execute on function marcar_devuelta(uuid) from public, anon;
grant execute on function marcar_devuelta(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. pg_cron: el "reloj" de la base.
-- ---------------------------------------------------------------------
-- pg_cron es una extensión de Postgres que corre consultas según un
-- horario. Viene en Supabase (también en el plan gratuito). Si esta
-- línea da error de permisos, activala desde el panel: Integrations →
-- Cron → Enable, y después corré este archivo de nuevo.
create extension if not exists pg_cron;

-- cron.schedule('nombre', 'horario', 'consulta'): crea la tarea. Si ya
-- existe una con ese nombre, la reemplaza (así el archivo se puede
-- correr dos veces).
-- El horario va en formato cron, cinco campos separados por espacios:
--   minuto  hora  día-del-mes  mes  día-de-la-semana
-- "*" significa "todos". '* * * * *' = cada minuto de cada hora de cada día.
-- $$ ... $$: comillas para texto que adentro puede tener comillas simples.
select cron.schedule(
  'vencer-reservas',
  '* * * * *',
  $$select public.vencer_reservas_pendientes()$$
);

-- pg_cron anota cada ejecución en cron.job_run_details. Cada minuto son
-- 1440 filas por día: esta segunda tarea borra las de más de 7 días,
-- todos los días a las 3:00 (hora UTC, o sea 00:00 en Argentina).
-- '0 3 * * *' = minuto 0, hora 3, todos los días.
select cron.schedule(
  'limpiar-historial-cron',
  '0 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
