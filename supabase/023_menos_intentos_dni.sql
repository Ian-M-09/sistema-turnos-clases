-- 023: baja el límite de DNIs inexistentes por IP de 10 a 3 (decidido 17/11).
-- Se queda sin captcha: el antiabuso es este límite más el máximo de
-- 1 reserva pendiente por alumno (015).
-- Solo cambia dni_bloqueado_por_intentos(). verificar_alumno y
-- crear_reserva ya la llaman, así que no hace falta tocarlas: al
-- reemplazar esta función, las dos usan el límite nuevo.
-- Los 15 minutos de espera quedan igual.

create or replace function dni_bloqueado_por_intentos()
-- create or replace: si la función ya existe (la creó 015), la reemplaza
-- con esta versión. Tiene que tener el mismo nombre, los mismos parámetros
-- (ninguno) y el mismo tipo de resultado.
returns boolean
language sql
security definer
-- security definer: corre con los permisos de quien la creó, así puede
-- leer intentos_dni aunque anon no pueda (la tabla está cerrada).
set search_path = public
as $$
  select count(*) >= 3
  -- count(*) >= 3: true si esta IP ya tiene 3 o más intentos fallidos.
  -- Con 3 fallidos, el cuarto intento ya se frena.
  from intentos_dni
  where ip = ip_cliente()
    and creado_en > now() - interval '15 minutes';
$$;
