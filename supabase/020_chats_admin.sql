-- =====================================================================
-- 020: chats con Gemini en el panel (pasos E2 y E3)
-- Cada profesor puede leer, crear y actualizar SOLO los chats de sus
-- reservas (profesor_id), y crear solo en reservas confirmadas.
-- La que escribe es la ruta del servidor (src/app/api/gemini/route.js),
-- pero lo hace con la sesión del profesor: estas políticas valen igual.
-- No hay política de DELETE: el borrado viene con la limpieza (E4).
-- =====================================================================

-- La tabla chats es de 004 y ya tiene RLS activado (sin políticas).
-- Se repite por las dudas: si ya estaba activado, no cambia nada.
alter table chats enable row level security;

-- Las tres políticas usan la misma condición: la reserva del chat es mía.
drop policy if exists "Profesor lee sus chats" on chats;
create policy "Profesor lee sus chats"
  on chats for select to authenticated
  using (
    exists (
      select 1 from reservas r
      where r.id = reserva_id and r.profesor_id = mi_profesor_id()
    )
  );

-- Crear: además, la reserva tiene que estar confirmada (el plan dice que
-- el chat es de las clases confirmadas).
drop policy if exists "Profesor crea chats de sus reservas confirmadas" on chats;
create policy "Profesor crea chats de sus reservas confirmadas"
  on chats for insert to authenticated
  with check (
    exists (
      select 1 from reservas r
      where r.id = reserva_id
        and r.profesor_id = mi_profesor_id()
        and r.estado = 'confirmado'
    )
  );

-- Actualizar (agregar mensajes al historial): USING dice qué chats puede
-- tocar y WITH CHECK que después del cambio siga siendo de una reserva suya
-- (así no puede "mover" un chat a la reserva de otro profesor).
drop policy if exists "Profesor actualiza sus chats" on chats;
create policy "Profesor actualiza sus chats"
  on chats for update to authenticated
  using (
    exists (
      select 1 from reservas r
      where r.id = reserva_id and r.profesor_id = mi_profesor_id()
    )
  )
  with check (
    exists (
      select 1 from reservas r
      where r.id = reserva_id and r.profesor_id = mi_profesor_id()
    )
  );
