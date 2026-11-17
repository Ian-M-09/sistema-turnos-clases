"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DIAS, sumarDias, lunesDeEstaSemana, formatearDia, horaFin } from "@/lib/fechas";

// Sección "Agenda" del panel (paso C4): los horarios de una semana con
// los alumnos que vienen a cada uno.
// - De sus propias reservas, cada profesor ve nombre, apellido y materia.
// - De las del otro profesor, solo cuántas son (la política de 012 no le
//   deja leerlas). Se calcula restando: lugares ocupados del horario
//   menos las reservas propias en ese horario.
// - Entran las confirmadas y las pendientes (las dos ocupan lugar).
// - En las confirmadas que ya empezaron aparece "Clase dada" (017).

export default function AgendaAdmin({ profesorId }) {
    // { profesorId }: el id del profesor que inició sesión (lo pasa page.js).
    const [lunes, setLunes] = useState(lunesDeEstaSemana);
    // La agenda arranca en la semana actual (Horarios, en la que viene).
    const [horarios, setHorarios] = useState([]);
    const [reservas, setReservas] = useState([]);
    const [otroProfesor, setOtroProfesor] = useState("el otro profesor");
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [trabajando, setTrabajando] = useState(null);
    // El id de la reserva que se está marcando (para deshabilitar su botón).
    const [version, setVersion] = useState(0);
    // Igual que en HorariosAdmin: cambiarlo pide volver a leer todo.
    const [ahora, setAhora] = useState(0);
    // La hora en que se cargó la agenda (en milisegundos). React no deja
    // llamar a Date.now() mientras dibuja: cada dibujo daría un valor
    // distinto. Por eso se guarda una vez, al cargar.

    const domingo = sumarDias(lunes, 6);

    useEffect(() => {
        async function cargarOtroProfesor() {
            const { data } = await supabase
                .from("profesores")
                .select("nombre")
                .neq("id", profesorId)
                // .neq = distinto de (not equal): el profesor que NO soy yo.
                .limit(1)
                .maybeSingle();
            if (data) setOtroProfesor(data.nombre);
            // Si no se pudo leer, queda "el otro profesor".
        }

        cargarOtroProfesor();
    }, [profesorId]);

    useEffect(() => {
        async function cargar() {
            setCargando(true);
            setError(null);

            // 1. Los horarios de la semana (lectura pública, 003).
            const { data: delaSemana, error: errorHorarios } = await supabase
                .from("disponibilidad")
                .select("id, fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos")
                .gte("fecha", lunes)
                .lte("fecha", domingo)
                .order("fecha")
                .order("hora");

            if (errorHorarios) {
                setError("No se pudo cargar la agenda.");
                setCargando(false);
                return;
            }

            // 2. Mis reservas en esos horarios.
            const ids = delaSemana.map((h) => h.id);
            let mias = [];
            if (ids.length > 0) {
                const { data, error: errorReservas } = await supabase
                    .from("reservas")
                    .select("id, nombre, apellido, materia, estado, dada_en, reserva_horarios!inner(disponibilidad_id)")
                    // !inner: trae solo las reservas que tienen al menos un
                    // horario que cumpla el filtro de abajo (sin !inner traería
                    // todas, con la lista de horarios vacía).
                    .in("estado", ["pendiente_pago", "confirmado"])
                    // .in(columna, lista): el valor tiene que ser uno de la lista.
                    .in("reserva_horarios.disponibilidad_id", ids);
                    // Filtro sobre la tabla de adentro: solo los horarios de esta semana.

                if (errorReservas) {
                    setError("No se pudieron cargar las reservas de la agenda.");
                    setCargando(false);
                    return;
                }
                mias = data;
            }

            setHorarios(delaSemana);
            setReservas(mias);
            setAhora(Date.now());
            // Acá sí se puede: estamos en un useEffect, no dibujando.
            setCargando(false);
        }

        cargar();
    }, [lunes, domingo, version]);

    function cambiarSemana(semanas) {
        setLunes(sumarDias(lunes, semanas * 7));
    }

    // Para cada reserva, cuál es su primer horario: el botón "Clase dada"
    // va solo ahí (si no, una reserva de 3 horas tendría 3 botones).
    const horaPorId = {};
    for (const h of horarios) horaPorId[h.id] = h;
    // horaPorId: { "id-del-horario": { fecha, hora, ... } }, para buscar
    // un horario por su id sin recorrer toda la lista.

    const primerHorario = {};
    for (const r of reservas) {
        const suyos = r.reserva_horarios
            .map((rh) => horaPorId[rh.disponibilidad_id])
            .filter(Boolean)
            .sort((a, b) => a.hora.localeCompare(b.hora));
            // localeCompare compara textos; "09:00" va antes que "14:00"
            // porque las horas siempre tienen 2 dígitos.
        if (suyos.length > 0) primerHorario[r.id] = suyos[0];
    }

    function yaEmpezo(reserva) {
        const h = primerHorario[reserva.id];
        if (!h) return false;
        return new Date(`${h.fecha}T${h.hora}`).getTime() <= ahora;
        // Sin "Z" al final, JavaScript lo toma en la hora de la compu (Argentina).
    }

    async function marcarDada(reserva, dada) {
        if (!dada && !window.confirm(`¿Desmarcar la clase de ${reserva.nombre} ${reserva.apellido}?`)) return;

        setTrabajando(reserva.id);
        setError(null);
        const { error } = await supabase.rpc("marcar_clase_dada", {
            p_reserva_id: reserva.id,
            p_dada: dada,
        });
        setTrabajando(null);
        if (error) setError(error.message);
        setVersion((v) => v + 1);
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-lg text-left">
        <div className="flex items-center justify-between">
            <button
            onClick={() => cambiarSemana(-1)}
            aria-label="Semana anterior"
            className="px-3 py-1 rounded-lg border border-borde bg-suave text-acento-hover hover:bg-borde"
            >
            ←
            </button>
            <h2 className="text-xl font-bold text-center">
            Semana del {formatearDia(lunes)} al {formatearDia(domingo)}
            </h2>
            <button
            onClick={() => cambiarSemana(1)}
            aria-label="Semana siguiente"
            className="px-3 py-1 rounded-lg border border-borde bg-suave text-acento-hover hover:bg-borde"
            >
            →
            </button>
        </div>

        {lunes !== lunesDeEstaSemana() && (
            <button onClick={() => setLunes(lunesDeEstaSemana())} className="underline text-sm self-center">
            Volver a esta semana
            </button>
        )}

        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        {cargando && <p>Cargando...</p>}
        {!cargando && horarios.length === 0 && <p className="text-sm">No hay horarios cargados esta semana.</p>}

        {!cargando &&
            DIAS.map((nombre, i) => {
            const fecha = sumarDias(lunes, i);
            const delDia = horarios.filter((h) => h.fecha === fecha);
            if (delDia.length === 0) return null;
            return (
                <div key={fecha} className="flex flex-col gap-2">
                <p className="font-medium">
                    {nombre} {formatearDia(fecha)}
                </p>
                {delDia.map((h) => {
                    const hora = h.hora.slice(0, 5);
                    const enEste = reservas.filter((r) =>
                        r.reserva_horarios.some((rh) => rh.disponibilidad_id === h.id)
                    );
                    // .some(función): true si AL MENOS UNO de la lista cumple.
                    // Acá: las reservas mías que usan este horario.
                    const delOtro = Math.max(0, h.cupo_ocupado - enEste.length);
                    // Los lugares ocupados que no son míos. Math.max(0, ...)
                    // por las dudas, para que nunca dé negativo.

                    return (
                    <div key={h.id} className="bg-superficie border border-borde rounded-lg px-3 py-2 text-sm flex flex-col gap-1">
                        <p className="flex justify-between gap-2">
                        <span className="font-medium">
                            {hora} a {horaFin(hora, h.duracion_minutos)}
                        </span>
                        <span>
                            {h.cupo_ocupado}/{h.cupo_maximo} ocupados
                        </span>
                        </p>

                        {h.cupo_ocupado === 0 && <p className="text-texto/70">Libre</p>}

                        {enEste.length > 0 && (
                        <ul className="flex flex-col gap-1">
                            {enEste.map((r) => {
                            const esElPrimero = primerHorario[r.id]?.id === h.id;
                            const puedeMarcar = r.estado === "confirmado" && esElPrimero && yaEmpezo(r);
                            return (
                                <li key={r.id} className="flex flex-wrap justify-between items-center gap-2">
                                <span>
                                    {r.nombre} {r.apellido} · {r.materia}
                                    {r.estado === "pendiente_pago" && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-suave border border-borde">
                                        pendiente
                                    </span>
                                    )}
                                </span>
                                {puedeMarcar && !r.dada_en && (
                                    <button
                                    onClick={() => marcarDada(r, true)}
                                    disabled={trabajando === r.id}
                                    className="px-3 py-1 rounded-lg bg-acento text-white hover:bg-acento-hover transition disabled:opacity-60"
                                    >
                                    Clase dada
                                    </button>
                                )}
                                {esElPrimero && r.dada_en && (
                                    <span className="flex items-center gap-2">
                                    <span className="font-medium">✓ Dada</span>
                                    <button
                                        onClick={() => marcarDada(r, false)}
                                        disabled={trabajando === r.id}
                                        className="underline text-xs disabled:opacity-60"
                                    >
                                        Desmarcar
                                    </button>
                                    </span>
                                )}
                                </li>
                            );
                            })}
                        </ul>
                        )}

                        {delOtro > 0 && (
                        <p className="text-texto/70">
                            {enEste.length > 0 ? "y " : ""}
                            {delOtro} alumno{delOtro === 1 ? "" : "s"} de {otroProfesor}
                        </p>
                        )}
                    </div>
                    );
                })}
                </div>
            );
            })}
        </div>
    );
}
