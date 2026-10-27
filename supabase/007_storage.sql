-- =====================================================================
-- 007: Storage para comprobantes y apuntes (paso A3 del plan)
-- Dos buckets PRIVADOS (nadie puede ver los archivos con un link
-- público). El navegador (anon) solo puede SUBIR archivos nuevos: no
-- puede leerlos, reemplazarlos ni borrarlos. La profesora los va a ver
-- en la Fase C con URLs firmadas temporales.
-- Límites por reserva: 1 comprobante de hasta 2 MB + varios archivos de
-- apuntes que sumen hasta 3 MB = como máximo 5 MB por reserva. El
-- bucket solo puede limitar cada archivo por separado; la suma de los
-- apuntes la controla crear_reserva (008).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Buckets: un bucket es como una carpeta raíz con sus propias reglas.
-- Supabase los guarda como filas de la tabla storage.buckets.
-- ---------------------------------------------------------------------
-- storage.buckets: la tabla "buckets" del esquema "storage" (el esquema
-- que Supabase usa para los archivos; nuestras tablas están en public).
-- public = false: bucket privado. Sin esto, cualquiera con el link
-- podría ver los comprobantes.
-- file_size_limit: tamaño máximo de CADA archivo, en bytes.
-- 2 * 1024 * 1024 = 2 MB (1 MB son 1024 KB y 1 KB son 1024 bytes).
-- allowed_mime_types: lista de tipos de archivo permitidos. El MIME type
-- es la "etiqueta" que dice qué es el archivo (por ejemplo image/png).
-- array[...]: una lista de valores en SQL.
-- Quedan afuera a propósito: SVG (puede tener JavaScript adentro), HEIC
-- (Chrome y Windows no lo muestran; el iPhone lo convierte a JPEG solo)
-- y Word viejo .doc (puede tener macros).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'comprobantes', 'comprobantes', false,
    2 * 1024 * 1024,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'apuntes', 'apuntes', false,
    3 * 1024 * 1024,
    array[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      -- Este es el MIME type oficial de los .docx (Word moderno).
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
-- ON CONFLICT (id) DO UPDATE: si el bucket ya existe (porque el archivo
-- se corrió antes), en vez de dar error le actualiza los valores.
-- excluded: la fila que se intentó insertar. Así este archivo se puede
-- corregir y volver a correr.
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Políticas: quién puede hacer qué con los archivos.
-- Cada archivo subido es una fila de storage.objects, que ya viene con
-- RLS activado. Sin políticas, nadie (salvo el dueño) puede tocarla.
-- ---------------------------------------------------------------------
-- DROP POLICY IF EXISTS: borra la política si existe, para poder volver
-- a correr el archivo sin error de "ya existe".
drop policy if exists "anon sube comprobantes" on storage.objects;
drop policy if exists "anon sube apuntes" on storage.objects;

-- CREATE POLICY "nombre" ON tabla: crea una regla de RLS.
-- FOR INSERT: solo vale para subir (insertar) archivos nuevos.
-- TO anon: solo para el rol anon (el navegador del alumno).
-- WITH CHECK (condición): la fila nueva tiene que cumplir la condición;
-- si no, Supabase rechaza la subida.
-- bucket_id: en qué bucket se está subiendo.
-- name: el nombre (ruta) del archivo dentro del bucket.
-- ~ significa "coincide con el patrón" (expresión regular). El patrón
-- obliga a que el nombre sea un UUID aleatorio + una extensión válida,
-- por ejemplo "3f2b9c1e-8a4d-4f6b-9e2a-1c5d7b8e9f00.pdf":
--   ^ y $        principio y fin del nombre (no puede haber nada más)
--   [0-9a-f]{8}  8 caracteres hexadecimales (0 a 9 y a a f)
--   -            un guion literal
--   \.           un punto literal (el \ hace que no signifique "cualquier
--                carácter")
--   (pdf|jpg|png|webp)  una de esas extensiones (| significa "o")
-- Así nadie puede elegir el nombre (ni pisar o adivinar el de otro) ni
-- meter carpetas con "/".
-- Al no haber políticas de SELECT, UPDATE ni DELETE, anon no puede ver,
-- reemplazar ni borrar archivos (tampoco los que subió él).
create policy "anon sube comprobantes"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'comprobantes'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
);

create policy "anon sube apuntes"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'apuntes'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp|docx)$'
);
