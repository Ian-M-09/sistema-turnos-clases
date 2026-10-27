-- =====================================================================
-- 008: varios archivos de apuntes y verificación de archivos (A3/A2)
-- 1. reservas pasa a guardar una LISTA de apuntes en vez de uno solo.
-- 2. crear_reserva ahora comprueba que el comprobante y los apuntes
--    estén subidos de verdad en Storage (007), que no se usen en otra
--    reserva y que los apuntes sumen como máximo 3 MB.
-- En las columnas se guarda el NOMBRE del archivo dentro de su bucket
-- (por ejemplo "3f2b9c1e-....pdf"), no una URL: los buckets son
-- privados y la profesora va a pedir una URL firmada cuando lo abra.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cambios en la tabla reservas.
-- ---------------------------------------------------------------------
-- ALTER TABLE ... ADD COLUMN: agrega una columna a una tabla existente.
-- text[]: una lista de textos (los [] indican "lista de").
-- default '{}': si no se manda nada, queda una lista vacía ('{}' es
-- como se escribe una lista vacía en Postgres).
-- IF NOT EXISTS: si la columna ya existe, no da error.
alter table reservas
  add column if not exists apuntes text[] not null default '{}';

-- Pasa los datos de la columna vieja a la nueva y la borra. Se hace con
-- un bloque DO para poder preguntar primero si la columna vieja existe
-- (así el archivo se puede volver a correr).
-- DO $$ ... $$: ejecuta un bloque de plpgsql una sola vez, sin crear
-- una función.
-- information_schema.columns: tabla del sistema que lista todas las
-- columnas de todas las tablas.
-- EXISTS (consulta): da true si la consulta devuelve al menos una fila.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reservas' and column_name = 'archivo_url'
  ) then
    -- array[x]: arma una lista con un solo elemento.
    update reservas set apuntes = array[archivo_url] where archivo_url is not null;
    alter table reservas drop column archivo_url;
  end if;
end;
$$;

-- UNIQUE: dos reservas no pueden usar el mismo comprobante. Aunque dos
-- funciones corran a la vez con el mismo archivo, Postgres deja pasar
-- solo una. DROP CONSTRAINT IF EXISTS es para poder volver a correrlo.
alter table reservas drop constraint if exists reservas_comprobante_url_key;
alter table reservas add constraint reservas_comprobante_url_key unique (comprobante_url);

-- ---------------------------------------------------------------------
-- 2. Nueva versión de crear_reserva.
-- ---------------------------------------------------------------------
-- Cambian los parámetros (p_archivo_url text pasa a ser p_apuntes
-- text[]), y para Postgres eso es OTRA función. Por eso hay que borrar
-- la vieja: si no, quedarían las dos.
drop function if exists crear_reserva(uuid[], text, text, text, text, text, text, text, text);

create or replace function crear_reserva(
  p_horarios uuid[],
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_materia text,
  p_anio_cursando text,       -- opcional
  p_notas text,               -- opcional
  p_apuntes text[],           -- opcional: nombres de archivos en el bucket apuntes
  p_comprobante_url text      -- nombre del archivo en el bucket comprobantes
)
returns uuid
language plpgsql
security definer
-- El search_path sigue siendo solo public. Para leer la lista de
-- archivos subidos se escribe el nombre completo "storage.objects"
-- (esquema.tabla), así no hace falta agregar storage al search_path.
set search_path = public
as $$
declare
  v_horario record;
  v_cantidad integer := 0;
  v_fecha date;
  v_fin time;
  v_anterior_era_media boolean := false;
  v_minutos integer := 0;
  v_deposito numeric(10, 2);
  v_reserva_id uuid;
  v_apuntes text[];            -- p_apuntes sin nulls (o lista vacía)
  v_encontrados integer;       -- cuántos apuntes existen en Storage
  v_bytes bigint;              -- bigint: entero grande (los bytes pueden pasar de 2 mil millones)
begin
  -- -------------------------------------------------------------------
  -- 1. Validar los datos del alumno (igual que en 006).
  -- -------------------------------------------------------------------
  if p_horarios is null or cardinality(p_horarios) = 0 then
    raise exception 'Elegí al menos un horario.';
  end if;

  if (select count(distinct x) from unnest(p_horarios) as x) <> cardinality(p_horarios) then
    raise exception 'Hay un horario repetido.';
  end if;

  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'Faltan el nombre o el apellido.';
  end if;

  if p_telefono is null or p_telefono !~ '^[0-9]{10}$' then
    raise exception 'El teléfono tiene que tener 10 dígitos.';
  end if;

  if p_materia is null or p_materia not in (
    'Lengua', 'Matemática', 'Preparación Global 5to (BHM)', 'Inglés',
    'Latín', 'Griego', 'Dibujo', 'Apoyo con tareas'
  ) then
    raise exception 'La materia no es válida.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Validar los archivos (nuevo en 008).
  -- -------------------------------------------------------------------
  if coalesce(trim(p_comprobante_url), '') = '' then
    raise exception 'Falta el comprobante.';
  end if;

  -- storage.objects: una fila por cada archivo subido. bucket_id dice en
  -- qué bucket está y name es su nombre. NOT EXISTS da true si la
  -- consulta no devuelve ninguna fila, o sea, si el archivo no está.
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'comprobantes' and name = p_comprobante_url
  ) then
    raise exception 'No se encontró el comprobante. Volvé a subirlo.';
  end if;

  if exists (select 1 from reservas where comprobante_url = p_comprobante_url) then
    raise exception 'Ese comprobante ya se usó en otra reserva.';
  end if;

  -- array_remove(lista, null): saca los null de la lista.
  -- coalesce(..., '{}'): si p_apuntes vino null, usa una lista vacía.
  v_apuntes := coalesce(array_remove(p_apuntes, null), '{}');

  if cardinality(v_apuntes) > 0 then
    if (select count(distinct x) from unnest(v_apuntes) as x) <> cardinality(v_apuntes) then
      raise exception 'Hay un archivo de apuntes repetido.';
    end if;

    -- metadata: columna jsonb de storage.objects con datos del archivo.
    -- metadata->>'size': saca el campo "size" (el tamaño en bytes) como
    -- texto, y ::bigint lo convierte en número.
    -- sum(...): suma los tamaños. count(*): cuenta las filas.
    -- SELECT a, b INTO x, y: guarda los dos resultados en dos variables.
    select count(*), coalesce(sum((metadata->>'size')::bigint), 0)
    into v_encontrados, v_bytes
    from storage.objects
    where bucket_id = 'apuntes' and name = any(v_apuntes);

    if v_encontrados <> cardinality(v_apuntes) then
      raise exception 'No se encontró alguno de los apuntes. Volvé a subirlos.';
    end if;

    -- 3 * 1024 * 1024 = 3 MB, el máximo entre TODOS los apuntes.
    if v_bytes > 3 * 1024 * 1024 then
      raise exception 'Los apuntes no pueden sumar más de 3 MB.';
    end if;

    -- && significa "tienen algún elemento en común" (entre dos listas).
    if exists (select 1 from reservas where apuntes && v_apuntes) then
      raise exception 'Alguno de los apuntes ya se usó en otra reserva.';
    end if;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Recorrer los horarios en orden, bloqueándolos y validándolos
  --    (igual que en 006; ahí están explicados FOR UPDATE y el orden).
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

      if (v_horario.fecha + v_horario.hora) at time zone 'America/Argentina/Buenos_Aires'
         < now() + interval '24 hours' then
        raise exception 'Las reservas se hacen con al menos 24 horas de anticipación.';
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
  -- 4. Ocupar los lugares y guardar la reserva (igual que en 006, pero
  --    con la lista de apuntes).
  -- -------------------------------------------------------------------
  select deposito_por_hora into v_deposito from configuracion where id = 1;

  update disponibilidad
  set cupo_ocupado = cupo_ocupado + 1
  where id = any(p_horarios);

  insert into reservas (
    nombre, apellido, telefono, materia, anio_cursando, notas,
    apuntes, comprobante_url, monto
  )
  values (
    trim(p_nombre), trim(p_apellido), p_telefono, p_materia,
    nullif(trim(p_anio_cursando), ''), nullif(trim(p_notas), ''),
    v_apuntes, trim(p_comprobante_url),
    round(v_deposito * v_minutos / 60)
  )
  returning id into v_reserva_id;

  insert into reserva_horarios (reserva_id, disponibilidad_id)
  select v_reserva_id, unnest(p_horarios);

  return v_reserva_id;
end;
$$;

-- Permisos (igual que en 006, con el nuevo tipo text[] en los apuntes).
revoke execute on function crear_reserva(uuid[], text, text, text, text, text, text, text[], text) from public;
grant execute on function crear_reserva(uuid[], text, text, text, text, text, text, text[], text) to anon;
