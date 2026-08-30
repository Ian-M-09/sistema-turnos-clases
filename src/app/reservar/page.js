"use client";

import { useState } from "react";
import Link from "next/link";
import Calendario from "@/components/Calendario";
import FormularioAlumno from "@/components/FormularioAlumno";

export default function Reservar() {
    const [turnoElegido, setTurnoElegido] = useState(null);

    function handleSeleccionarHorario(fecha, hora) {
        setTurnoElegido({ fecha, hora });
    }

    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-8 gap-6">
        <h1 className="text-3xl font-bold">Reservar un turno</h1>

        {!turnoElegido && (
            <Calendario onSeleccionarHorario={handleSeleccionarHorario} />
        )}

        {turnoElegido && (
            <div className="flex flex-col items-center gap-4">
            <p className="text-lg">
                Turno elegido: <strong>{turnoElegido.fecha}</strong> a las{" "}
                <strong>{turnoElegido.hora}</strong>
            </p>
            <button
                onClick={() => setTurnoElegido(null)}
                className="text-blue-600 hover:underline text-sm"
            >
                Cambiar horario
            </button>
            <FormularioAlumno turno={turnoElegido} />
            </div>
        )}

        <Link href="/" className="text-blue-600 hover:underline">
            ← Volver al inicio
        </Link>
        </main>
    );
}