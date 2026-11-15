"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { linkWhatsApp, mensajeConfirmada, mensajeRechazada, mensajeCancelada } from "@/lib/whatsapp";

// Sección "Reservas" del panel. Cada profesor ve solo las de sus materias
// (lo decide la política de 012, no esta pantalla). Arriba van las
// pendientes de confirmar y abajo las confirmadas que todavía no pasaron.

const MINUTO = 60 * 1000; // un minuto en milisegundos

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

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from("reservas")
                .select(
                    "id, nombre, apellido, telefono, materia, anio_cursando, notas, apuntes, comprobante_url, monto, estado, creado_en, reserva_horarios(disponibilidad(fecha, hora, duracion_minutos))"
                )
                // reserva_horarios(disponibilidad(...)): trae, en la misma
                // consulta, los horarios de cada reserva y los datos de cada
                // horario (Supabase sigue las claves foráneas de 004).
                .in("estado", ["pendiente_pago", "confirmado"])
                // .in("columna", lista): solo las filas con alguno de esos valores.
                .order("creado_en");

            if (error) {
                setError("No se pudieron cargar las reservas.");
                setCargando(false);
                return;
            }

            const ahora = Date.now();
            const todas = data.map(prepararReserva);
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

    function dibujarTarjeta(r) {
        // Devuelve el JSX de la tarjeta de una reserva. Es una función común
        // (no un componente): un componente definido adentro de otro se
        // volvería a crear en cada dibujo y React perdería su estado.
        // key va en el <li> porque es el elemento de la lista.
        const ocupado = trabajando === r.id;
        return (
            <li key={r.id} className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-2 text-sm">
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

            <div className="flex flex-wrap gap-2 mt-1">
                {r.estado === "pendiente_pago" ? (
                <>
                    <button
                    onClick={() => cambiarEstado(r, "confirmar")}
                    disabled={ocupado}
                    className="bg-acento text-white px-4 py-2 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
                    >
                    Confirmar
                    </button>
                    <button
                    onClick={() => cambiarEstado(r, "rechazar")}
                    disabled={ocupado}
                    className="border border-borde px-4 py-2 rounded-lg hover:bg-suave transition disabled:opacity-60"
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
                        className="bg-acento text-white px-4 py-2 rounded-lg hover:bg-acento-hover transition"
                    >
                        WhatsApp
                    </a>
                    )}
                    <button
                    onClick={() => cambiarEstado(r, "cancelar")}
                    disabled={ocupado}
                    className="border border-borde px-4 py-2 rounded-lg hover:bg-suave transition disabled:opacity-60"
                    >
                    Cancelar clase
                    </button>
                </>
                )}
            </div>
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
                className="self-start bg-acento text-white px-4 py-2 rounded-lg hover:bg-acento-hover transition"
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
