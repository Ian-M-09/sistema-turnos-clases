"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { linkWhatsApp, mensajeConfirmada, mensajeRechazada, mensajeCancelada, mensajeVencida } from "@/lib/whatsapp";
import ChatGemini from "@/components/admin/ChatGemini";

// Sección "Reservas" del panel. Cada profesor ve solo las de sus materias
// (lo decide la política de 012, no esta pantalla). Arriba van las
// vencidas que falta devolver (016), después las pendientes de confirmar
// y abajo las confirmadas que todavía no pasaron.

const MINUTO = 60 * 1000; // un minuto en milisegundos
const VENTANA_MINUTOS = 30;
// Minutos para confirmar antes de que la reserva venza. Tiene que ser el
// mismo valor que en vencer_reservas_pendientes (016_vencimiento.sql).

function minutosRestantes(creadoEn) {
    // Cuántos minutos le quedan a una pendiente antes de vencer (0 si ya
    // pasó el tiempo y la base todavía no la venció: tarda hasta 1 minuto).
    const vence = new Date(creadoEn).getTime() + VENTANA_MINUTOS * MINUTO;
    return Math.max(0, Math.ceil((vence - Date.now()) / MINUTO));
    // Math.ceil redondea para arriba (4,2 minutos → 5).
    // Math.max(0, x): si x es negativo, devuelve 0.
}

function aMinutos(hora) {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
}

function aHora(minutos) {
    return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function prepararReserva(r) {
    // Agrega a la reserva los datos de la clase ya calculados: el día, la
    // hora de inicio y de fin, y cuándo termina (para saber si ya pasó).
    const horarios = r.reserva_horarios
        .map((rh) => rh.disponibilidad)
        .filter(Boolean)
        // .filter(Boolean) saca los null (un horario que ya no existe).
        .sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora));
        // .sort ordena la lista; con (a, b) => a - b va de menor a mayor.

    if (horarios.length === 0) return { ...r, clase: null, terminaEn: 0 };

    const primero = horarios[0];
    const ultimo = horarios[horarios.length - 1];
    const inicio = aMinutos(primero.hora);
    const fin = aMinutos(ultimo.hora) + ultimo.duracion_minutos;
    const fechaLocal = new Date(`${primero.fecha}T00:00`);
    const [, mes, dia] = primero.fecha.split("-");

    return {
        ...r,
        clase: {
            nombre: r.nombre,
            materia: r.materia,
            dia: `${fechaLocal.toLocaleDateString("es-AR", { weekday: "long" })} ${dia}/${mes}`,
            // weekday: "long" da el nombre del día ("lunes").
            desde: aHora(inicio),
            hasta: aHora(fin),
        },
        terminaEn: fechaLocal.getTime() + fin * MINUTO,
        // Medianoche de ese día + los minutos hasta el fin de la clase.
    };
}

export default function ReservasAdmin() {
    const [vencidas, setVencidas] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [confirmadas, setConfirmadas] = useState([]);
    const [links, setLinks] = useState({});
    // links: { "nombre-de-archivo.pdf": "https://...link firmado" }.
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [aviso, setAviso] = useState(null);
    // aviso: { texto, whatsapp } después de rechazar o cancelar (esas
    // reservas desaparecen de la lista, así que el botón de WhatsApp va acá).
    const [trabajando, setTrabajando] = useState(null);
    // El id de la reserva que se está cambiando (para deshabilitar sus botones).
    const [version, setVersion] = useState(0);
    const [chatAbierto, setChatAbierto] = useState(null);
    // El id de la reserva que tiene el chat de Gemini abierto (uno a la vez).

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from("reservas")
                .select(
                    "id, nombre, apellido, telefono, materia, anio_cursando, notas, apuntes, comprobante_url, monto, estado, creado_en, vencida, reserva_horarios(disponibilidad(fecha, hora, duracion_minutos))"
                )
                // reserva_horarios(disponibilidad(...)): trae, en la misma
                // consulta, los horarios de cada reserva y los datos de cada
                // horario (Supabase sigue las claves foráneas de 004).
                .or("estado.in.(pendiente_pago,confirmado),and(vencida.eq.true,devuelto_en.is.null)")
                // .or("a,b"): las filas que cumplen a O b.
                //   a = estado es pendiente_pago o confirmado.
                //   b = and(...): vencida Y todavía sin devolver (devuelto_en es null).
                .order("creado_en");

            if (error) {
                setError("No se pudieron cargar las reservas.");
                setCargando(false);
                return;
            }

            const ahora = Date.now();
            const todas = data.map(prepararReserva);
            setVencidas(todas.filter((r) => r.vencida));
            setPendientes(todas.filter((r) => r.estado === "pendiente_pago"));
            setConfirmadas(
                todas
                    .filter((r) => r.estado === "confirmado" && r.terminaEn >= ahora)
                    .sort((a, b) => a.terminaEn - b.terminaEn)
                    // Las confirmadas, de la más próxima a la más lejana.
            );

            // Links firmados para ver los archivos: vencen en 1 hora (3600
            // segundos). createSignedUrls pide varios de una vez.
            const nuevos = {};
            const comprobantes = todas.map((r) => r.comprobante_url);
            const apuntes = todas.flatMap((r) => r.apuntes);
            // .flatMap: como .map, pero "aplana" las listas de cada reserva en
            // una sola lista de nombres.
            for (const [bucket, nombres] of [["comprobantes", comprobantes], ["apuntes", apuntes]]) {
                if (nombres.length === 0) continue;
                // continue: saltea a la próxima vuelta del for.
                const { data: firmados } = await supabase.storage.from(bucket).createSignedUrls(nombres, 3600);
                // data: firmados le cambia el nombre a "data" para no pisar el de arriba.
                for (const f of firmados ?? []) {
                    if (f.signedUrl) nuevos[f.path] = f.signedUrl;
                }
            }
            setLinks(nuevos);
            setCargando(false);
        }

        cargar();
    }, [version]);

    async function cambiarEstado(reserva, accion) {
        if (accion !== "confirmar") {
            const pregunta = accion === "rechazar"
                ? `¿Rechazar la reserva de ${reserva.nombre} ${reserva.apellido}? Se liberan sus lugares.`
                : `¿Cancelar la clase de ${reserva.nombre} ${reserva.apellido}? Se liberan sus lugares.`;
            if (!window.confirm(pregunta)) return;
        }

        setTrabajando(reserva.id);
        setError(null);
        setAviso(null);
        const { data: devolucion, error } = await supabase.rpc("cambiar_estado_reserva", {
            p_reserva_id: reserva.id,
            p_accion: accion,
        });
        setTrabajando(null);

        if (error) {
            setError(error.message);
            return;
        }

        const clase = { ...reserva.clase, nombre: reserva.nombre };
        if (accion === "confirmar") {
            setAviso({
                texto: `Reserva de ${reserva.nombre} confirmada. Avisale por WhatsApp:`,
                whatsapp: linkWhatsApp(reserva.telefono, mensajeConfirmada(clase)),
            });
        } else if (accion === "rechazar") {
            setAviso({
                texto: `Reserva de ${reserva.nombre} rechazada. Avisale por WhatsApp:`,
                whatsapp: linkWhatsApp(reserva.telefono, mensajeRechazada(clase)),
            });
        } else {
            const monto = Number(reserva.monto).toLocaleString("es-AR");
            setAviso({
                texto: devolucion
                    ? `Clase cancelada con más de 24 hs: corresponde DEVOLVER $${monto}. Avisale por WhatsApp:`
                    : "Clase cancelada con menos de 24 hs: NO corresponde devolución. Avisale por WhatsApp:",
                whatsapp: linkWhatsApp(reserva.telefono, mensajeCancelada(clase, devolucion, monto)),
            });
        }
        setVersion((v) => v + 1);
        // Volvemos a leer la lista con los estados nuevos.
    }

    async function marcarDevuelta(reserva) {
        const monto = Number(reserva.monto).toLocaleString("es-AR");
        if (!window.confirm(`¿Ya le devolviste $${monto} a ${reserva.nombre} ${reserva.apellido}?`)) return;

        setTrabajando(reserva.id);
        setError(null);
        setAviso(null);
        const { error } = await supabase.rpc("marcar_devuelta", { p_reserva_id: reserva.id });
        setTrabajando(null);

        if (error) {
            setError(error.message);
            return;
        }
        setVersion((v) => v + 1);
        // Al volver a leer, la reserva ya no aparece (devuelto_en dejó de ser null).
    }

    function dibujarTarjeta(r) {
        // Devuelve el JSX de la tarjeta de una reserva. Es una función común
        // (no un componente): un componente definido adentro de otro se
        // volvería a crear en cada dibujo y React perdería su estado.
        // key va en el <li> porque es el elemento de la lista.
        const ocupado = trabajando === r.id;
        return (
            <li key={r.id} className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-2 text-sm [overflow-wrap:anywhere]">
            {/* overflow-wrap: anywhere: si una palabra no entra en el ancho de
                la tarjeta, la corta y sigue en la línea de abajo. Los corchetes
                son la forma de Tailwind de escribir una regla CSS propia. */}
            <div className="flex justify-between gap-2">
                <p className="font-medium text-base">
                {r.nombre} {r.apellido}
                </p>
                <p className="font-medium">${Number(r.monto).toLocaleString("es-AR")}</p>
            </div>
            <p>
                {r.materia}
                {r.clase && ` · ${r.clase.dia}, de ${r.clase.desde} a ${r.clase.hasta}`}
            </p>
            <p>Tel: {r.telefono}{r.anio_cursando && ` · ${r.anio_cursando}`}</p>
            {r.notas && <p className="italic">“{r.notas}”</p>}

            <div className="flex flex-wrap gap-3">
                {links[r.comprobante_url] ? (
                <a href={links[r.comprobante_url]} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    Ver comprobante
                </a>
                ) : (
                <span className="text-texto/60">Comprobante no disponible</span>
                )}
                {r.apuntes.map((nombre, i) =>
                links[nombre] ? (
                    <a key={nombre} href={links[nombre]} target="_blank" rel="noopener noreferrer" className="underline">
                    Apunte {i + 1}
                    </a>
                ) : null
                )}
            </div>

            {r.estado === "pendiente_pago" && (
                <p className="font-medium">
                {minutosRestantes(r.creado_en) > 0
                    ? `Vence en ${minutosRestantes(r.creado_en)} min si no la confirmás.`
                    : "Venciendo..."}
                </p>
                // El número se calcula al cargar la lista; no baja solo.
                // Se actualiza cuando la lista se vuelve a leer.
            )}

            <div className="flex flex-wrap gap-2 mt-1">
                {r.vencida ? (
                <>
                    {r.clase && (
                    <a
                        href={linkWhatsApp(
                            r.telefono,
                            mensajeVencida({ ...r.clase, nombre: r.nombre }, Number(r.monto).toLocaleString("es-AR"))
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vidrio px-4 py-2"
                    >
                        WhatsApp
                    </a>
                    )}
                    <button
                    onClick={() => marcarDevuelta(r)}
                    disabled={ocupado}
                    className="vidrio px-4 py-2 disabled:opacity-60"
                    >
                    Ya devolví la plata
                    </button>
                </>
                ) : r.estado === "pendiente_pago" ? (
                // a ? b : c ? d : e  es un "if / else if / else" en corto:
                // primero las vencidas, después las pendientes, y si no, confirmadas.
                <>
                    <button
                    onClick={() => cambiarEstado(r, "confirmar")}
                    disabled={ocupado}
                    className="vidrio px-4 py-2 disabled:opacity-60"
                    >
                    Confirmar
                    </button>
                    <button
                    onClick={() => cambiarEstado(r, "rechazar")}
                    disabled={ocupado}
                    className="vidrio px-4 py-2 disabled:opacity-60"
                    >
                    Rechazar
                    </button>
                </>
                ) : (
                <>
                    {r.clase && (
                    <a
                        href={linkWhatsApp(r.telefono, mensajeConfirmada({ ...r.clase, nombre: r.nombre }))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="vidrio px-4 py-2"
                    >
                        WhatsApp
                    </a>
                    )}
                    <button
                    onClick={() => cambiarEstado(r, "cancelar")}
                    disabled={ocupado}
                    className="vidrio px-4 py-2 disabled:opacity-60"
                    >
                    Cancelar clase
                    </button>
                    <button
                    onClick={() => setChatAbierto(chatAbierto === r.id ? null : r.id)}
                    // Si ya estaba abierto, lo cierra (null); si no, lo abre.
                    aria-expanded={chatAbierto === r.id}
                    className="vidrio px-4 py-2"
                    >
                    {chatAbierto === r.id ? "Cerrar material" : "Material con IA"}
                    </button>
                </>
                )}
            </div>
            {chatAbierto === r.id && <ChatGemini reservaId={r.id} />}
            </li>
        );
    }

    if (cargando) return <p>Cargando reservas...</p>;

    return (
        <div className="flex flex-col gap-6 w-full max-w-lg text-left">
        {aviso && (
            <div className="bg-suave border border-borde rounded-lg p-4 flex flex-col gap-2">
            <p className="font-medium">{aviso.texto}</p>
            <a
                href={aviso.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start vidrio px-4 py-2"
                // self-start: este elemento no se estira a todo el ancho.
            >
                Abrir WhatsApp
            </a>
            </div>
        )}
        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        {vencidas.length > 0 && (
            // Esta sección aparece solo si hay alguna.
            <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Vencidas: hay que devolver la plata ({vencidas.length})</h2>
            <p className="text-sm text-texto/70">
                No se confirmaron en {VENTANA_MINUTOS} minutos y el lugar se liberó.
                El alumno ya había pagado: avisale por WhatsApp, devolvele el 100%
                por transferencia y después tocá &quot;Ya devolví la plata&quot;.
            </p>
            {/* &quot; es la forma de escribir comillas dobles dentro del texto de JSX. */}
            <ul className="flex flex-col gap-3">
                {vencidas.map(dibujarTarjeta)}
            </ul>
            </section>
        )}

        <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Pendientes de confirmar ({pendientes.length})</h2>
            <p className="text-sm text-texto/70">
            Antes de confirmar, revisá en tu cuenta del banco que la plata haya
            llegado: un comprobante se puede editar.
            </p>
            {pendientes.length === 0 && <p>No hay reservas pendientes.</p>}
            <ul className="flex flex-col gap-3">
            {pendientes.map(dibujarTarjeta)}
            </ul>
        </section>

        <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Próximas clases ({confirmadas.length})</h2>
            {confirmadas.length === 0 && <p>No hay clases confirmadas por delante.</p>}
            <ul className="flex flex-col gap-3">
            {confirmadas.map(dibujarTarjeta)}
            </ul>
        </section>
        </div>
    );
}
