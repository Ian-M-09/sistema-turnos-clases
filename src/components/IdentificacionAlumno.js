"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Primer paso de /reservar: el alumno pone su DNI y elige la materia.
// La materia define el profesor (y con eso el color de la página y la
// cuenta a depositar). El DNI se verifica con la función
// verificar_alumno de la base (009): solo pueden reservar los alumnos
// que registraron los profesores.

export default function IdentificacionAlumno({ datosIniciales, onCambiarTema, onContinuar }) {
    // onCambiarTema: avisa al padre apenas cambia la materia, así el color
    // cambia en el momento (sin esperar a "Continuar").
    const [materias, setMaterias] = useState([]);
    const [errorCarga, setErrorCarga] = useState(null);
    const [dni, setDni] = useState(datosIniciales?.dni ?? "");
    const [materia, setMateria] = useState(datosIniciales?.materia ?? "");
    const [error, setError] = useState(null);
    const [verificando, setVerificando] = useState(false);

    useEffect(() => {
        async function cargarMaterias() {
            const { data, error } = await supabase
                .from("materias")
                .select("nombre, profesor_id, profesores(tema)")
                // profesores(tema): como materias.profesor_id apunta a la
                // tabla profesores, Supabase puede traer en la misma consulta
                // el tema de ese profesor. Llega como { tema: "azul" }.
                .order("orden", { ascending: true });

            if (error) {
                setErrorCarga("No se pudieron cargar las materias. Probá de nuevo más tarde.");
                return;
            }
            setMaterias(data);
        }

        cargarMaterias();
    }, []);
    // [] al final: el efecto corre una sola vez, cuando aparece el componente.

    function buscarMateria(nombre) {
        return materias.find((m) => m.nombre === nombre);
    }

    function handleMateriaChange(e) {
        setMateria(e.target.value);
        const elegida = buscarMateria(e.target.value);
        onCambiarTema(elegida?.profesores?.tema ?? "rosa");
        // Si vuelve a "Elegí una materia" (elegida es undefined), queda rosa.
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);

        if (!/^[0-9]{7,8}$/.test(dni)) {
            // /^[0-9]{7,8}$/ es una expresión regular: de 7 a 8 números y
            // nada más. .test(texto) da true si el texto cumple el patrón.
            setError("El DNI tiene que tener 7 u 8 números, sin puntos.");
            return;
        }

        setVerificando(true);
        const { data, error } = await supabase.rpc("verificar_alumno", { p_dni: dni });
        setVerificando(false);

        if (error) {
            // Si se pasó el límite de intentos (015), la función manda un
            // mensaje pensado para el alumno y lo mostramos tal cual.
            // .includes("texto") da true si error.message contiene ese texto.
            setError(
                error.message.includes("demasiados intentos")
                    ? error.message
                    : "No se pudo verificar el DNI. Probá de nuevo."
            );
            return;
        }
        if (!data) {
            // La función devuelve null cuando el DNI no está registrado.
            setError("Ese DNI no está registrado. Escribile a tu profesor para que te registre y después volvé a intentar.");
            return;
        }
        if (data.tiene_pendiente) {
            // Solo se puede tener 1 reserva esperando confirmación (015).
            // Avisamos acá para que no elija horario ni suba archivos sin necesidad.
            setError("Ya tenés una reserva esperando que el profesor la confirme. Cuando la confirme o la rechace vas a poder hacer otra.");
            return;
        }

        const elegida = buscarMateria(materia);
        onContinuar({
            dni,
            materia,
            profesorId: elegida.profesor_id,
            inicialAlumno: data.inicial,
            // Solo la inicial (por ejemplo "J."): desde 024 la base ya no
            // devuelve el nombre, para no exponer datos de alumnos menores.
            habilitado: data.habilitado,
            // habilitado es false si el alumno está bloqueado. No se lo
            // decimos: el calendario simplemente le muestra todo sin lugar.
        });
    }

    if (errorCarga) {
        return <p className="text-center">{errorCarga}</p>;
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md text-left">
        <div className="flex flex-col">
            <label htmlFor="dni" className="mb-1 font-medium">
            DNI (sin puntos)
            </label>
            <input
            id="dni"
            type="text"
            inputMode="numeric"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            // Igual que el teléfono: borra todo lo que no sea número y
            // corta en 8 caracteres.
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <div className="flex flex-col">
            <label htmlFor="materia" className="mb-1 font-medium">
            Materia
            </label>
            <select
            id="materia"
            value={materia}
            onChange={handleMateriaChange}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            >
            <option value="">Elegí una materia</option>
            {materias.map((m) => (
                <option key={m.nombre} value={m.nombre}>
                {m.nombre === "Preparación Global 5to (BHM)"
                    ? "Preparación para el Global de 5to (BHM)"
                    : m.nombre}
                </option>
                // La lista ahora sale de la tabla materias. Para el Global se
                // muestra un texto más largo, pero el valor que se guarda es
                // el nombre de la tabla.
            ))}
            </select>
        </div>

        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <button
            type="submit"
            disabled={verificando || materias.length === 0}
            className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
        >
            {verificando ? "Verificando..." : "Continuar"}
        </button>
        </form>
    );
}
