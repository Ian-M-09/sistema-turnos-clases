-- =====================================================================
-- 009: dos profesores y alumnos registrados
-- 1. profesores: una fila por profesor, con su precio, su cuenta y el
--    color de la página (reemplaza a la tabla configuracion de 005).
-- 2. materias: qué profesor da cada materia (así la página sabe qué
--    color y qué cuenta mostrar, y la reserva sabe a quién le llega).
-- 3. alumnos: los registran los profesores (DNI, nombre, apellido y
--    teléfono). Solo un alumno registrado y no bloqueado puede reservar.
-- 4. reservas guarda el alumno y el profesor.
-- 5. verificar_alumno: la página pregunta por un DNI.
-- 6. crear_reserva nueva: recibe el DNI en vez de nombre y teléfono.
-- Horarios y cupos NO cambian: los dos profesores comparten la misma
-- disponibilidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla profesores.
-- ---------------------------------------------------------------------
-- smallint: entero chico (alcanza de sobra para 1, 2, 3...).
-- tema: el color de la página cuando se elige una materia de este
-- profesor. La lista de colores posibles está en src/app/globals.css.
create table if not exists profesores (
  id smallint primary key,
  nombre text not null,
  tema text not null check (tema in ('rosa', 'azul')),
  deposito_por_hora numeric(10, 2) not null check (deposito_por_hora > 0),
  cbu text not null,
  alias text not null,
  titular text not null
);

-- La profesora (id 1) se lleva los datos que ya estaban en configuracion.
-- Va en un bloque DO porque configuracion se borra más abajo: si el
-- archivo se vuelve a correr, la tabla ya no existe y el INSERT daría error.
-- to_regclass('nombre'): da null si esa tabla no existe.
-- INSERT ... SELECT: inserta las filas que devuelve la consulta.
-- ON CONFLICT DO NOTHING: si la fila ya existe, no hace nada.
do $$
begin
  if to_regclass('public.configuracion') is not null then
    insert into profesores (id, nombre, tema, deposito_por_hora, cbu, alias, titular)
    select 1, 'Profesora', 'rosa', deposito_por_hora, cbu, alias, titular
    from configuracion
    where id = 1
    on conflict (id) do nothing;
  end if;
end;
$$;

-- Si configuracion no existía (base nueva), la crea con datos de prueba.
insert into profesores (id, nombre, tema, deposito_por_hora, cbu, alias, titular)
values (1, 'Profesora', 'rosa', 15000, '0000000000000000000000', 'alias.de.prueba', 'Nombre de Prueba')
on conflict (id) do nothing;

-- El profesor (id 2), con datos INVENTADOS: los reales se cargan después
-- en el Table Editor (igual que en 005, no se suben al repo).
insert into profesores (id, nombre, tema, deposito_por_hora, cbu, alias, titular)
values (2, 'Profesor', 'azul', 15000, '1111111111111111111111', 'alias.del.profesor', 'Nombre del Profesor')
on conflict (id) do nothing;

alter table profesores enable row level security;

-- La pantalla del comprobante necesita leer el precio y la cuenta.
-- Ojo: anon puede leer TODAS las columnas. Si más adelante se agrega
-- algo privado (por ejemplo un email), no va en esta tabla.
drop policy if exists "Lectura pública de profesores" on profesores;
create policy "Lectura pública de profesores"
  on profesores for select to anon using (true);

-- configuracion ya no se usa: sus datos quedaron en profesores (id 1).
drop table if exists configuracion;

-- ---------------------------------------------------------------------
-- 2. Tabla materias.
-- ---------------------------------------------------------------------
-- references profesores(id): cada materia apunta a un profesor que
-- exista. orden: en qué orden se muestran en la lista de la página.
create table if not exists materias (
  nombre text primary key,
  profesor_id smallint not null references profesores(id),
  orden smallint not null
);

-- ON CONFLICT (nombre) DO UPDATE: si la materia ya existe, le actualiza
-- el profesor y el orden (así este archivo se puede volver a correr).
-- Matemática pasa a ser del profesor.
insert into materias (nombre, profesor_id, orden) values
  ('Lengua', 1, 1),
  ('Preparación Global 5to (BHM)', 1, 2),
  ('Inglés', 1, 3),
  ('Latín', 1, 4),
  ('Griego', 1, 5),
  ('Dibujo', 1, 6),
  ('Apoyo con tareas', 1, 7),
  ('Matemática', 2, 8),
  ('Álgebra', 2, 9),
  ('Programación', 2, 10),
  ('Economía', 2, 11)
on conflict (nombre) do update set
  profesor_id = excluded.profesor_id,
  orden = excluded.orden;

alter table materias enable row level security;

drop policy if exists "Lectura pública de materias" on materias;
create policy "Lectura pública de materias"
  on materias for select to anon using (true);

-- ---------------------------------------------------------------------
-- 3. Tabla alumnos (CERRADA: sin políticas, anon no la puede leer).
-- ---------------------------------------------------------------------
-- dni: 7 u 8 dígitos, como text (igual que el teléfono). UNIQUE: no
-- puede haber dos alumnos con el mismo DNI.
-- bloqueado: si es true, al alumno todos los horarios le aparecen sin
-- lugar y crear_reserva no lo deja reservar.
-- Por ahora se registran a mano en el Table Editor; en la Fase C los
-- profesores lo van a hacer desde el panel.
create table if not exists alumnos (
  id uuid primary key default gen_random_uuid(),
  dni text not null unique check (dni ~ '^[0-9]{7,8}$'),
  nombre text not null,
  apellido text not null,
  telefono text not null check (telefono ~ '^[0-9]{10}$'),
  bloqueado boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table alumnos enable row level security;

-- ---------------------------------------------------------------------
-- 4. Columnas nuevas en reservas.
-- ---------------------------------------------------------------------
-- alumno_id: quién reservó. Puede quedar null solo en las reservas de
-- prueba viejas (de antes de que existieran los alumnos).
-- nombre, apellido y telefono se siguen guardando en la reserva: son una
-- "foto" de los datos al momento de reservar (si el alumno cambia de
-- teléfono, las reservas viejas no cambian).
alter table reservas
  add column if not exists alumno_id uuid references alumnos(id),
  add column if not exists profesor_id smallint references profesores(id);

-- A las reservas viejas les pone el profesor según su materia, y la
-- profesora (1) si la materia no está en la lista.
update reservas r
set profesor_id = coalesce(
  (select m.profesor_id from materias m where m.nombre = r.materia), 1
)
where profesor_id is null;

-- SET NOT NULL: de ahora en más toda reserva tiene profesor.
alter table reservas alter column profesor_id set not null;

-- ---------------------------------------------------------------------
-- 5. verificar_alumno: la página manda un DNI y recibe si puede reservar.
-- ---------------------------------------------------------------------
-- Devuelve SOLO el nombre (para el "Hola, Juan") y "habilitado". NUNCA
-- el apellido ni el teléfono: cualquiera podría probar DNIs al azar y
-- juntar teléfonos de alumnos menores.
-- returns json: devuelve un objeto como {"nombre": "Juan", "habilitado": true},
-- o null si el DNI no está registrado.
-- "habilitado" es false si está bloqueado; la página entonces le muestra
-- todo sin lugar (no le dice "estás bloqueado").
create or replace function verificar_alumno(p_dni text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno record;
begin
  select nombre, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni);

  -- FOUND: variable automática de plpgsql; es false si el SELECT ... INTO
  -- no encontró ninguna fila.
  if not found then
    return null;
  end if;

  -- json_build_object('clave', valor, ...): arma el objeto JSON.
  return json_build_object('nombre', v_alumno.nombre, 'habilitado', not v_alumno.bloqueado);
end;
$$;

revoke execute on function verificar_alumno(text) from public;
grant execute on function verificar_alumno(text) to anon;

-- ---------------------------------------------------------------------
-- 6. Nueva versión de crear_reserva.
-- ---------------------------------------------------------------------
-- Cambian los parámetros (sale nombre, apellido y teléfono; entra el
-- DNI), así que hay que borrar la de 008.
drop function if exists crear_reserva(uuid[], text, text, text, text, text, text, text[], text);

create or replace function crear_reserva(
  p_horarios uuid[],
  p_dni text,
  p_materia text,
  p_anio_cursando text,       -- opcional
  p_notas text,               -- opcional
  p_apuntes text[],           -- opcional: nombres de archivos en el bucket apuntes
  p_comprobante_url text      -- nombre del archivo en el bucket comprobantes
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno record;
  v_profesor_id smallint;
  v_horario record;
  v_cantidad integer := 0;
  v_fecha date;
  v_fin time;
  v_anterior_era_media boolean := false;
  v_minutos integer := 0;
  v_deposito numeric(10, 2);
  v_reserva_id uuid;
  v_apuntes text[];
  v_encontrados integer;
  v_bytes bigint;
begin
  -- -------------------------------------------------------------------
  -- 1. El alumno y la materia (nuevo en 009).
  -- -------------------------------------------------------------------
  if p_horarios is null or cardinality(p_horarios) = 0 then
    raise exception 'Elegí al menos un horario.';
  end if;

  if (select count(distinct x) from unnest(p_horarios) as x) <> cardinality(p_horarios) then
    raise exception 'Hay un horario repetido.';
  end if;

  select id, nombre, apellido, telefono, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni);

  if not found then
    raise exception 'Ese DNI no está registrado. Pedile a tu profesor que te registre.';
  end if;

  -- Un alumno bloqueado recibe el mismo mensaje que cuando no hay lugar
  -- (la página tampoco le dice que está bloqueado).
  if v_alumno.bloqueado then
    raise exception 'Ya no queda lugar en los horarios elegidos. Elegí otro horario.';
  end if;

  -- La materia tiene que estar en la tabla materias, y de ahí sale el
  -- profesor que va a recibir y confirmar la reserva.
  select profesor_id into v_profesor_id
  from materias
  where nombre = p_materia;

  if not found then
    raise exception 'La materia no es válida.';
  end if;

  -- -------------------------------------------------------------------
  -- 2. Los archivos (igual que en 008).
  -- -------------------------------------------------------------------
  if coalesce(trim(p_comprobante_url), '') = '' then
    raise exception 'Falta el comprobante.';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'comprobantes' and name = p_comprobante_url
  ) then
    raise exception 'No se encontró el comprobante. Volvé a subirlo.';
  end if;

  if exists (select 1 from reservas where comprobante_url = p_comprobante_url) then
    raise exception 'Ese comprobante ya se usó en otra reserva.';
  end if;

  v_apuntes := coalesce(array_remove(p_apuntes, null), '{}');

  if cardinality(v_apuntes) > 0 then
    if (select count(distinct x) from unnest(v_apuntes) as x) <> cardinality(v_apuntes) then
      raise exception 'Hay un archivo de apuntes repetido.';
    end if;

    select count(*), coalesce(sum((metadata->>'size')::bigint), 0)
    into v_encontrados, v_bytes
    from storage.objects
    where bucket_id = 'apuntes' and name = any(v_apuntes);

    if v_encontrados <> cardinality(v_apuntes) then
      raise exception 'No se encontró alguno de los apuntes. Volvé a subirlos.';
    end if;

    if v_bytes > 3 * 1024 * 1024 then
      raise exception 'Los apuntes no pueden sumar más de 3 MB.';
    end if;

    if exists (select 1 from reservas where apuntes && v_apuntes) then
      raise exception 'Alguno de los apuntes ya se usó en otra reserva.';
    end if;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Los horarios (igual que en 006 y 008).
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
  -- 4. Guardar. El precio sale del profesor de la materia (nuevo en 009).
  -- -------------------------------------------------------------------
  select deposito_por_hora into v_deposito from profesores where id = v_profesor_id;

  update disponibilidad
  set cupo_ocupado = cupo_ocupado + 1
  where id = any(p_horarios);

  insert into reservas (
    alumno_id, profesor_id, nombre, apellido, telefono, materia,
    anio_cursando, notas, apuntes, comprobante_url, monto
  )
  values (
    v_alumno.id, v_profesor_id, v_alumno.nombre, v_alumno.apellido, v_alumno.telefono, p_materia,
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

revoke execute on function crear_reserva(uuid[], text, text, text, text, text[], text) from public;
grant execute on function crear_reserva(uuid[], text, text, text, text, text[], text) to anon;
