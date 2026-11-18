-- =====================================================================
-- 027: límite de largo para las notas y el año que cursa el alumno
-- El formulario ya corta el texto, pero un script puede llamar directo a
-- crear_reserva. Con estas reglas la base rechaza los textos largos venga
-- de donde venga. Además, las notas se le mandan a Gemini: un texto enorme
-- gastaría el cupo gratuito.
-- Se puede volver a correr (drop constraint if exists).
--
-- Si alguna reserva vieja ya pasa el límite, este archivo da error y NO
-- cambia nada (no se recorta ni se pierde ningún dato).
-- =====================================================================

-- ALTER TABLE: cambia la estructura de una tabla que ya existe.
-- DROP CONSTRAINT IF EXISTS: borra la regla si ya estaba, para que el
-- archivo se pueda correr de nuevo sin el error de "ya existe".
-- ADD CONSTRAINT nombre CHECK (condición): agrega una regla que TODA fila
-- tiene que cumplir. Si no la cumple, la base rechaza el insert o el update.
-- char_length(texto): cuántos caracteres tiene el texto.
-- Las dos columnas son opcionales: con NULL, un CHECK no rechaza la fila.
alter table reservas
  drop constraint if exists reservas_notas_largo_check,
  add constraint reservas_notas_largo_check
    check (char_length(notas) <= 500);

alter table reservas
  drop constraint if exists reservas_anio_cursando_largo_check,
  add constraint reservas_anio_cursando_largo_check
    check (char_length(anio_cursando) <= 60);
