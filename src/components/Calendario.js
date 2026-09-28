"use client";
// Este componente corre en el navegador (usa estado y clics).

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const NOMBRES_MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
// Una constante afuera del componente: nunca cambia, así que no hace
// falta recrearla en cada dibujo. Por convención, las constantes fijas
// se escriben en MAYÚSCULAS. El índice 0 es enero, igual que getMonth().

const MESES_ADELANTE = 2;
// Cuántos meses hacia adelante puede mirar el alumno.
const HORAS_MINIMAS = 24;
// Anticipación mínima para reservar (regla de la profesora).

export default function Calendario({ onSeleccionarHorario }) {
    const hoy = new Date();
    // new Date() sin argumentos crea la fecha y hora de este momento.

    const [anio, setAnio] = useState(hoy.getFullYear());
    // getFullYear() devuelve el año actual (2026).
    const [mes, setMes] = useState(hoy.getMonth());
    // getMonth() devuelve el mes actual de 0 a 11. Ahora el mes es estado:
    // cuando cambia, React vuelve a dibujar el calendario.
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);
    const [disponibilidad, setDisponibilidad] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState(null);

    useEffect(() => {
        async function cargarDisponibilidad() {
        const { data, error } = await supabase
            .from("disponibilidad")
            .select("id, fecha, hora, cupo_maximo, cupo_ocupado")
            .order("fecha", { ascending: true })
            .order("hora", { ascending: true });

        if (error) {
            setErrorCarga("No se pudieron cargar los horarios. Probá de nuevo más tarde.");
            setCargando(false);
            return;
        }

        const limite = Date.now() + HORAS_MINIMAS * 60 * 60 * 1000;
        // Date.now() devuelve el momento actual en milisegundos.
        // Sumamos 24 horas: horas * 60 min * 60 seg * 1000 ms.
        // Todo horario anterior a "limite" ya no se puede reservar.

        const disponibles = data.filter((fila) => {
            // .filter conserva solo las filas para las que la función
            // devuelve true. Ahora la función tiene varias líneas, por eso
            // lleva llaves { } y un return explícito.
            const hayLugar = fila.cupo_ocupado < fila.cupo_maximo;
            // Da true si todavía quedan lugares.
            const momentoClase = new Date(`${fila.fecha}T${fila.hora}`).getTime();
            // Armamos un texto como "2026-09-29T10:00:00" (las comillas
            // invertidas ` ` permiten meter variables con ${ }).
            // Sin zona horaria escrita, JavaScript lo toma en la hora local
            // del navegador. .getTime() lo pasa a milisegundos para comparar.
            return hayLugar && momentoClase >= limite;
            // && exige que se cumplan las dos condiciones a la vez.
        });

        const agrupado = [];
        disponibles.forEach((fila) => {
            const horario = { id: fila.id, hora: fila.hora.slice(0, 5), lugares: fila.cupo_maximo - fila.cupo_ocupado, };
            //"lugares" es una propiedad nueva del objeto: guarda cuantos lugares libres quedan. se calcula restando el cupo ocupado al maximo
            const diaExistente = agrupado.find((d) => d.fecha === fila.fecha);
            if (diaExistente) {
            diaExistente.horarios.push(horario);
            } else {
            agrupado.push({ fecha: fila.fecha, horarios: [horario] });
            }
        });

        setDisponibilidad(agrupado);
        setCargando(false);
        }

        cargarDisponibilidad();
    }, []);

    const primerDiaDelMes = new Date(anio, mes, 1);
    const diasEnElMes = new Date(anio, mes + 1, 0).getDate();
    const diaDeLaSemanaInicial = primerDiaDelMes.getDay();

    const dias = Array.from({ length: diasEnElMes }, (_, i) => i + 1);
    const espaciosVacios = Array.from({ length: diaDeLaSemanaInicial }, (_, i) => i);

    const diferenciaMeses = (anio - hoy.getFullYear()) * 12 + (mes - hoy.getMonth());
    // Cuántos meses nos alejamos del mes actual. Ejemplo: de diciembre 2026
    // a enero 2027 son (1 * 12) + (0 - 11) = 1 mes. Sirve aunque cambie el año.
    const puedeRetroceder = diferenciaMeses > 0;
    // No se puede ir antes del mes actual.
    const puedeAvanzar = diferenciaMeses < MESES_ADELANTE;

    function cambiarMes(cantidad) {
        // cantidad vale -1 (mes anterior) o 1 (mes siguiente).
        let nuevoMes = mes + cantidad;
        let nuevoAnio = anio;
        // "let" declara una variable que sí se puede reasignar,
        // a diferencia de "const".
        if (nuevoMes < 0) {
        nuevoMes = 11;
        nuevoAnio = anio - 1;
        // Retrocedimos desde enero: pasamos a diciembre del año anterior.
        } else if (nuevoMes > 11) {
        // "else if" prueba otra condición si la anterior fue falsa.
        nuevoMes = 0;
        nuevoAnio = anio + 1;
        // Avanzamos desde diciembre: pasamos a enero del año siguiente.
        }
        setMes(nuevoMes);
        setAnio(nuevoAnio);
        setDiaSeleccionado(null);
        // Al cambiar de mes, se borra el día que estaba elegido.
    }

    function formatearFecha(dia) {
        const mesTexto = String(mes + 1).padStart(2, "0");
        const diaTexto = String(dia).padStart(2, "0");
        return `${anio}-${mesTexto}-${diaTexto}`;
    }

    function tieneDisponibilidad(fechaTexto) {
        return disponibilidad.some((d) => d.fecha === fechaTexto);
        // Los días pasados o a menos de 24 hs quedan sin horarios tras el
        // filtro de arriba, así que no hace falta otra regla para bloquearlos.
    }

    function handleClickDia(dia) {
        const fechaTexto = formatearFecha(dia);
        if (tieneDisponibilidad(fechaTexto)) {
        setDiaSeleccionado(fechaTexto);
        }
    }

    const horariosDelDiaSeleccionado =
        disponibilidad.find((d) => d.fecha === diaSeleccionado)?.horarios ?? [];

    if (cargando) {
        return <p>Cargando horarios...</p>;
    }

    if (errorCarga) {
        return <p className="text-red-600">{errorCarga}</p>;
    }

    return (
        <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
            <button
            onClick={() => cambiarMes(-1)}
            disabled={!puedeRetroceder}
            aria-label="Mes anterior"
            className="px-3 py-1 rounded-lg border disabled:opacity-30 disabled:cursor-not-allowed"
            >
            ←
            </button>
            {/* aria-label le da un nombre al botón para lectores de pantalla.
                "disabled:" en Tailwind aplica esos estilos solo si el botón
                está deshabilitado. */}

            <h2 className="text-xl font-bold">
            {NOMBRES_MESES[mes]} {anio}
            </h2>
            {/* NOMBRES_MESES[mes] usa el número del mes como posición en la lista. */}

            <button
            onClick={() => cambiarMes(1)}
            disabled={!puedeAvanzar}
            aria-label="Mes siguiente"
            className="px-3 py-1 rounded-lg border disabled:opacity-30 disabled:cursor-not-allowed"
            >
            →
            </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-sm mb-2 font-medium">
            <span>Dom</span>
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
            {espaciosVacios.map((_, i) => (
            <div key={`vacio-${i}`}></div>
            ))}

            {dias.map((dia) => {
            const fechaTexto = formatearFecha(dia);
            const disponible = tieneDisponibilidad(fechaTexto);
            const seleccionado = diaSeleccionado === fechaTexto;

            return (
                <button
                key={dia}
                onClick={() => handleClickDia(dia)}
                disabled={!disponible}
                className={`p-2 rounded-lg text-sm
                    ${disponible ? "bg-blue-100 hover:bg-blue-200 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}
                    ${seleccionado ? "bg-blue-600 text-white" : ""}
                `}
                >
                {dia}
                </button>
            );
            })}
        </div>

        {diaSeleccionado && (
            <div className="mt-6 text-left">
            <h3 className="font-medium mb-2">Horarios disponibles:</h3>
            <div className="flex flex-wrap gap-2">
                {horariosDelDiaSeleccionado.map((h) => (
                <button
                    key={h.id}
                    onClick={() => onSeleccionarHorario(diaSeleccionado, h.hora, h.id)}
                    className="border rounded-lg px-3 py-2 hover:bg-blue-50"
                >
                    {h.hora}
                    {h.lugares === 1 && (<span className="ml-2 text-xs text-orange-600">¡Ultimo lugar!</span> )}
                </button>
                ))}
                {/*en JSX (next.js) los comentarios van asi. h.lugares===1 compara: da true solo si queda exactamente 1 lugar. <span> es una etiqueta de texto en linea, sirve para darle estilo a un pedazo de 
                texto sin cortar la linea. ml-2= margen izquierdo chico, text-xs= letra extra chica, text-organde-600= color naranja (clase de tailwind)*/}
            </div>
            </div>
        )}
        </div>
    );
}