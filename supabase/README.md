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

## Regla
Todo cambio nuevo en la base va en un archivo nuevo con el número que
sigue (`004_...sql`, `005_...sql`). Los archivos que ya se corrieron
no se editan.
