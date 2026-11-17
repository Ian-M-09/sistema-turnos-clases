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

## Regla
Todo cambio nuevo en la base va en un archivo nuevo con el número que
sigue (`004_...sql`, `005_...sql`). Los archivos que ya se corrieron
no se editan.
