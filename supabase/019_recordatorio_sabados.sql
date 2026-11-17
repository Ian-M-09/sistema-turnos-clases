-- =====================================================================
-- 019: recordatorio de los sábados para cargar horarios (paso D2)
-- Cada sábado le llega a cada profesor un Telegram para cargar los
-- horarios de la semana siguiente, a una hora distinta, así si uno se
-- olvida, el otro se entera:
--   profesora (1): 13:00 de Argentina
--   profesor  (2): 18:00 de Argentina
-- El mensaje dice cuántos horarios hay cargados para esa semana. Usa el
-- mismo bot, token (Vault) y chat_id (telegram_profesores) que 018.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La función que arma y manda el recordatorio.
-- ---------------------------------------------------------------------
-- Devuelve true si mandó el mensaje y false si no pudo (falta el token o
-- ese profesor todavía no cargó su chat_id). Sirve para probarla a mano:
--   select recordar_cargar_horarios(2);
create or replace function recordar_cargar_horarios(p_profesor_id smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_chat_id bigint;
  v_url text;
  v_hoy date;
  v_lunes date;
  v_domingo date;
  v_cargados integer;
  v_texto text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token';

  select chat_id into v_chat_id
  from telegram_profesores
  where profesor_id = p_profesor_id;

  if v_token is null or v_chat_id is null then
    return false;
  end if;

  select valor into v_url from ajustes where clave = 'url_panel';

  -- La semana que viene, contada desde hoy en Argentina.
  -- date_trunc('week', fecha): el lunes de la semana de esa fecha (en
  -- Postgres las semanas empiezan el lunes). Devuelve fecha y hora, por
  -- eso el ::date al final. + 7: el lunes siguiente.
  v_hoy := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_lunes := date_trunc('week', v_hoy)::date + 7;
  v_domingo := v_lunes + 6;
  -- date + número: suma días.

  -- count(*): cuántas filas hay. Los horarios son compartidos, así que se
  -- cuentan todos (los haya cargado quien sea).
  select count(*) into v_cargados
  from disponibilidad
  where fecha between v_lunes and v_domingo;
  -- BETWEEN a AND b: entre a y b, incluyendo los dos.

  -- CASE WHEN ... THEN ... ELSE ... END: el "if" que se puede usar adentro
  -- de una expresión (acá, para elegir el texto según la cantidad).
  v_texto :=
    'Recordatorio: cargá los horarios de la semana del ' ||
    to_char(v_lunes, 'DD/MM') || ' al ' || to_char(v_domingo, 'DD/MM') || '.' ||
    chr(10) || chr(10) ||
    case
      when v_cargados = 0 then 'Todavía no hay ningún horario cargado para esa semana.'
      when v_cargados = 1 then 'Por ahora hay 1 horario cargado para esa semana.'
      else 'Por ahora hay ' || v_cargados || ' horarios cargados para esa semana.'
    end ||
    coalesce(chr(10) || chr(10) || 'Panel: ' || v_url, '');

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat_id, 'text', v_texto)
  );

  return true;
end;
$$;

-- Solo la corre pg_cron (o vos a mano desde el SQL Editor).
revoke execute on function recordar_cargar_horarios(smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Las tareas de pg_cron.
-- ---------------------------------------------------------------------
-- pg_cron usa la hora UTC. Argentina es UTC-3 (sin horario de verano):
--   13:00 de Argentina = 16:00 UTC
--   18:00 de Argentina = 21:00 UTC
-- Formato: minuto hora día-del-mes mes día-de-la-semana.
-- El último campo es el día de la semana: 0 = domingo ... 6 = sábado.
-- '0 16 * * 6' = a las 16:00 UTC (minuto 0), todos los sábados.
-- Igual que en 016, si ya existe una tarea con ese nombre, se reemplaza.
-- ::smallint: el número 1 se escribe como smallint para que coincida con
-- el tipo del parámetro de la función.
select cron.schedule(
  'recordatorio-sabado-profesora',
  '0 16 * * 6',
  $$select public.recordar_cargar_horarios(1::smallint)$$
);

select cron.schedule(
  'recordatorio-sabado-profesor',
  '0 21 * * 6',
  $$select public.recordar_cargar_horarios(2::smallint)$$
);
