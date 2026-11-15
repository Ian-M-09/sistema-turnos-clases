Sistema de turnos: plan de ejecución

Última actualización: 15/11/2026

1. Qué es el proyecto

Sitio web para una profesora particular (la clienta) donde los alumnos reservan clases (día y hora), pagan el 100% de depósito por transferencia y suben el comprobante. La profesora confirma manualmente.

Desarrolla Ian (estudiante de Ingeniería en Informática, primer proyecto en solitario). El código vive en su GitHub como portfolio y la profesora hace un fork para desplegarlo en su cuenta.

Repo: https://github.com/Ian-M-09/sistema-turnos-clases

2. Cómo trabajar con Ian
Español Argentina.
Está aprendiendo y quiere entender cada línea y poder escribirlas sin depender de una IA. Todo el código va con comentarios que expliquen cada palabra reservada y cada concepto nuevo.
Prefiere tipear el código a mano en vez de copiar y pegar (a veces pide el archivo completo para revisar).
No asumir: ante una decisión de negocio o de diseño, preguntar (mejor con opciones). Él responde.
Va paso a paso y prueba después de cada cambio. Commits chicos con GitKraken (no usa la terminal para Git).
Windows, PowerShell y VS Code. Trabaja desde dos PCs: pull al empezar, push al terminar.
Lleva sus propias notas en docs/mis-notas.md.
3. Estado actual (hecho y funcionando)

Stack: Next.js 16 (App Router, JavaScript sin TypeScript), React, Tailwind CSS 4, Supabase (PostgreSQL) con @supabase/supabase-js. El proyecto de Supabase está en la cuenta de la clienta (región sa-east-1, plan gratuito) y Ian es colaborador.

Estructura: src/app (layout.js, page.js, globals.css, reservar/page.js), src/components (Calendario.js, FormularioAlumno.js, ComprobantePago.js), src/lib/supabase.js y .env.local (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY; no se sube a Git).

Pantallas: Home con botón "Reservar un turno" y /reservar en 5 pasos (DNI y materia, calendario, datos, comprobante, listo). El paso final sube los archivos a Storage y guarda la reserva con crear_reserva (A4).

Dos profesores (desde 009): la profesora (tema rosa) y un profesor (tema azul) que da Matemática, Álgebra, Programación y Economía. Al elegir una materia del profesor, toda la página pasa a azul (data-tema="azul" en <html>, colores en globals.css) y el comprobante muestra su cuenta y su precio. La reserva guarda profesor_id: la confirma y la recibe ese profesor. Comparten horarios y cupos.
Alumnos registrados (desde 009): los registran los profesores (DNI, nombre, apellido, teléfono; los dos pueden registrar y bloquear). En el primer paso el alumno escribe el DNI y verificar_alumno devuelve solo el nombre y si puede reservar (nunca el teléfono ni el apellido, para que no se puedan juntar datos probando DNIs). Un alumno bloqueado ve todo sin lugar, sin aviso de que está bloqueado. Hasta tener el panel (Fase C), se registran a mano en el Table Editor.

Calendario: mes actual con flechas (hasta 2 meses adelante). Lee disponibilidad de Supabase, oculta los horarios llenos y los que faltan menos de 24 hs. El alumno elige hora de inicio y duración (horas enteras seguidas del mismo día, más una media hora final si está cargada). Muestra "¡Último lugar!" cuando queda 1 lugar.
Primer paso: DNI (7 u 8 números) y materia (sale de la tabla materias).
Formulario: año que cursa (opcional), notas (opcional) y archivos de apuntes (opcional; PDF, foto o Word). Acepta varios archivos que sumen hasta 3 MB (las fotos se achican solas). Nombre, apellido y teléfono ya no se piden: salen del registro.
Comprobante: lee precio, CBU, alias y titular de la fila del profesor en la tabla profesores (valores de PRUEBA). El comprobante es obligatorio.
Diseño: paleta rosa sobre fondo crema, fuentes Montserrat (títulos) y Work Sans, adaptado a celulares, footer "Desarrollado por Ian Miño" con link a https://ian-m-09.github.io/. Ubicación del estudio (12 de Octubre 827, Salta Capital) con botón a Google Maps en la home y al terminar la reserva (src/components/Ubicacion.js).

Base de datos (RLS activado en todas las tablas):

disponibilidad: id, fecha, hora, cupo_maximo (5), cupo_ocupado (0), duracion_minutos (60 o 30). Unique (fecha, hora) y check de cupos. Tiene una política de lectura pública (anon, solo select).
reservas: id, nombre, apellido, telefono, materia, anio_cursando, notas, apuntes (lista de nombres de archivo), comprobante_url (nombre de archivo, único), monto, estado (pendiente_pago / confirmado / rechazado), creado_en. Sin políticas (cerrada); se escribe solo con la función crear_reserva.
reserva_horarios: reserva_id (on delete cascade), disponibilidad_id. Une cada reserva con sus horarios. Sin políticas (cerrada).
chats: id, reserva_id (único, on delete cascade), historial jsonb, creado_en. Sin políticas (cerrada).
profesores: id (1 profesora, 2 profesor), nombre, tema (rosa/azul), precio_por_hora, CBU, alias, titular. Lectura pública (no guardar datos privados acá). Reemplaza a configuracion.
materias: nombre, profesor_id, orden. Lectura pública.
alumnos: id, dni (único), nombre, apellido, telefono, bloqueado, creado_en. Cerrada; anon solo usa verificar_alumno.
reservas tiene además alumno_id y profesor_id (009).
Storage: buckets privados comprobantes (2 MB por archivo) y apuntes (3 MB en total por reserva). anon solo puede subir archivos con nombre uuid.extensión; no puede leerlos, reemplazarlos ni borrarlos.
4. Reglas de negocio y decisiones tomadas
Dos profesores que comparten horarios y cupos; cada materia es de uno solo. Los alumnos no tienen cuenta propia: los registra un profesor y reservan con su DNI.
Clases de 1 hora, mínimo 1 hora por reserva. Reservas de varias horas: siempre seguidas y del mismo día, sin tope de cantidad (lo limita lo que la profesora cargó).
Media hora final (confirmado): se carga como una fila aparte en disponibilidad con duracion_minutos = 30 y con la hora en que empieza esa media hora. Solo puede ir al final de una reserva, nunca como inicio.
Hasta 5 alumnos por horario (cada horario cargado tiene sus 5 lugares). Pueden ser de materias distintas.
Se reserva con al menos 24 hs de anticipación.
Pago del 100% por hora (proporcional al tiempo: una media hora paga la mitad). Pago por transferencia al CBU o alias del profesor de la materia y subida del comprobante. La columna se llama precio_por_hora (desde 014).
Política de devolución: si el alumno cancela con más de 24 hs de anticipación se le devuelve el 100%; con menos de 24 hs no se devuelve. Se muestra en el paso del pago y se manda por WhatsApp al reservar. La cancelación la registra el profesor desde el panel (libera los lugares) y la devolución la hace él por transferencia, fuera del sistema.
Estados: pendiente_pago, luego confirmado o rechazado, decidido manualmente por el profesor de la materia; una confirmada puede pasar a cancelado (si el alumno avisa que no viene). Ventana definida: 30 minutos desde que se sube el comprobante; si no confirma ni rechaza en ese lapso, se libera el cupo y la reserva queda en rechazado (decidido; no hay estado "vencido"). La ventana de 30 minutos se valida con ella (ver decisión 4).
Validación de pagos: la profesora decide cada reserva y debería confirmar en su cuenta bancaria que la plata llegó antes de confirmar (un comprobante se puede editar). No hay forma automática gratuita y confiable de verificarlo.
La profesora carga la disponibilidad todas las semanas (los sábados, para la semana siguiente). Recordatorio por email los sábados a la mañana.
Avisos (decidido):
A la profesora: email cada vez que llega un comprobante.
Al alumno: WhatsApp semiautomático con enlaces. Al confirmar o rechazar, el panel abre WhatsApp con el mensaje ya escrito al número del alumno y la profesora toca Enviar. Sin costo y sin aprobación de Meta.
La API oficial de WhatsApp (automática) queda como mejora futura: Meta cobra por cada mensaje de plantilla entregado (tarifa según país; no se confirmó la de Argentina) y hace falta cuenta de empresa, número dedicado y plantillas aprobadas.
El teléfono se guarda con 10 dígitos; para armar el enlace de WhatsApp hay que anteponer el prefijo de Argentina (549).
Login de los profesores (decidido 14/11): email y contraseña con Supabase Auth (no GitHub). No se entra solo con el DNI porque no es secreto. Los usuarios los crea Ian desde Supabase; no hay registro público.
Hosting (decidido probar): Netlify plan gratuito, que permite uso comercial. Vercel Hobby no sirve para producción (es solo para uso personal y no comercial).
Chat con IA (Gemini): uno por reserva y aislado. Se crea cuando la profesora confirma, con los archivos de apuntes como contexto, para generar teoría y ejercicios que ella revisa en su panel (no se envía al alumno). El historial lo guarda el sistema en Supabase (opción A). A los 30 días aparece "este chat tiene más de 30 días, ¿querés borrarlo?". El borrado es manual.
Objetivo de costo: lo más barato posible (idealmente $0 por mes).
5. Decisiones abiertas (preguntar, no asumir)
Hosting: confirmar Netlify con una demo. Hay que verificar que Next.js 16 despliegue bien con su adaptador y vigilar los topes mensuales del plan gratuito (se miden en créditos y, si se pasan, el sitio se pausa hasta el mes siguiente). Alternativas: Render pago (el plan que no se duerme, unos USD 7 por mes según una guía de terceros; el plan gratuito de Render se apaga a los 15 minutos sin tráfico y la primera visita puede tardar cerca de un minuto) o Cloudflare (necesita el adaptador OpenNext, el soporte en Windows no está garantizado, el límite de un Worker gratuito es 3 MiB y no se confirmó compatibilidad con Next.js 16). Con Netlify o Cloudflare, el único ping necesario es el de Supabase.
Monto real del depósito por hora y CBU y alias reales.
Ventana de 30 minutos para confirmar. La profesora tendría que mirar el email casi al instante. Revisarlo con ella (es un solo valor configurable).
Quién más puede entrar al panel. Cualquier persona con GitHub puede intentar iniciar sesión, así que hay que restringir el acceso a las cuentas de los dos profesores (lista de permitidos). Cada uno ve y confirma solo las reservas de sus materias; los dos manejan la lista de alumnos. Falta saber si el profesor tiene cuenta de GitHub.
Diseño de tablas para reservas de varias horas (ver A1).
Servicio de email para avisarle a la profesora y sus límites gratuitos (verificar al elegirlo).
Datos personales. Los alumnos probablemente son menores y se guardan nombre, teléfono y archivos. Definir cuánto tiempo se guardan, quién accede y si hace falta un aviso de privacidad (consultarlo con la profesora o un profesional; esto no es asesoramiento legal).
Antiabuso. Una reserva pendiente ocupa lugares y genera un aviso. Medidas baratas a decidir en la Fase A: un captcha (hay opciones gratuitas, por ejemplo Cloudflare Turnstile; verificarlo al implementar) y un límite de reservas pendientes por teléfono.
6. Plan de ejecución (en este orden)
Paso 0: demo online en Netlify (opcional, cuando Ian quiera mostrar avances)
Conectar el repo de GitHub a Netlify (plan gratuito) y cargar las dos variables de entorno antes de desplegar.
Verificar que Next.js 16 compile y funcione. Si da problemas, evaluar la alternativa (decisión 1).
Cuando exista el guardado real, las pruebas en la demo crean filas reales en la base de la profesora. Limpiarlas después.
Fase A: guardar la reserva de verdad (núcleo)
A0. Guardar en el repo (carpeta supabase/) los scripts SQL que ya se corrieron (tablas, columna duracion_minutos, política de lectura) y todos los que vengan, para poder recrear la base en otra cuenta. YA ESTA HECHO
A1. Decidir el diseño de tablas. Recomendación: una tabla reservas (datos del alumno, archivos, estado, monto, creado_en, guardados una sola vez) y una tabla que una cada reserva con sus horarios de disponibilidad; así confirmar o rechazar es un solo cambio. Alternativa: una fila en turnos por horario con un reserva_id común (duplica los datos del alumno). DECIDIDO: dos tablas (reservas + reserva_horarios), turnos se borra, el monto se guarda en la reserva (lo calcula la base). Script: supabase/004_reservas.sql. YA ESTA HECHO (corrido en Supabase).
A2. Función SQL (RPC) transaccional "crear reserva": valida que los horarios existan, sean seguidos y del mismo día, respeten las 24 hs y tengan lugar. Descuenta un lugar en cada uno y crea la reserva en pendiente_pago, todo o nada. Si alguien ocupó el último lugar mientras el alumno completaba el formulario, devuelve un error claro. El navegador solo puede ejecutar esa función; no inserta directo en las tablas. YA ESTA HECHO (supabase/006_crear_reserva.sql, corrido y probado en el SQL Editor; el monto sale de la tabla configuracion). La verificación de archivos (que existan en Storage y no se usen dos veces) se agregó en 008.
A3. Storage de Supabase: buckets privados (apuntes y comprobantes), tipos permitidos (PDF, imágenes, Word), tamaño máximo, nombres aleatorios y políticas mínimas. Cuidar el límite de 1 GB del plan gratuito. DECIDIDO: 1 comprobante de hasta 2 MB + varios archivos de apuntes que sumen hasta 3 MB (máximo 5 MB por reserva; la suma la controla crear_reserva); tipos PDF, JPEG, PNG, WebP y .docx (este solo en apuntes); sin HEIC (el iPhone convierte a JPEG solo), sin SVG ni .doc. Las fotos se achican solas en el navegador (A4). Nombres = UUID + extensión; anon solo puede subir, no leer, reemplazar ni borrar. Script: supabase/007_storage.sql. Script supabase/008_archivos_reserva.sql: reservas.archivo_url pasa a apuntes text[]; crear_reserva verifica que los archivos existan en storage.objects, que no se usen en otra reserva (comprobante_url unique) y que los apuntes sumen como máximo 3 MB. Archivos huérfanos (subidos sin reserva): se borran en la limpieza de mitad de mes (ver E4). YA ESTA HECHO (007 y 008 corridos y probados en el SQL Editor).
A4. Conectar el paso final de /reservar: subir archivos, llamar a la función y mostrar el resultado o el error (reemplazar los alert() por mensajes en pantalla). Incluye: varios archivos de apuntes con el total usado de los 3 MB en pantalla; achicar las fotos en el navegador (sin que el alumno haga nada); nombres crypto.randomUUID() + extensión (.jpg para JPEG); pasar p_apuntes como lista y el nombre del comprobante en p_comprobante_url; probar desde el navegador que la regla de subida de anon funcione (en el panel de Supabase no se aplica). YA ESTA HECHO (src/lib/archivos.js, FormularioAlumno, ComprobantePago y reservar/page.js; probado desde el navegador).
A5. Antiabuso (decisión 8): captcha, límite de reservas pendientes por alumno y límite de intentos de DNI (para que no se puedan probar DNIs al azar en verificar_alumno).
A6. Pruebas de concurrencia (dos reservas a la vez sobre el último lugar) y de reservas de varias horas.
Fase B: vencimiento de pendientes
B1. Proceso programado que cada pocos minutos libere los lugares de reservas pendiente_pago vencidas (pg_cron de Supabase o GitHub Actions o cron del hosting; verificar qué está disponible en el plan gratuito).
Fase C: panel de la profesora (/admin)
C1. Login con email y contraseña (Supabase Auth), restringido a las cuentas de los dos profesores, y protección de rutas. Políticas RLS para que cada profesor lea solo las reservas y comprobantes de sus materias (profesor_id; archivos con URLs firmadas temporales). YA ESTA HECHO (010_usuarios_profesores.sql, src/app/admin, LoginProfesor.js): /admin sin links desde el sitio y con noindex; registro de cuentas apagado; cuentas vinculadas en usuarios_profesores; mi_profesor_id() para las políticas. Las políticas de cada tabla se agregan con cada sección.
C2. Cargar (los dos profesores pueden cargar y dar de baja horarios, que son compartidos) la disponibilidad semanal (grilla o rangos; incluir horarios de 1 hora y media hora final; poder borrar horarios sin reservas). YA ESTA HECHO (011_horarios_admin.sql y src/components/admin/HorariosAdmin.js): por rangos, un desde/hasta por día de la semana; un horario con reservas pendientes o confirmadas no se puede dar de baja.
C3. Lista de reservas pendientes de cada profesor con el comprobante visible y botones Confirmar y Rechazar (rechazar libera los lugares). YA ESTA HECHO (012_reservas_admin.sql y src/components/admin/ReservasAdmin.js): pendientes arriba y próximas confirmadas abajo; ver comprobante y apuntes con links firmados de 1 hora; Confirmar, Rechazar y Cancelar clase (cancelar indica si corresponde devolver el 100%).
C5. Alumnos: registrar (DNI, nombre, apellido, teléfono), editar, bloquear y desbloquear. Lo pueden hacer los dos profesores. YA ESTA HECHO (013_alumnos_admin.sql y src/components/admin/AlumnosAdmin.js): registrar, editar, bloquear/desbloquear y buscar por nombre o DNI. No hay borrado (se bloquea).
C6. Mis datos: cada profesor cambia su nombre, precio por hora, CBU, alias y titular. YA ESTA HECHO (014_mis_datos.sql y src/components/admin/MisDatosAdmin.js).
C4. Agenda semanal con cuántos alumnos hay en cada horario. Marcar clases dadas (opcional). (Parcial: la pestaña Horarios ya muestra cuántos lugares hay ocupados en cada horario de la semana.)
Fase D: notificaciones
D1. Email al profesor de la materia cuando llega un comprobante (asunto bien visible, link directo a la reserva). Hace falta guardar el email de cada profesor en una tabla que anon NO pueda leer (no en profesores).
D2. Recordatorio por email los sábados a la mañana para cargar la disponibilidad.
D3. Botón "Avisar por WhatsApp" en el panel al confirmar o rechazar: abre WhatsApp con el mensaje ya escrito al número del alumno (prefijo 549 más los 10 dígitos). YA ESTA HECHO junto con C3 (src/lib/whatsapp.js): mensajes de confirmación (con dirección, Maps y política de devolución), rechazo y cancelación.
D4. (Futuro, opcional) Migrar a la API oficial de WhatsApp si el volumen lo justifica; antes verificar la tarifa vigente para Argentina.
Fase E: chat con Gemini
E1. Clave de la API de Gemini como variable de entorno SECRETA (sin NEXT_PUBLIC_), llamada solo desde el servidor. Verificar los límites del plan gratuito.
E2. Al confirmar una reserva: crear el chat con el prompt de sistema y los apuntes del alumno (PDF, Word o imagen) y guardar el historial en chats.
E3. Interfaz de chat en el panel para que la profesora siga pidiendo ajustes ("más fácil", "agregá un ejemplo").
E4. Aviso a los 30 días y limpieza manual de mitad de mes desde el panel: borra los chats y los datos de alumnos vencidos con sus archivos y, además, los archivos de los buckets apuntes y comprobantes que no aparezcan en ninguna reserva (huérfanos). Los archivos se borran con la API de Storage (supabase.storage.from(bucket).remove([...])), nunca con DELETE sobre storage.objects. Antes de borrar, la pantalla muestra cuántos archivos y cuántos MB se liberan.
E5. Afinar el prompt de sistema con apuntes reales y con la profesora.
Fase G: diseño
G1. Hacer la página más premium e interactiva (animaciones suaves, mejor home, transiciones entre pasos).
G2. Ubicación del estudio con enlace a Google Maps. YA ESTA HECHO (src/components/Ubicacion.js, en la home y al terminar la reserva). Tipografía Montserrat en los títulos, también hecha.
Fase F: operación y entrega
F1. Ping anti-pausa de Supabase con GitHub Actions cada 3 o 4 días (el plan gratuito pausa los proyectos inactivos durante una semana). Es el único keep-alive necesario si el hosting es Netlify.
F2. Datos reales: CBU y alias, monto, textos, título y descripción del sitio (hoy dice "Create Next App"), favicon y página 404.
F3. Pruebas en celulares reales, accesibilidad básica y revisión de los límites de los planes gratuitos.
F4. Hosting definitivo (decisión 1), variables de entorno en la cuenta de la profesora (su Supabase, su clave de Gemini, su servicio de email) y un README con los pasos del fork.
F5. Capacitación breve a la profesora y documentación de uso.
7. Seguridad (recordatorios)
Nunca poner claves secretas (service_role, Gemini, email) en variables NEXT_PUBLIC_ ni en el repo.
Toda regla importante (cupos, 24 hs, estados) se valida también en la base de datos, no solo en la pantalla.
Las tablas de reservas y chats permanecen cerradas al rol anon.
El panel solo se habilita para la cuenta de GitHub de la profesora.