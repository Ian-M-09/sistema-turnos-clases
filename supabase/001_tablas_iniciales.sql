-- =====================================================================
-- 001: creación de las tablas iniciales (disponibilidad, turnos, chats)
-- Reconstruido el 22/10/2026 a partir de la base real (A0 del plan).
-- La columna duracion_minutos NO está acá: se agregó después (ver 002).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla disponibilidad: cada fila es un horario que cargó la profesora.
-- ---------------------------------------------------------------------
-- CREATE TABLE: crea una tabla nueva. Si ya existe, da error (eso está bien:
-- avisa que estás corriendo el script sobre una base que ya lo tiene).
create table disponibilidad (
  -- uuid: identificador único universal (ej: 3f2a9c1e-...), difícil de adivinar.
  -- PRIMARY KEY: identifica cada fila; no se repite y no puede ser null.
  -- DEFAULT gen_random_uuid(): si no mandás un id, Postgres genera uno solo.
  id uuid primary key default gen_random_uuid(),

  -- date: solo la fecha (2026-10-22), sin hora.
  -- NOT NULL: la columna es obligatoria, no puede quedar vacía.
  fecha date not null,

  -- time: solo la hora (14:00:00), sin fecha ni zona horaria.
  hora time not null,

  -- integer: número entero. Si no se manda nada, vale 5.
  cupo_maximo integer not null default 5,

  -- Cuántos lugares ya se ocuparon. Arranca en 0.
  cupo_ocupado integer not null default 0,

  -- UNIQUE (fecha, hora): no puede haber dos filas con la misma fecha Y la
  -- misma hora juntas. Postgres lo llama disponibilidad_fecha_hora_key.
  unique (fecha, hora),

  -- CHECK: una condición que toda fila tiene que cumplir; si no, la base
  -- rechaza el insert o el update. Acá: los ocupados nunca son negativos
  -- ni pasan el máximo. Como usa dos columnas, va al final, separado
  -- (restricción "de tabla"), y Postgres lo llama disponibilidad_check.
  check (cupo_ocupado >= 0 and cupo_ocupado <= cupo_maximo)
);

-- ---------------------------------------------------------------------
-- Tabla turnos: cada fila es una reserva de un alumno.
-- (Su diseño se revisa en el paso A1 por las reservas de varias horas.)
-- ---------------------------------------------------------------------
create table turnos (
  id uuid primary key default gen_random_uuid(),

  -- REFERENCES disponibilidad(id): clave foránea (foreign key). El valor
  -- tiene que existir como id en disponibilidad. Sin "on delete", Postgres
  -- NO deja borrar un horario que tenga turnos (protege los datos).
  -- Postgres la llama turnos_disponibilidad_id_fkey.
  disponibilidad_id uuid not null references disponibilidad(id),

  -- text: texto de cualquier largo.
  nombre text not null,
  apellido text not null,
  telefono text not null,   -- text y no número: así no se pierden ceros a la izquierda
  materia text not null,

  -- Sin NOT NULL: estas columnas son opcionales (pueden quedar en null).
  anio_cursando text,
  notas text,
  archivo_url text,

  -- El comprobante es obligatorio.
  comprobante_url text not null,

  -- CHECK ... IN (...): el estado solo puede ser uno de estos tres valores.
  -- Arranca en 'pendiente_pago'. Postgres lo llama turnos_estado_check.
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'confirmado', 'rechazado')),

  -- timestamptz (timestamp with time zone): fecha y hora exactas con zona
  -- horaria. now() es el momento en que se inserta la fila.
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tabla chats: un chat con la IA por reserva (fase E).
-- ---------------------------------------------------------------------
create table chats (
  id uuid primary key default gen_random_uuid(),

  -- ON DELETE CASCADE: si se borra el turno, su chat se borra solo
  -- ("en cascada"). Postgres la llama chats_turno_id_fkey.
  turno_id uuid not null references turnos(id) on delete cascade,

  -- jsonb: guarda JSON (listas y objetos) en formato binario, consultable.
  -- '[]'::jsonb es una lista vacía; "::" convierte el texto '[]' a jsonb.
  historial jsonb not null default '[]'::jsonb,

  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS (Row Level Security, seguridad por fila).
-- ---------------------------------------------------------------------
-- ALTER TABLE: modifica una tabla existente.
-- ENABLE ROW LEVEL SECURITY: con esto activado, el rol anon (el navegador
-- con la clave pública) NO puede leer ni escribir NADA en la tabla salvo
-- que una política (CREATE POLICY) lo permita. turnos y chats quedan
-- cerradas a propósito; disponibilidad se abre para lectura en 003.
alter table disponibilidad enable row level security;
alter table turnos enable row level security;
alter table chats enable row level security;
