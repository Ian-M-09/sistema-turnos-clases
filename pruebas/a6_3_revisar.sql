-- =====================================================================
-- A6, paso 3: revisar lo que dejó el script (no borra nada).
-- El SQL Editor muestra solo el resultado de la ÚLTIMA consulta: para
-- ver la 1, seleccioná ese bloque con el mouse y apretá Run (corre solo
-- lo seleccionado). Si corrés el archivo entero, ves la 2.
-- Después, para borrar los datos de prueba: a6_4_limpiar.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Revisar los lugares ocupados. Lo que tiene que dar:
--      10:00 → 5 de 5 (había 4 y entró 1 sola de las 3)
--      12:00 → 1      (de los 5 "doble clic" entró 1)
--      14:00, 15:00 y 16:00 → 1 (la de 2 horas y media)
--      todo lo demás → 0 (las inválidas no ocuparon nada)
-- ---------------------------------------------------------------------
select fecha, hora, duracion_minutos, cupo_ocupado, cupo_maximo
from disponibilidad
where fecha in ('2028-03-15', '2028-03-16') or hora = '05:13'
order by fecha, hora;

-- ---------------------------------------------------------------------
-- 2. Revisar las reservas guardadas. Tienen que ser 3, y la del alumno
--    A6-5 tiene que tener monto = precio por hora × 2,5.
-- ---------------------------------------------------------------------
-- string_agg(texto, ', ' order by ...): junta varios valores en un solo
-- texto separado por comas (acá, las horas de cada reserva).
-- group by: arma un grupo por reserva para poder juntar sus horas.
select
  a.apellido,
  r.estado,
  r.monto,
  p.precio_por_hora * 2.5 as monto_esperado_si_es_a6_5,
  string_agg(to_char(d.hora, 'HH24:MI'), ', ' order by d.hora) as horas
from reservas r
join alumnos a on a.id = r.alumno_id
join profesores p on p.id = r.profesor_id
join reserva_horarios rh on rh.reserva_id = r.id
join disponibilidad d on d.id = rh.disponibilidad_id
where a.dni like '990000__'
group by a.apellido, r.estado, r.monto, p.precio_por_hora
order by a.apellido;
