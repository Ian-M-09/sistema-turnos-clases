-- =====================================================================
-- 004: reemplaza turnos por reservas + reserva_horarios (paso A1 del plan)
-- Una reserva puede usar varios horarios seguidos del mismo día, así que
-- los datos del alumno van una sola vez en reservas y la tabla
-- reserva_horarios dice qué horarios de disponibilidad usa cada una.
-- turnos y chats no tenían datos reales, por eso se borran y se recrean.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Borrar las tablas viejas.
-- ---------------------------------------------------------------------
-- DROP TABLE: borra la tabla con todas sus filas. No se puede deshacer.
-- IF EXISTS: si la tabla no existe, no da error (sigue de largo).
-- chats va primero porque apunta a turnos: mientras chats exista,
-- Postgres no deja borrar turnos.
drop table if exists chats;
drop table if exists turnos;

-- ---------------------------------------------------------------------
-- Tabla reservas: cada fila es una reserva de un alumno (1 o más horarios).
-- ---------------------------------------------------------------------
create table reservas (
  id uuid primary key default gen_random_uuid(),

  nombre text not null,
  apellido text not null,
  telefono text not null,   -- 10 dígitos, como text para no perder ceros
  materia text not null,

  -- Opcionales.
  anio_cursando text,
  notas text,
  archivo_url text,

  comprobante_url text not null,

  -- numeric(10, 2): número decimal exacto, hasta 10 dígitos en total y 2
  -- después de la coma. Para plata se usa numeric y no float, porque float
  -- redondea (0.1 + 0.2 no da exactamente 0.3). Lo calcula la función de A2
  -- y queda guardado: si después cambia el precio, esta reserva no cambia.
  -- Postgres llama a este check reservas_monto_check.
  monto numeric(10, 2) not null check (monto > 0),

  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'confirmado', 'rechazado')),

  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tabla reserva_horarios: une cada reserva con sus horarios.
-- Una reserva de 14:00 a 16:30 tiene 3 filas acá (14:00, 15:00 y 16:00).
-- ---------------------------------------------------------------------
create table reserva_horarios (
  -- ON DELETE CASCADE: si se borra la reserva, sus filas acá se borran solas.
  reserva_id uuid not null references reservas(id) on delete cascade,

  -- Sin "on delete": no se puede borrar un horario que tenga reservas.
  disponibilidad_id uuid not null references disponibilidad(id),

  -- PRIMARY KEY de dos columnas (clave compuesta): la pareja
  -- (reserva, horario) no se repite, o sea, una reserva no puede tener
  -- el mismo horario dos veces. Postgres la llama reserva_horarios_pkey.
  primary key (reserva_id, disponibilidad_id)
);

-- ---------------------------------------------------------------------
-- Tabla chats: igual que antes, pero apunta a reservas.
-- ---------------------------------------------------------------------
create table chats (
  id uuid primary key default gen_random_uuid(),

  -- UNIQUE: no puede haber dos chats con la misma reserva (un chat por
  -- reserva, como dice el plan). Postgres lo llama chats_reserva_id_key.
  reserva_id uuid not null unique references reservas(id) on delete cascade,

  historial jsonb not null default '[]'::jsonb,

  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: las tres quedan cerradas (sin políticas). El navegador no lee ni
-- escribe directo; en A2 va a usar solo la función "crear reserva".
-- ---------------------------------------------------------------------
alter table reservas enable row level security;
alter table reserva_horarios enable row level security;
alter table chats enable row level security;
