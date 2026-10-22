-- =====================================================================
-- 003: política de lectura pública de disponibilidad
-- El calendario (src/components/Calendario.js) lee los horarios con la
-- clave anon, así que necesita permiso de SELECT.
-- =====================================================================

-- CREATE POLICY "nombre": crea una regla de RLS. El nombre va entre
-- comillas dobles porque tiene espacios y tildes.
-- ON disponibilidad: la tabla a la que se aplica.
-- FOR SELECT: solo permite leer (no insertar, modificar ni borrar).
-- TO anon: solo para el rol anon (visitantes sin sesión iniciada).
-- USING (true): la condición que tiene que cumplir cada fila para verse;
-- true significa "todas las filas".
create policy "Lectura pública de disponibilidad"
  on disponibilidad
  for select
  to anon
  using (true);
