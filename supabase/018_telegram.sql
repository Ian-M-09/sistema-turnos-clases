-- =====================================================================
-- 018: aviso por Telegram al profesor cuando llega una reserva (paso D1)
-- 1. pg_net: extensión de Supabase para hacer pedidos HTTP desde la base.
-- 2. telegram_profesores: el chat_id de cada profesor (tabla cerrada).
-- 3. ajustes: valores del sitio que no son secretos (la URL del panel).
-- 4. avisar_reserva_nueva: arma el mensaje y lo manda al crearse una
--    reserva (trigger diferido: corre cuando termina crear_reserva).
-- 5. cambiar_estado_reserva: no deja cancelar una clase ya dada (017).
--
-- El token del bot NO va en este archivo (el repo es público). Se guarda
-- una sola vez en Supabase Vault (secretos cifrados) corriendo a mano:
--   select vault.create_secret('ACÁ_EL_TOKEN', 'telegram_bot_token');
-- Para cambiarlo después:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'telegram_bot_token'),
--     'TOKEN_NUEVO');
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. pg_net.
-- ---------------------------------------------------------------------
-- pg_net manda los pedidos "en segundo plano": la función que lo llama no
-- espera la respuesta de Telegram, así crear_reserva no se hace más lenta.
-- El pedido recién sale cuando la transacción termina bien; si
-- crear_reserva falla y se deshace todo, el mensaje no se manda.
-- Si esta línea da error de permisos, activala desde el panel:
-- Database → Extensions → pg_net, y después corré este archivo de nuevo.
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 2. chat_id de cada profesor.
-- ---------------------------------------------------------------------
-- El chat_id es el número que identifica el chat de un profesor con el
-- bot. No es la contraseña del bot, pero con el token alcanzaría para
-- mandarle mensajes, así que no va en profesores (que es de lectura pública).
-- bigint: entero grande (los chat_id pueden pasar el máximo de integer).
create table if not exists telegram_profesores (
  profesor_id smallint primary key references profesores(id),
  chat_id bigint not null
);

-- RLS activado y SIN políticas: nadie la puede leer desde la página
-- (ni anon ni los profesores). Solo la usa la función de abajo.
-- Se carga a mano desde el Table Editor o el SQL Editor.
alter table telegram_profesores enable row level security;

-- ---------------------------------------------------------------------
-- 3. Ajustes del sitio.
-- ---------------------------------------------------------------------
-- Una tabla de "clave → valor" para datos del sitio que pueden cambiar
-- sin tocar el código. Por ahora solo la dirección del panel.
create table if not exists ajustes (
  clave text primary key,
  valor text not null
);

alter table ajustes enable row level security;
-- También cerrada: la usa solo la base.

-- ON CONFLICT DO NOTHING: si la fila ya existe (por ejemplo, porque ya se
-- cambió por la URL real), no la pisa.
-- Cuando el sitio esté publicado:
--   update ajustes set valor = 'https://el-sitio/admin' where clave = 'url_panel';
insert into ajustes (clave, valor)
values ('url_panel', 'http://localhost:3000/admin')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 4. El aviso.
-- ---------------------------------------------------------------------
-- RETURNS TRIGGER: es una función para un trigger. Postgres le pasa la
-- fila nueva en la variable NEW (acá, la reserva recién creada).
create or replace function avisar_reserva_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_chat_id bigint;
  v_url text;
  v_fecha date;
  v_desde time;
  v_hasta time;
  v_vence text;
  v_dias text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  -- text[]: una lista de textos. En Postgres las listas empiezan en 1.
  v_texto text;
begin
  -- BEGIN ... EXCEPTION adentro: si algo de esto falla (falta el token,
  -- Telegram no anda, etc.), NO se puede perder la reserva. Como el
  -- trigger corre justo antes de guardar todo, un error acá desharía la
  -- reserva entera. Con este bloque, el error se anota como aviso
  -- (warning) y la reserva se guarda igual.
  begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'telegram_bot_token';
    -- vault.decrypted_secrets: la vista de Vault que muestra los secretos
    -- descifrados. Solo la puede leer el dueño de la base (por eso la
    -- función es security definer).

    select chat_id into v_chat_id
    from telegram_profesores
    where profesor_id = new.profesor_id;

    -- Sin token o sin chat_id del profesor, no hay a quién mandarle nada.
    if v_token is null or v_chat_id is null then
      return null;
    end if;

    select valor into v_url from ajustes where clave = 'url_panel';

    -- El día y el rango de la clase. Las reservas son de un solo día, así
    -- que alcanza con el menor inicio y el mayor fin.
    select min(d.fecha), min(d.hora), max(d.hora + make_interval(mins => d.duracion_minutos))
    into v_fecha, v_desde, v_hasta
    from reserva_horarios rh
    join disponibilidad d on d.id = rh.disponibilidad_id
    where rh.reserva_id = new.id;

    -- Hasta qué hora tiene para confirmar: creado_en + 30 minutos (el
    -- mismo valor que en vencer_reservas_pendientes de 016), en hora de
    -- Argentina. to_char(..., 'HH24:MI') lo escribe como "14:35".
    v_vence := to_char(
      (new.creado_en + interval '30 minutes') at time zone 'America/Argentina/Buenos_Aires',
      'HH24:MI'
    );

    -- || une textos. chr(10) es el salto de línea.
    -- extract(isodow from fecha): 1 = lunes ... 7 = domingo (sirve de
    -- posición en la lista v_dias). Los nombres van a mano porque el
    -- servidor de Supabase escribe los días en inglés.
    -- coalesce(x, '?'): si algo vino vacío, pone "?" en vez de romper el texto.
    -- replace(to_char(monto, 'FM999,999,990'), ',', '.'): 15000 → "15.000".
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

    -- net.http_post: deja el pedido en la cola de pg_net y sigue.
    -- jsonb_build_object arma el JSON que espera Telegram:
    --   { "chat_id": 123, "text": "..." }
    -- Sin parse_mode: va como texto común, así un nombre con * o _ no
    -- rompe el formato.
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', v_chat_id, 'text', v_texto)
    );
    -- "url := ...": se le pasa cada valor por su nombre (más claro que
    -- por posición).
  exception when others then
    -- WHEN OTHERS: cualquier error. SQLERRM es el mensaje del error.
    raise warning 'No se pudo mandar el aviso de Telegram: %', sqlerrm;
  end;

  return null;
  -- En un trigger AFTER, lo que se devuelve no se usa: null alcanza.
end;
$$;

revoke execute on function avisar_reserva_nueva() from public, anon, authenticated;
-- Nadie la llama directo: la llama solo el trigger.

-- CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED: un trigger que,
-- en vez de correr en el momento del INSERT, espera al final de la
-- transacción. Hace falta porque crear_reserva primero inserta la
-- reserva y DESPUÉS sus horarios: si corriera en el INSERT, todavía no
-- sabría el día ni la hora de la clase.
-- FOR EACH ROW: una vez por cada reserva nueva.
drop trigger if exists avisar_reserva_nueva on reservas;
create constraint trigger avisar_reserva_nueva
  after insert on reservas
  deferrable initially deferred
  for each row
  execute function avisar_reserva_nueva();

-- ---------------------------------------------------------------------
-- 5. No cancelar una clase ya dada.
-- ---------------------------------------------------------------------
-- Es la función de 012 con un solo cambio: en "cancelar" se agrega el
-- chequeo de dada_en (marcado con "NUEVO EN 018").
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
  select id, estado, profesor_id, dada_en into v_reserva
  from reservas
  where id = p_reserva_id
  for update;

  if not found or v_reserva.profesor_id is distinct from mi_profesor_id() then
    raise exception 'No se encontró la reserva.';
  end if;

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
    if v_reserva.estado <> 'confirmado' then
      raise exception 'Solo se puede cancelar una reserva confirmada.';
    end if;

    -- NUEVO EN 018: una clase marcada como dada ya pasó; cancelarla
    -- liberaría lugares de un horario viejo. Primero hay que desmarcarla.
    if v_reserva.dada_en is not null then
      raise exception 'Esta clase está marcada como dada: no se puede cancelar.';
    end if;

    select min((d.fecha + d.hora) at time zone 'America/Argentina/Buenos_Aires')
    into v_inicio
    from reserva_horarios rh
    join disponibilidad d on d.id = rh.disponibilidad_id
    where rh.reserva_id = p_reserva_id;

    v_devolucion := coalesce(v_inicio - now() > interval '24 hours', false);

    update reservas
    set estado = 'cancelado', cancelado_en = now(), devolucion = v_devolucion
    where id = p_reserva_id;
  else
    raise exception 'Acción no válida.';
  end if;

  update disponibilidad
  set cupo_ocupado = cupo_ocupado - 1
  where id in (select disponibilidad_id from reserva_horarios where reserva_id = p_reserva_id);

  return v_devolucion;
end;
$$;

revoke execute on function cambiar_estado_reserva(uuid, text) from public;
grant execute on function cambiar_estado_reserva(uuid, text) to authenticated;
