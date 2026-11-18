# Scripts SQL de la base

Estos scripts recrean la base de datos desde cero (por ejemplo, en el
proyecto de Supabase de otra cuenta).

## Cómo usarlos
1. Abrir el SQL Editor del proyecto de Supabase.
2. Correr los archivos **en orden de número**, uno por uno:
   - `001_tablas_iniciales.sql`: tablas disponibilidad, turnos y chats, con RLS activado.
   - `002_duracion_minutos.sql`: columna duracion_minutos (60 o 30).
   - `003_politica_lectura_disponibilidad.sql`: lectura pública de disponibilidad.
   - `004_reservas.sql`: borra turnos y chats; crea reservas, reserva_horarios y chats (apuntando a reservas).
   - `005_configuracion.sql`: tabla de una fila con el depósito por hora, CBU, alias y titular (lectura pública).
   - `006_crear_reserva.sql`: función crear_reserva (valida, ocupa los lugares y crea la reserva, todo o nada).
   - `007_storage.sql`: buckets privados comprobantes y apuntes, y la política de subida de anon.
   - `008_archivos_reserva.sql`: varios apuntes por reserva; crear_reserva verifica los archivos en Storage.
   - `009_profesores_alumnos.sql`: tablas profesores (reemplaza a configuracion), materias y alumnos; función verificar_alumno; crear_reserva recibe el DNI.
   - `010_usuarios_profesores.sql`: tabla que vincula cada cuenta de Supabase Auth con su profesor y función mi_profesor_id(). Al final tiene los pasos a mano (apagar el registro, crear las cuentas y vincularlas).
   - `011_horarios_admin.sql`: funciones cargar_horarios (arma los horarios de un día por rango) y dar_de_baja_horario (solo si no tiene reservas pendientes ni confirmadas). Solo para profesores.
   - `012_reservas_admin.sql`: estado cancelado (con cancelado_en y devolucion); cada profesor lee sus reservas, sus horarios y sus archivos; función cambiar_estado_reserva (confirmar, rechazar, cancelar).
   - `013_alumnos_admin.sql`: los profesores pueden leer, registrar y editar (bloquear) alumnos. No se pueden borrar.
   - `014_mis_datos.sql`: deposito_por_hora pasa a precio_por_hora (y crear_reserva se recrea); cada profesor edita su nombre, precio, CBU, alias y titular; checks de formato del CBU (22 números) y el alias.
   - `015_antiabuso.sql`: tabla intentos_dni; verificar_alumno y crear_reserva frenan a una IP que probó 10 DNIs inexistentes en 15 minutos; máximo 1 reserva pendiente_pago por alumno (verificar_alumno avisa con tiene_pendiente; crear_reserva devuelve NULL si el DNI no existe).
   - `016_vencimiento.sql`: columnas vencida y devuelto_en; vencer_reservas_pendientes (las pendientes de más de 30 minutos pasan a rechazado, vencidas y con devolución, y liberan sus lugares); marcar_devuelta para el profesor; pg_cron la corre cada minuto y limpia su historial todos los días. Si `create extension pg_cron` da error, activarla en Integrations → Cron.
   - `017_clase_dada.sql`: columna dada_en en reservas; marcar_clase_dada para que el profesor marque (o desmarque) una clase confirmada que ya empezó.
   - `018_telegram.sql`: pg_net; tablas cerradas telegram_profesores (chat_id de cada profesor) y ajustes (url_panel); trigger diferido avisar_reserva_nueva que manda el aviso por Telegram al crearse una reserva; cambiar_estado_reserva no deja cancelar una clase dada. Antes, guardar el token del bot en Vault a mano: `select vault.create_secret('TOKEN', 'telegram_bot_token');` (nunca en el repo).
   - `019_recordatorio_sabados.sql`: recordar_cargar_horarios(profesor) manda por Telegram el recordatorio de cargar la semana siguiente, con cuántos horarios ya hay cargados; pg_cron lo corre los sábados a las 13:00 (profesora) y 18:00 (profesor) de Argentina.
   - `020_chats_admin.sql`: cada profesor lee, crea (solo en reservas confirmadas) y actualiza los chats de Gemini de sus reservas. Lo usa la ruta del servidor /api/gemini con la sesión del profesor.
   - `021_limpieza.sql`: columna archivos_borrados_en; reservas_para_limpiar (clase de hace más de 30 días, salvo pendientes y vencidas sin devolver) y archivos_para_limpiar (sus archivos + huérfanos de más de 1 día). Solo para service_role: las usa la ruta /api/limpieza, que borra con la API de Storage.
   - `022_recordatorio_limpieza.sql`: archivos_para_limpiar deja afuera los .emptyFolderPlaceholder; enviar_telegram (función común para mandar un Telegram a un profesor); recordar_limpieza avisa el día 15 si hay algo para limpiar (pg_cron: 13:00 profesora, 18:00 profesor, hora de Argentina).
   - `023_menos_intentos_dni.sql`: dni_bloqueado_por_intentos baja el límite de 10 a 3 DNIs inexistentes por IP en 15 minutos (sin captcha).

## Regla
Todo cambio nuevo en la base va en un archivo nuevo con el número que
sigue (`004_...sql`, `005_...sql`). Los archivos que ya se corrieron
no se editan.
