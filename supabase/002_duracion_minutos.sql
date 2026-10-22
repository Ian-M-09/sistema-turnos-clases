-- =====================================================================
-- 002: columna duracion_minutos en disponibilidad
-- Permite cargar horarios de 1 hora (60) o una media hora final (30).
-- =====================================================================

-- ADD COLUMN: agrega una columna a una tabla que ya existe.
-- Como es NOT NULL, el DEFAULT 60 es necesario: Postgres se lo pone a las
-- filas que ya estaban cargadas (si no, quedarían vacías y daría error).
-- CHECK ... IN (30, 60): solo se aceptan esos dos valores. Postgres lo
-- guarda como "= ANY (ARRAY[30, 60])" (es lo mismo, escrito de otra forma)
-- y lo llama disponibilidad_duracion_minutos_check.
alter table disponibilidad
  add column duracion_minutos integer not null default 60
    check (duracion_minutos in (30, 60));
