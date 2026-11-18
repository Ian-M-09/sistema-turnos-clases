-- =====================================================================
-- 028: cada profesor puede tener su propio bot de Telegram
-- Hasta ahora había un solo token en Vault (telegram_bot_token) para los
-- dos profesores. Ahora enviar_telegram busca primero el token propio:
--   telegram_bot_token_1  bot de la profesora
--   telegram_bot_token_2  bot del profesor (opcional)
-- Si el profesor no tiene uno propio, usa telegram_bot_token como antes.
-- Así, correr este archivo no cambia nada hasta que se cargue un token nuevo.
--
-- Los tokens NO van en este archivo (el repo es público): se cargan en
-- el panel de Supabase, en Vault.
-- Se puede volver a correr (create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. enviar_telegram: ahora elige el token según el profesor.
-- ---------------------------------------------------------------------
-- Es el único lugar que lee los tokens. Las otras dos funciones de este
-- archivo la llaman a ella, para no repetir esta búsqueda.
-- Devuelve false si falta el token o el chat_id (igual que en 022).
create or replace function enviar_telegram(p_profesor_id smallint, p_texto text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_chat_id bigint;
begin
  -- coalesce(a, b): devuelve a, y si a es NULL devuelve b.
  -- 'telegram_bot_token_' || p_profesor_id: une el texto con el número y
  -- queda, por ejemplo, 'telegram_bot_token_1'.
  v_token := coalesce(
    (select decrypted_secret from vault.decrypted_secrets
     where name = 'telegram_bot_token_' || p_profesor_id),
    (select decrypted_secret from vault.decrypted_secrets
     where name = 'telegram_bot_token')
  );

  select chat_id into v_chat_id
  from telegram_profesores
  where profesor_id = p_profesor_id;

  if v_token is null or v_chat_id is null then
    return false;
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat_id, 'text', p_texto)
  );
  return true;
end;
$$;

-- Muy importante: si la página pudiera llamarla, cualquiera podría
-- mandarles mensajes a los profesores con el bot.
revoke execute on function enviar_telegram(smallint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. avisar_reserva_nueva: el mismo mensaje de 018.
-- ---------------------------------------------------------------------
-- Único cambio: en vez de buscar el token acá, llama a enviar_telegram.
-- El trigger de 018 sigue apuntando a esta función: no hay que recrearlo.
create or replace function avisar_reserva_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_fecha date;
  v_desde time;
  v_hasta time;
  v_vence text;
  v_dias text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_texto text;
begin
  -- BEGIN ... EXCEPTION: si falla el aviso, la reserva se guarda igual.
  begin
    select valor into v_url from ajustes where clave = 'url_panel';

    select min(d.fecha), min(d.hora), max(d.hora + make_interval(mins => d.duracion_minutos))
    into v_fecha, v_desde, v_hasta
    from reserva_horarios rh
    join disponibilidad d on d.id = rh.disponibilidad_id
    where rh.reserva_id = new.id;

    -- Los mismos 30 minutos que vencer_reservas_pendientes (016).
    v_vence := to_char(
      (new.creado_en + interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires',
      'HH24:MI'
    );

    v_texto :=
      'Nueva reserva para confirmar' || chr(10) || chr(10) ||
      'Alumno: ' || new.nombre || ' ' || new.apellido || chr(10) ||
      'Materia: ' || new.materia || chr(10) ||
      'Clase: ' || coalesce(
        v_dias[extract(isodow from v_fecha)::int] || ' ' || to_char(v_fecha, 'DD/MM') ||
        ', ' || to_char(v_desde, 'HH24:MI') || ' a ' || to_char(v_hasta, 'HH24:MI'),
        '?') || chr(10) ||
      'Monto: $' || coalesce(replace(to_char(new.monto, 'FM999,999,990'), ',', '.'), '?') || chr(10) || chr(10) ||
      'Revisá que la plata haya llegado y confirmá antes de las ' || v_vence ||
      ' (si no, la reserva vence sola).' ||
      coalesce(chr(10) || chr(10) || 'Panel: ' || v_url, '');

    -- PERFORM: llama a la función y descarta lo que devuelve.
    perform enviar_telegram(new.profesor_id, v_texto);
  exception when others then
    raise warning 'No se pudo mandar el aviso de Telegram: %', sqlerrm;
  end;

  return null;
end;
$$;

revoke execute on function avisar_reserva_nueva() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. recordar_cargar_horarios: el mismo recordatorio de 019.
-- ---------------------------------------------------------------------
-- Único cambio: el envío también pasa por enviar_telegram. Las tareas de
-- pg_cron de 019 siguen llamando a esta función: no hay que recrearlas.
create or replace function recordar_cargar_horarios(p_profesor_id smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_hoy date;
  v_lunes date;
  v_domingo date;
  v_cargados integer;
  v_texto text;
begin
  select valor into v_url from ajustes where clave = 'url_panel';

  -- La semana que viene, contada desde hoy en Argentina.
  v_hoy := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_lunes := date_trunc('week', v_hoy)::date + 7;
  v_domingo := v_lunes + 6;

  select count(*) into v_cargados
  from disponibilidad
  where fecha between v_lunes and v_domingo;

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

  return enviar_telegram(p_profesor_id, v_texto);
end;
$$;

revoke execute on function recordar_cargar_horarios(smallint) from public, anon, authenticated;
