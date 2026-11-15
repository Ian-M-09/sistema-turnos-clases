-- =====================================================================
-- 010: acceso de los profesores al panel (/admin)
-- Los profesores entran con email y contraseña (Supabase Auth). Supabase
-- guarda esas cuentas en su propia tabla auth.users. Esta tabla nueva
-- dice qué cuenta es de qué profesor: una cuenta que NO esté acá no
-- tiene acceso a nada, aunque haya podido iniciar sesión.
-- Los emails NO se escriben en este archivo (el repo es público): las
-- cuentas se crean y se vinculan a mano (ver los pasos al final).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla usuarios_profesores.
-- ---------------------------------------------------------------------
-- user_id: el id de la cuenta en auth.users (el esquema "auth" es el
-- que usa Supabase para los logins).
-- ON DELETE CASCADE: si se borra la cuenta, se borra su fila acá.
-- profesor_id UNIQUE: cada profesor tiene una sola cuenta.
create table if not exists usuarios_profesores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profesor_id smallint not null unique references profesores(id)
);

alter table usuarios_profesores enable row level security;

-- TO authenticated: el rol de quien inició sesión (anon es el de quien
-- no inició sesión). auth.uid(): función de Supabase que devuelve el id
-- de la cuenta que está haciendo el pedido.
-- Cada profesor puede leer solo SU fila (para saber quién es).
drop policy if exists "Cada profesor lee su fila" on usuarios_profesores;
create policy "Cada profesor lee su fila"
  on usuarios_profesores for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- mi_profesor_id(): devuelve el profesor de la cuenta actual, o null si
-- la cuenta no es de ningún profesor (o si no inició sesión).
-- ---------------------------------------------------------------------
-- La vamos a usar en las políticas de las próximas tablas, por ejemplo:
--   using (profesor_id = mi_profesor_id())    → solo sus reservas
--   using (mi_profesor_id() is not null)      → cualquiera de los dos
-- LANGUAGE sql: una función de una sola consulta (no hace falta plpgsql).
-- STABLE: dentro de un mismo pedido siempre devuelve lo mismo, y eso le
-- permite a Postgres calcularla una sola vez en vez de una por fila.
-- SECURITY DEFINER: lee la tabla con los permisos del dueño, así la
-- función anda aunque las políticas cambien.
create or replace function mi_profesor_id()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select profesor_id from usuarios_profesores where user_id = auth.uid();
$$;

revoke execute on function mi_profesor_id() from public;
grant execute on function mi_profesor_id() to authenticated;

-- ---------------------------------------------------------------------
-- Lo público también para quien inició sesión.
-- ---------------------------------------------------------------------
-- Las políticas de 003, 007 y 009 son solo "to anon". Cuando un profesor
-- inicia sesión, su navegador pasa a ser "authenticated" (también en
-- /reservar), y sin esto no podría ver los horarios ni su propia fila de
-- profesores. ALTER POLICY ... TO cambia a qué roles se aplica una política.
alter policy "Lectura pública de disponibilidad" on disponibilidad to anon, authenticated;
alter policy "Lectura pública de profesores" on profesores to anon, authenticated;
alter policy "Lectura pública de materias" on materias to anon, authenticated;
alter policy "anon sube comprobantes" on storage.objects to anon, authenticated;
alter policy "anon sube apuntes" on storage.objects to anon, authenticated;

grant execute on function verificar_alumno(text) to authenticated;
grant execute on function crear_reserva(uuid[], text, text, text, text, text[], text) to authenticated;

-- =====================================================================
-- PASOS A MANO (en el panel de Supabase, NO se guardan en el repo):
-- 1. Authentication > Sign In / Providers: apagar "Allow new users to
--    sign up" (así nadie puede crearse una cuenta desde la página).
-- 2. Authentication > Users > Add user > Create new user: crear las dos
--    cuentas con email y contraseña, marcando "Auto Confirm User".
-- 3. En el SQL Editor, vincular cada cuenta con su profesor (cambiando
--    los emails por los reales):
--      insert into usuarios_profesores (user_id, profesor_id)
--      select id, 1 from auth.users where email = 'EMAIL_DE_LA_PROFESORA';
--      insert into usuarios_profesores (user_id, profesor_id)
--      select id, 2 from auth.users where email = 'EMAIL_DEL_PROFESOR';
-- =====================================================================
