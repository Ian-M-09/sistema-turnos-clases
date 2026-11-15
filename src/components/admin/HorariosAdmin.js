"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Sección "Horarios" del panel: cargar los horarios de una semana por
// rangos (un "desde / hasta" por día) y dar de baja horarios sin reservas.
// Todo pasa por las funciones de 011 (cargar_horarios y dar_de_baja_horario).

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function aTexto(fecha) {
    // Convierte un Date en "2026-11-16" (el formato que usa la base).
    const a = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${a}-${m}-${d}`;
}

function sumarDias(texto, dias) {
    const fecha = new Date(`${texto}T00:00`);
    // "T00:00" para que JavaScript lo tome como medianoche en la hora local
    // (sin la hora, lo tomaría en UTC y podría correrse un día).
    fecha.setDate(fecha.getDate() + dias);
    // setDate con un número más grande que el mes pasa solo al mes siguiente
    // (el 31 + 1 da el 1 del mes que viene).
    return aTexto(fecha);
}

function proximoLunes() {
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    // getDay(): 0 = domingo, 1 = lunes, ..., 6 = sábado.
    const faltan = diaSemana === 0 ? 1 : 8 - diaSemana;
    // Cuántos días faltan para el próximo lunes (si hoy es lunes, el de la
    // semana que viene, porque la profesora carga la semana siguiente).
    return sumarDias(aTexto(hoy), faltan);
}

function formatearDia(texto) {
    // "2026-11-16" → "16/11".
    const [, m, d] = texto.split("-");
    // La coma inicial salta el primer elemento (el año): no lo usamos.
    return `${d}/${m}`;
}

function horaFin(hora, minutos) {
    // "14:00" y 60 → "15:00".
    const [h, m] = hora.split(":").map(Number);
    const total = h * 60 + m + minutos;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const RANGOS_VACIOS = DIAS.map(() => ({ desde: "", hasta: "" }));
// Una lista de 7 objetos, uno por día, con el rango vacío.

export default function HorariosAdmin() {
    const [lunes, setLunes] = useState(proximoLunes);
    // useState(función): React llama a la función una sola vez para el
    // valor inicial (sin paréntesis: le pasamos la función, no su resultado).
    const [rangos, setRangos] = useState(RANGOS_VACIOS);
    const [horarios, setHorarios] = useState([]);
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);
    const [trabajando, setTrabajando] = useState(false);

    const domingo = sumarDias(lunes, 6);

    const [version, setVersion] = useState(0);
    // Un contador que solo sirve para pedir que se vuelva a leer la lista:
    // cada vez que cambia (después de cargar o dar de baja), el useEffect
    // de abajo vuelve a correr.

    function recargarLista() {
        setVersion((v) => v + 1);
        // setVersion(función): React le pasa el valor actual (v) y guarda lo
        // que devuelve. Es la forma segura de sumar a partir del valor anterior.
    }

    useEffect(() => {
        async function cargarLista() {
            const { data, error } = await supabase
                .from("disponibilidad")
                .select("id, fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos")
                .gte("fecha", lunes)
                .lte("fecha", domingo)
                // .gte = mayor o igual (greater than or equal); .lte = menor o igual.
                // Solo los horarios de la semana que se está mirando.
                .order("fecha")
                .order("hora");
    
            if (error) {
                setError("No se pudieron cargar los horarios.");
                return;
            }
            setHorarios(data);
        }

        cargarLista();
    }, [lunes, domingo, version]);
    // Se vuelve a correr cuando cambia la semana o cuando se pide recargar.

    function cambiarSemana(semanas) {
        setLunes(sumarDias(lunes, semanas * 7));
        setRangos(RANGOS_VACIOS);
        setMensaje(null);
        setError(null);
    }

    function cambiarRango(indice, campo, valor) {
        // campo es "desde" o "hasta".
        setRangos(rangos.map((r, i) => (i === indice ? { ...r, [campo]: valor } : r)));
        // Armamos una lista nueva: el día que cambió lleva el valor nuevo y
        // los demás quedan igual. { ...r, [campo]: valor } copia el objeto y
        // pisa solo esa clave ([campo] usa el valor de la variable como nombre).
    }

    async function handleCargar(e) {
        e.preventDefault();
        setMensaje(null);
        setError(null);

        const dias = rangos
            .map((r, i) => ({ ...r, fecha: sumarDias(lunes, i), nombre: DIAS[i] }))
            .filter((r) => r.desde || r.hasta);
        // Solo los días donde se escribió algo.

        if (dias.length === 0) {
            setError("Completá el horario de al menos un día.");
            return;
        }
        const incompleto = dias.find((r) => !r.desde || !r.hasta);
        if (incompleto) {
            setError(`Al ${incompleto.nombre} le falta el horario de inicio o el de fin.`);
            return;
        }

        setTrabajando(true);
        let creados = 0;
        let huboError = false;
        // Variable local: el estado "error" no se actualiza hasta el próximo
        // dibujo, así que acá no serviría para saber si falló.
        for (const dia of dias) {
            const { data, error } = await supabase.rpc("cargar_horarios", {
                p_fecha: dia.fecha,
                p_desde: dia.desde,
                p_hasta: dia.hasta,
            });
            if (error) {
                setError(`${dia.nombre} ${formatearDia(dia.fecha)}: ${error.message}`);
                // Los días anteriores ya quedaron cargados; se cortan los que siguen.
                huboError = true;
                break;
            }
            creados += data;
            // data es lo que devuelve la función: cuántos horarios creó.
        }
        setTrabajando(false);

        if (creados > 0) {
            setMensaje(`Se cargaron ${creados} horario${creados === 1 ? "" : "s"}.`);
            if (!huboError) setRangos(RANGOS_VACIOS);
            // Si algo falló, dejamos los rangos escritos para poder corregirlos.
        } else if (!huboError) {
            setMensaje("Esos horarios ya estaban cargados.");
        }
        recargarLista();
    }

    async function darDeBaja(horario) {
        const seguro = window.confirm(
            `¿Dar de baja el horario del ${formatearDia(horario.fecha)} a las ${horario.hora.slice(0, 5)}?`
        );
        // window.confirm muestra una ventanita con Aceptar y Cancelar, y
        // devuelve true si se tocó Aceptar.
        if (!seguro) return;

        setMensaje(null);
        setError(null);
        const { error } = await supabase.rpc("dar_de_baja_horario", { p_id: horario.id });
        if (error) {
            setError(error.message);
        } else {
            setMensaje("Horario dado de baja.");
        }
        recargarLista();
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

        <form onSubmit={handleCargar} className="flex flex-col gap-3 bg-superficie border border-borde rounded-lg p-4">
            <h3 className="font-medium">Cargar horarios</h3>
            <p className="text-sm text-texto/70">
            Dejá vacíos los días que no das clase. Se arman horarios de 1 hora; si
            al final sobra media hora, se agrega la media hora final.
            </p>
            {DIAS.map((nombre, i) => (
            <div key={nombre} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[8rem_auto_auto] items-center gap-2">
                {/* grid-cols-[...]: tres columnas; la primera ocupa el lugar que
                    sobra (1fr) y las otras dos lo justo (auto). */}
                <span className="text-sm">
                {nombre} {formatearDia(sumarDias(lunes, i))}
                </span>
                <input
                type="time"
                step={1800}
                // step={1800}: de a 1800 segundos (30 minutos) en el selector.
                aria-label={`${nombre}: desde`}
                value={rangos[i].desde}
                onChange={(e) => cambiarRango(i, "desde", e.target.value)}
                className="border border-borde rounded-lg px-2 py-1 bg-superficie"
                />
                <input
                type="time"
                step={1800}
                aria-label={`${nombre}: hasta`}
                value={rangos[i].hasta}
                onChange={(e) => cambiarRango(i, "hasta", e.target.value)}
                className="border border-borde rounded-lg px-2 py-1 bg-superficie"
                />
            </div>
            ))}
            <button
            type="submit"
            disabled={trabajando}
            className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
            >
            {trabajando ? "Cargando..." : "Cargar horarios"}
            </button>
        </form>

        {mensaje && <p className="font-medium">{mensaje}</p>}
        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <div className="flex flex-col gap-3">
            <h3 className="font-medium">Horarios de esta semana</h3>
            {horarios.length === 0 && <p className="text-sm">No hay horarios cargados.</p>}
            {DIAS.map((nombre, i) => {
            const fecha = sumarDias(lunes, i);
            const delDia = horarios.filter((h) => h.fecha === fecha);
            if (delDia.length === 0) return null;
            // return null: React no dibuja nada para ese día.
            return (
                <div key={fecha}>
                <p className="font-medium mb-1">
                    {nombre} {formatearDia(fecha)}
                </p>
                <ul className="flex flex-col gap-1">
                    {delDia.map((h) => {
                    const hora = h.hora.slice(0, 5);
                    const tieneReservas = h.cupo_ocupado > 0;
                    return (
                        <li
                        key={h.id}
                        className="flex justify-between items-center gap-2 bg-superficie border border-borde rounded-lg px-3 py-2 text-sm"
                        >
                        <span>
                            {hora} a {horaFin(hora, h.duracion_minutos)} · {h.cupo_ocupado}/{h.cupo_maximo} ocupados
                        </span>
                        <button
                            onClick={() => darDeBaja(h)}
                            disabled={tieneReservas}
                            title={tieneReservas ? "Tiene reservas: no se puede dar de baja" : undefined}
                            // title: el textito que aparece al dejar el mouse encima.
                            className="underline shrink-0 disabled:no-underline disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Dar de baja
                        </button>
                        </li>
                    );
                    })}
                </ul>
                </div>
            );
            })}
        </div>
        </div>
    );
}
