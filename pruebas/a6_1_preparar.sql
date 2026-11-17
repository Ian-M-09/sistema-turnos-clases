-- =====================================================================
-- A6, paso 1: preparar los datos de prueba (correr en el SQL Editor).
-- Todo va en el 15/03/2028: el calendario muestra solo 2 meses
-- adelante, así que ningún alumno real ve estos horarios.
-- Después: correr el script de Node (a6_2_pruebas.mjs) y al final
-- a6_3_revisar.sql y a6_4_limpiar.sql.
-- =====================================================================

-- Alumnos de prueba: DNIs 99000001 a 99000006 (no existen de verdad).
-- generate_series(1, 6): genera las filas 1, 2, 3, 4, 5, 6.
-- lpad(texto, 6, '0'): rellena con ceros a la izquierda hasta 6
-- caracteres ("1" pasa a "000001"), así el DNI queda "99000001".
-- on conflict (dni) do nothing: si ya existen (porque corriste esto
-- antes), no da error.
insert into alumnos (dni, nombre, apellido, telefono)
select '99' || lpad(n::text, 6, '0'), 'Prueba', 'A6-' || n, '0000000000'
from generate_series(1, 6) as n
on conflict (dni) do nothing;

-- Horarios de prueba.
-- (fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos)
insert into disponibilidad (fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos)
values
  -- Prueba 1 (concurrencia): queda 1 solo lugar (4 de 5 ocupados).
  ('2028-03-15', '10:00', 5, 4, 60),
  -- Prueba 2 (doble clic del mismo alumno).
  ('2028-03-15', '12:00', 5, 0, 60),
  -- Prueba 3 (2 horas y media seguidas): 14, 15 y la media hora de las 16.
  ('2028-03-15', '14:00', 5, 0, 60),
  ('2028-03-15', '15:00', 5, 0, 60),
  ('2028-03-15', '16:00', 5, 0, 30),
  -- Para "media hora en el medio": 15:00 + 16:00 (media) + 16:30.
  ('2028-03-15', '16:30', 5, 0, 60),
  -- Para "no seguidos": 18 y 20 (falta las 19).
  ('2028-03-15', '18:00', 5, 0, 60),
  ('2028-03-15', '20:00', 5, 0, 60),
  -- Para "distinto día".
  ('2028-03-16', '14:00', 5, 0, 60)
on conflict (fecha, hora) do nothing;

-- Para "menos de 24 hs": hoy a las 05:13. Siempre falta menos de 24 hs
-- (o ya pasó). La hora rara es para que no choque con un horario real.
insert into disponibilidad (fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos)
values (current_date, '05:13', 5, 0, 60)
on conflict (fecha, hora) do nothing;

-- Para revisar que quedó todo bien:
select fecha, hora, cupo_ocupado, cupo_maximo, duracion_minutos
from disponibilidad
where fecha in ('2028-03-15', '2028-03-16') or hora = '05:13'
order by fecha, hora;
