-- =====================================================================
-- 026: tope diario de URLs de subida por alumno
-- permiso_subida (024) ya frena a 6 URLs cada 30 minutos, pero esperando
-- entre tandas un DNI válido podía seguir subiendo todo el día y llenar
-- el 1 GB del plan gratis. Ahora además hay un máximo de 20 URLs cada
-- 24 horas por alumno.
-- 20 alcanza de sobra: una reserva usa como máximo 6 (5 apuntes + 1
-- comprobante).
-- Solo cambia permiso_subida. Se puede correr en cualquier momento
-- después de 024 y se puede volver a correr (or replace).
-- =====================================================================

-- CREATE OR REPLACE: reemplaza la función de 024. Tiene los mismos
-- parámetros y el mismo tipo de resultado.
-- Devuelve las mismas palabras que en 024, más una nueva:
--   'limite_diario'  ya pidió 20 URLs en las últimas 24 horas
create or replace function permiso_subida(p_dni text, p_ip text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := coalesce(nullif(trim(p_ip), ''), 'sin-ip');
  v_alumno record;
begin
  -- a) Límite por IP: 3 DNIs inexistentes en 15 minutos (igual que en 024).
  if (
    select count(*) from intentos_dni
    where ip = v_ip and creado_en > now() - interval '15 minutes'
  ) >= 3 then
    return 'demasiados_intentos';
  end if;

  -- b) El alumno. FOR UPDATE hace esperar a los pedidos simultáneos del
  -- mismo alumno, para que ninguno se saltee los límites de abajo.
  select id, bloqueado into v_alumno
  from alumnos
  where dni = trim(p_dni)
  for update;

  if not found then
    insert into intentos_dni (ip) values (v_ip);
    delete from intentos_dni where creado_en < now() - interval '1 day';
    return 'dni_no_registrado';
  end if;

  if v_alumno.bloqueado then
    return 'bloqueado';
  end if;

  if exists (
    select 1 from reservas
    where alumno_id = v_alumno.id and estado = 'pendiente_pago'
  ) then
    return 'tiene_pendiente';
  end if;

  -- c) Máximo 6 URLs por alumno en 30 minutos (igual que en 024).
  if (
    select count(*) from subidas_firmadas
    where alumno_id = v_alumno.id and creado_en > now() - interval '30 minutes'
  ) >= 6 then
    return 'limite_subidas';
  end if;

  -- d) NUEVO: máximo 20 URLs por alumno en 24 horas.
  -- interval '24 hours': una ventana móvil, no "el día de hoy". Cada URL
  -- deja de contar 24 horas después de haberse pedido.
  if (
    select count(*) from subidas_firmadas
    where alumno_id = v_alumno.id and creado_en > now() - interval '24 hours'
  ) >= 20 then
    return 'limite_diario';
  end if;

  -- Pasó todo: contamos esta URL. Las filas de más de 2 días ya no sirven
  -- para ningún límite, así que se borran para que la tabla no crezca.
  insert into subidas_firmadas (alumno_id) values (v_alumno.id);
  delete from subidas_firmadas where creado_en < now() - interval '2 days';

  return 'ok';
end;
$$;

-- Los permisos se repiten para que este archivo sea seguro por sí solo:
-- la función sigue siendo exclusiva del servidor.
revoke execute on function permiso_subida(text, text) from public, anon, authenticated;
grant execute on function permiso_subida(text, text) to service_role;
