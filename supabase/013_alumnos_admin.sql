-- =====================================================================
-- 013: alumnos en el panel (paso C5)
-- Los dos profesores pueden ver, registrar, editar y bloquear alumnos
-- (es una sola lista compartida). Acá alcanza con políticas RLS sobre la
-- tabla: los checks de 009 ya validan el DNI (7 u 8 números) y el
-- teléfono (10 números), y el UNIQUE no deja repetir un DNI.
-- No hay política de DELETE: un alumno no se borra, se bloquea (si tiene
-- reservas, borrarlo dejaría esas reservas sin alumno).
-- =====================================================================

-- mi_profesor_id() is not null: la cuenta es de alguno de los dos
-- profesores (010). Para cualquier otra cuenta (o sin sesión) no vale.
drop policy if exists "Profesores leen alumnos" on alumnos;
create policy "Profesores leen alumnos"
  on alumnos for select to authenticated
  using (mi_profesor_id() is not null);

-- FOR INSERT usa WITH CHECK (la fila nueva tiene que cumplirlo).
drop policy if exists "Profesores registran alumnos" on alumnos;
create policy "Profesores registran alumnos"
  on alumnos for insert to authenticated
  with check (mi_profesor_id() is not null);

-- FOR UPDATE usa las dos: USING dice qué filas puede cambiar y
-- WITH CHECK cómo tienen que quedar después del cambio.
drop policy if exists "Profesores editan alumnos" on alumnos;
create policy "Profesores editan alumnos"
  on alumnos for update to authenticated
  using (mi_profesor_id() is not null)
  with check (mi_profesor_id() is not null);
