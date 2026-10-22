-- =====================================================================
-- 006: función crear_reserva (paso A2 del plan)
-- El navegador NO inserta directo en las tablas (siguen cerradas por RLS):
-- llama a esta función, que valida todo, ocupa los lugares y crea la
-- reserva. Si algo falla en cualquier punto, no queda nada guardado
-- (todo o nada).
-- Desde JavaScript (paso A4) se llama así:
--   supabase.rpc("crear_reserva", { p_horarios: [...], p_nombre: ..., ... })
-- =====================================================================

-- CREATE OR REPLACE FUNCTION: crea la función, o la reemplaza si ya
-- existe (así se puede corregir y volver a correr este archivo).
-- Los parámetros llevan "p_" adelante para no confundirlos con las
-- columnas de las tablas (por ejemplo p_nombre vs. la columna nombre).
create or replace function crear_reserva(
  p_horarios uuid[],          -- uuid[]: una lista de ids de disponibilidad
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_materia text,
  p_anio_cursando text,       -- opcional (puede venir null)
  p_notas text,               -- opcional
  p_archivo_url text,         -- opcional
  p_comprobante_url text
)
-- RETURNS uuid: devuelve el id de la reserva creada.
returns uuid
-- LANGUAGE plpgsql: el lenguaje de programación de Postgres (tiene
-- variables, if, loops). SQL solo no alcanza para tantas validaciones.
language plpgsql
-- SECURITY DEFINER: la función corre con los permisos de quien la CREÓ
-- (vos, el dueño de las tablas) y no con los de quien la llama (anon).
-- Por eso puede escribir en reservas aunque anon no tenga permiso: anon
-- solo puede hacer lo que esta función le deja hacer.
security definer
-- SET search_path = public: fija en qué esquema busca las tablas. Es una
-- protección obligatoria con security definer (si no, alguien podría
-- crear una tabla "disponibilidad" falsa en otro esquema y engañarla).
set search_path = public
-- $$ ... $$: marca dónde empieza y termina el código de la función
-- (es como unas comillas que permiten usar comillas simples adentro).
as $$
-- DECLARE: acá se declaran las variables que usa la función. Llevan "v_".
declare
  v_horario record;            -- record: una fila completa (con sus columnas)
  v_cantidad integer := 0;     -- := asigna un valor inicial
  v_fecha date;                -- el día de la reserva (el del primer horario)
  v_fin time;                  -- a qué hora termina el horario anterior
  v_anterior_era_media boolean := false;
  v_minutos integer := 0;      -- duración total de la reserva
  v_deposito numeric(10, 2);
  v_reserva_id uuid;
-- BEGIN ... END: el cuerpo de la función.
begin
  -- -------------------------------------------------------------------
  -- 1. Validar los datos del alumno.
  -- -------------------------------------------------------------------
  -- cardinality(lista): cuántos elementos tiene la lista.
  -- RAISE EXCEPTION 'mensaje': corta la función con un error y DESHACE
  -- todo lo que se haya hecho. En JavaScript llega en error.message.
  if p_horarios is null or cardinality(p_horarios) = 0 then
    raise exception 'Elegí al menos un horario.';
  end if;

  -- unnest(lista): convierte la lista en filas, para poder contarlas.
  -- count(distinct x): cuenta los valores sin repetir. Si da menos que
  -- el total, es que vino un horario repetido.
  if (select count(distinct x) from unnest(p_horarios) as x) <> cardinality(p_horarios) then
    raise exception 'Hay un horario repetido.';
  end if;

  -- trim(texto): saca los espacios del principio y del final.
  -- coalesce(a, b): devuelve a, o b si a es null. Así un null cuenta
  -- como vacío.
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'Faltan el nombre o el apellido.';
  end if;

  -- !~ significa "NO coincide con el patrón" (expresión regular).
  -- '^[0-9]{10}$': de principio (^) a fin ($), exactamente 10 dígitos.
  if p_telefono is null or p_telefono !~ '^[0-9]{10}$' then
    raise exception 'El teléfono tiene que tener 10 dígitos.';
  end if;

  -- La misma lista que FormularioAlumno.js. Si se agrega una materia,
  -- hay que agregarla en los dos lugares.
  if p_materia is null or p_materia not in (
    'Lengua', 'Matemática', 'Preparación Global 5to (BHM)', 'Inglés',
    'Latín', 'Griego', 'Dibujo', 'Apoyo con tareas'
  ) then
    raise exception 'La materia no es válida.';
  end if;

  if coalesce(trim(p_comprobante_url), '') = '' then
    raise exception 'Falta el comprobante.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Recorrer los horarios en orden, bloqueándolos y validándolos.
  -- -------------------------------------------------------------------
  -- FOR fila IN consulta LOOP ... END LOOP: repite el bloque por cada
  -- fila que devuelve la consulta.
  -- = any(lista): "es igual a alguno de la lista".
  -- FOR UPDATE: BLOQUEA esas filas hasta que termine la función. Si otro
  -- alumno está reservando el mismo horario al mismo tiempo, su función
  -- espera acá a que termine la nuestra, y recién ahí ve el cupo ya
  -- actualizado. Así dos personas no pueden quedarse con el último lugar.
  -- ORDER BY fecha, hora: además de servir para validar que sean
  -- seguidos, bloquear siempre en el mismo orden evita que dos reservas
  -- se queden esperándose una a la otra para siempre (deadlock).
  for v_horario in
    select id, fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos
    from disponibilidad
    where id = any(p_horarios)
    order by fecha, hora
    for update
  loop
    v_cantidad := v_cantidad + 1;

    if v_cantidad = 1 then
      -- Primer horario: fija el día y valida el inicio.
      v_fecha := v_horario.fecha;

      -- <> significa "distinto de". Una media hora nunca puede ser el
      -- inicio, y así también se cumple el mínimo de 1 hora por reserva.
      if v_horario.duracion_minutos <> 60 then
        raise exception 'La reserva tiene que empezar con un horario de 1 hora.';
      end if;

      -- fecha + hora da un timestamp sin zona ("2026-10-24 14:00").
      -- AT TIME ZONE 'America/Argentina/Buenos_Aires' le dice a Postgres
      -- que esa hora es de Argentina (el servidor de Supabase usa otra).
      -- now(): el momento actual. interval '24 hours': un lapso de 24 hs.
      if (v_horario.fecha + v_horario.hora) at time zone 'America/Argentina/Buenos_Aires'
         < now() + interval '24 hours' then
        raise exception 'Las reservas se hacen con al menos 24 horas de anticipación.';
      end if;
    else
      -- Del segundo horario en adelante: tiene que seguir al anterior.
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
      -- % dentro del mensaje se reemplaza por el valor que va después.
      -- to_char(hora, 'HH24:MI') la escribe como "14:00".
      raise exception 'Ya no queda lugar en el horario de las %. Elegí otro horario.',
        to_char(v_horario.hora, 'HH24:MI');
    end if;

    -- make_interval(mins => n): un lapso de n minutos. Sumado a la hora
    -- da a qué hora termina este horario (14:00 + 60 min = 15:00).
    v_fin := v_horario.hora + make_interval(mins => v_horario.duracion_minutos);
    v_anterior_era_media := v_horario.duracion_minutos = 30;
    v_minutos := v_minutos + v_horario.duracion_minutos;
  end loop;

  -- Si la consulta trajo menos filas que ids recibidos, alguno no existe
  -- (por ejemplo, la profesora lo borró mientras el alumno elegía).
  if v_cantidad <> cardinality(p_horarios) then
    raise exception 'Alguno de los horarios ya no existe. Volvé a elegir.';
  end if;

  -- -------------------------------------------------------------------
  -- 3. Ocupar los lugares y guardar la reserva.
  -- -------------------------------------------------------------------
  -- SELECT ... INTO variable: guarda el resultado en la variable.
  select deposito_por_hora into v_deposito from configuracion where id = 1;

  -- UPDATE tabla SET columna = valor WHERE condición: modifica filas.
  -- Suma 1 lugar ocupado en cada horario de la reserva.
  update disponibilidad
  set cupo_ocupado = cupo_ocupado + 1
  where id = any(p_horarios);

  -- nullif(a, ''): devuelve null si a es un texto vacío. Así los campos
  -- opcionales que llegan vacíos se guardan como null.
  -- round(): redondea al entero, igual que Math.round en la pantalla.
  -- RETURNING id INTO v_reserva_id: devuelve el id que generó Postgres
  -- y lo guarda en la variable.
  insert into reservas (
    nombre, apellido, telefono, materia, anio_cursando, notas,
    archivo_url, comprobante_url, monto
  )
  values (
    trim(p_nombre), trim(p_apellido), p_telefono, p_materia,
    nullif(trim(p_anio_cursando), ''), nullif(trim(p_notas), ''),
    nullif(trim(p_archivo_url), ''), trim(p_comprobante_url),
    round(v_deposito * v_minutos / 60)
  )
  returning id into v_reserva_id;

  -- INSERT ... SELECT: inserta una fila por cada fila que devuelve el
  -- SELECT. unnest convierte la lista de horarios en filas.
  insert into reserva_horarios (reserva_id, disponibilidad_id)
  select v_reserva_id, unnest(p_horarios);

  return v_reserva_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos: quién puede ejecutar la función.
-- ---------------------------------------------------------------------
-- Postgres deja ejecutar cualquier función nueva a todos (public).
-- REVOKE quita ese permiso y GRANT se lo da solo a anon (el navegador).
-- Hay que escribir los tipos de los parámetros porque podría haber otra
-- función con el mismo nombre y otros parámetros.
revoke execute on function crear_reserva(uuid[], text, text, text, text, text, text, text, text) from public;
grant execute on function crear_reserva(uuid[], text, text, text, text, text, text, text, text) to anon;
