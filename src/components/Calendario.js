"use client";
// "use client" hace que este componente corra en el navegador,
// necesario porque usa useState, useEffect y clics.

import { useState, useEffect } from "react";
// useEffect es el Hook que ejecuta código cuando el componente aparece.
import { supabase } from "@/lib/supabase";
// Traemos la conexión que armamos en src/lib/supabase.js.

export default function Calendario({ onSeleccionarHorario }) {
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);
    const [disponibilidad, setDisponibilidad] = useState([]);
    // Ahora arranca como lista vacía []: se llena con los datos de la base.
    const [cargando, setCargando] = useState(true);
    // true mientras esperamos la respuesta de Supabase.
    const [errorCarga, setErrorCarga] = useState(null);
    // Si algo falla, acá guardamos el mensaje para mostrarlo.

    useEffect(() => {
        // Todo lo de adentro se ejecuta una vez, cuando aparece el calendario.

        async function cargarDisponibilidad() {
        // "async" permite usar "await" adentro. Lo definimos como función
        // aparte porque el useEffect en sí no puede ser async.

        const { data, error } = await supabase
            .from("disponibilidad")
            // .from elige la tabla.
            .select("id, fecha, hora, cupo_maximo, cupo_ocupado")
            // .select pide solo las columnas que nombramos.
            .order("fecha", { ascending: true })
            .order("hora", { ascending: true });
            // .order ordena el resultado. "ascending: true" es de menor a mayor
            // (fechas más cercanas primero, y dentro del día, horas más
            // tempranas primero).
            // "await" pausa la función hasta que llega la respuesta.

        if (error) {
            // "if" ejecuta lo de adentro solo si la condición es verdadera.
            // Acá: si Supabase devolvió un error.
            setErrorCarga("No se pudieron cargar los horarios. Probá de nuevo más tarde.");
            setCargando(false);
            return;
            // "return" corta la función acá, no seguimos con datos rotos.
        }

        const conLugar = data.filter((fila) => fila.cupo_ocupado < fila.cupo_maximo);
        // .filter se queda solo con las filas que cumplen la condición.
        // "=>" define una función corta ("flecha").
        // Acá: solo horarios con lugares libres (aplica la regla de los 5).

        const agrupado = [];
        // Vamos a convertir la lista plana de filas en la forma que ya
        // usaba el calendario: [{ fecha, horarios: [...] }].

        conLugar.forEach((fila) => {
            // .forEach recorre la lista y ejecuta la función una vez por elemento.
            const horario = { id: fila.id, hora: fila.hora.slice(0, 5) };
            // La base devuelve "10:00:00". .slice(0, 5) toma los primeros
            // 5 caracteres para dejar "10:00". Guardamos también el id porque
            // lo vamos a necesitar para crear el turno.
            const diaExistente = agrupado.find((d) => d.fecha === fila.fecha);
            // .find devuelve el primer elemento que cumple la condición,
            // o undefined si no hay ninguno. "===" compara valor y tipo.
            if (diaExistente) {
            diaExistente.horarios.push(horario);
            // .push agrega un elemento al final de la lista.
            } else {
            agrupado.push({ fecha: fila.fecha, horarios: [horario] });
            // "else" es lo que pasa si la condición del if fue falsa:
            // el día no estaba, así que lo creamos con este primer horario.
            }
        });

        setDisponibilidad(agrupado);
        setCargando(false);
        // Guardamos los datos ya ordenados y apagamos el "cargando".
        }

        cargarDisponibilidad();
        // Llamamos a la función que acabamos de definir.
    }, []);
    // El [] del final le dice a useEffect que corra solo una vez.
    // Sin él se ejecutaría en cada actualización del componente.

    const anio = 2026;
    const mes = 8; // Septiembre (0 = enero)

    const primerDiaDelMes = new Date(anio, mes, 1);
    const diasEnElMes = new Date(anio, mes + 1, 0).getDate();
    const diaDeLaSemanaInicial = primerDiaDelMes.getDay();

    const dias = Array.from({ length: diasEnElMes }, (_, i) => i + 1);
    const espaciosVacios = Array.from({ length: diaDeLaSemanaInicial }, (_, i) => i);

    function formatearFecha(dia) {
        const mesTexto = String(mes + 1).padStart(2, "0");
        const diaTexto = String(dia).padStart(2, "0");
        return `${anio}-${mesTexto}-${diaTexto}`;
    }

    function tieneDisponibilidad(fechaTexto) {
        return disponibilidad.some((d) => d.fecha === fechaTexto);
        // .some devuelve true si al menos un elemento cumple la condición.
        // Como "disponibilidad" solo tiene días con horarios libres, alcanza.
    }

    function handleClickDia(dia) {
        const fechaTexto = formatearFecha(dia);
        if (tieneDisponibilidad(fechaTexto)) {
        setDiaSeleccionado(fechaTexto);
        }
    }

    const horariosDelDiaSeleccionado =
        disponibilidad.find((d) => d.fecha === diaSeleccionado)?.horarios ?? [];
    // "?." (optional chaining) evita un error si find no encontró nada:
    // en vez de romper, devuelve undefined.
    // "??" (nullish coalescing) usa lo de la derecha ([]) si lo de la
    // izquierda es undefined o null.

    if (cargando) {
        return <p>Cargando horarios...</p>;
    }
    // Mientras "cargando" sea true, mostramos solo este texto.
    // Estos return van DESPUÉS de todos los Hooks: React exige que los
    // Hooks se llamen siempre en el mismo orden.

    if (errorCarga) {
        return <p className="text-red-600">{errorCarga}</p>;
    }

    return (
        <div className="w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Septiembre 2026</h2>

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
                </button>
                ))}
            </div>
            </div>
        )}
        </div>
    );
}