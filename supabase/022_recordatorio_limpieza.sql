-- =====================================================================
-- 022: arreglo de la limpieza y recordatorio del día 15 (paso E4)
-- 1. archivos_para_limpiar (021) ya no cuenta los .emptyFolderPlaceholder:
--    son archivos vacíos que crea Supabase cuando se arma una carpeta
--    desde el panel. No son de ningún alumno.
-- 2. enviar_telegram: manda un mensaje a un profesor (para no repetir
--    lo del token y el chat_id en cada recordatorio nuevo).
-- 3. recordar_limpieza: el día 15 de cada mes avisa por Telegram que hay
--    algo para limpiar. Solo manda si HAY algo, a dos horas distintas
--    (profesora 13:00, profesor 18:00 de Argentina): si la profesora ya
--    limpió, al profesor no le llega nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. archivos_para_limpiar sin los placeholders.
-- ---------------------------------------------------------------------
-- Es la de 021 con un solo cambio en la parte b), marcado "NUEVO EN 022".
create or replace function archivos_para_limpiar()
returns table (bucket text, nombre text, bytes bigint, reserva_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0), r.id
  from storage.objects o
  join reservas r
    on (o.bucket_id = 'comprobantes' and o.name = r.comprobante_url)
    or (o.bucket_id = 'apuntes' and o.name = any(r.apuntes))
  where r.id in (select reserva_id from reservas_para_limpiar())

  union all

  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0), null::uuid
  from storage.objects o
  where o.bucket_id in ('comprobantes', 'apuntes')
    and o.created_at < now() - interval '1 day'
    -- NUEVO EN 022: LIKE compara con un patrón; % es "cualquier texto".
    -- '%.emptyFolderPlaceholder' = cualquier nombre que termine así (en
    -- la raíz del bucket o adentro de una carpeta).
    and o.name not like '%.emptyFolderPlaceholder'
    and not exists (
      select 1 from reservas r
      where (o.bucket_id = 'comprobantes' and r.comprobante_url = o.name)
         or (o.bucket_id = 'apuntes' and o.name = any(r.apuntes))
    );
$$;

-- CREATE OR REPLACE conserva los permisos de 021, pero se repiten por las dudas.
revoke execute on function archivos_para_limpiar() from public, anon, authenticated;
grant execute on function archivos_para_limpiar() to service_role;

-- ---------------------------------------------------------------------
-- 2. enviar_telegram.
-- ---------------------------------------------------------------------
-- Lo mismo que hacen 018 y 019 por dentro: busca el token (Vault) y el
-- chat_id del profesor y deja el mensaje en la cola de pg_net.
-- Devuelve false si falta el token o el chat_id.
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
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'telegram_bot_token';

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

revoke execute on function enviar_telegram(smallint, text) from public, anon, authenticated;
-- Muy importante: si la página pudiera llamarla, cualquiera podría
-- mandarles mensajes a los profesores con el bot.

-- ---------------------------------------------------------------------
-- 3. recordar_limpieza.
-- ---------------------------------------------------------------------
-- Para probarla a mano: select recordar_limpieza(2::smallint);
-- Devuelve true si mandó el mensaje y false si no (no hay nada para
-- limpiar, o falta el token o el chat_id).
create or replace function recordar_limpieza(p_profesor_id smallint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservas integer;
  v_archivos integer;
  v_huerfanos integer;
  v_megas numeric;
  v_url text;
begin
  select count(*) into v_reservas from reservas_para_limpiar();

  -- count(*) filter (where ...): cuenta solo las filas que cumplen la
  -- condición, en la misma consulta que el total.
  -- sum(bytes) / 1048576.0: bytes → MB (1024 × 1024). El ".0" hace que
  -- la división tenga decimales. round(x, 1): redondea a 1 decimal.
  select count(*), count(*) filter (where reserva_id is null), round(coalesce(sum(bytes), 0) / 1048576.0, 1)
  into v_archivos, v_huerfanos, v_megas
  from archivos_para_limpiar();

  if v_reservas = 0 and v_archivos = 0 then
    return false;
  end if;

  select valor into v_url from ajustes where clave = 'url_panel';

  return enviar_telegram(
    p_profesor_id,
    'Recordatorio: limpieza de mitad de mes.' || chr(10) || chr(10) ||
    'Reservas con más de 30 días: ' || v_reservas || chr(10) ||
    'Archivos para borrar: ' || v_archivos ||
    ' (' || v_huerfanos || ' sueltos, sin reserva)' || chr(10) ||
    'Se liberan ' || v_megas || ' MB.' || chr(10) || chr(10) ||
    'Entrá a la pestaña Limpieza del panel.' ||
    coalesce(chr(10) || v_url, '')
  );
end;
$$;

revoke execute on function recordar_limpieza(smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. pg_cron: el día 15 de cada mes.
-- ---------------------------------------------------------------------
-- '0 16 15 * *' = minuto 0, hora 16 UTC (13:00 de Argentina), día 15 del
-- mes, todos los meses, cualquier día de la semana.
select cron.schedule(
  'recordatorio-limpieza-profesora',
  '0 16 15 * *',
  $$select public.recordar_limpieza(1::smallint)$$
);

select cron.schedule(
  'recordatorio-limpieza-profesor',
  '0 21 15 * *',
  $$select public.recordar_limpieza(2::smallint)$$
);
