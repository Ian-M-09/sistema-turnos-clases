"use client";

import { useState } from "react";
import Link from "next/link";
import Calendario from "@/components/Calendario";
import FormularioAlumno from "@/components/FormularioAlumno";
import ComprobantePago from "@/components/ComprobantePago";

export default function Reservar() {
    const [paso, setPaso] = useState("calendario"); // "calendario" | "datos" | "pago" | "listo"
    const [turnoElegido, setTurnoElegido] = useState(null);
    const [datosAlumno, setDatosAlumno] = useState(null);

    function handleConfirmarHorarios(fecha, horarios, resumen, minutosTotales) {
        // Ahora recibe el día, la LISTA de horarios (cada uno con su id), el
        // texto resumen para mostrar y los minutos totales de la reserva.
        setTurnoElegido({ fecha, horarios, resumen, minutosTotales });
        setPaso("datos");
    }

    function handleContinuarDatos(datos) {
        setDatosAlumno(datos);
        setPaso("pago");
    }

    function handleConfirmarPago({ comprobante }) {
        const reservaCompleta = {
        ...turnoElegido,
        ...datosAlumno,
        comprobante,
        };
        console.log("Reserva completa:", reservaCompleta);
        setPaso("listo");
    }

    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-4 sm:p-8 gap-6">
        <h1 className="text-3xl font-bold">Reservar un turno</h1>

        {paso === "calendario" && (
            <Calendario onConfirmarHorarios={handleConfirmarHorarios} />
        )}

        {paso === "datos" && (
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <p className="text-lg">
                Turno elegido: <strong>{turnoElegido.fecha}</strong>,{" "}
                <strong>{turnoElegido.resumen}</strong>
            </p>
            <button
                onClick={() => setPaso("calendario")}
                className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition"
            >
                Cambiar horario
            </button>
            <FormularioAlumno
                turno={turnoElegido}
                onContinuar={handleContinuarDatos}
            />
            </div>
        )}

        {paso === "pago" && (
            <ComprobantePago
            minutos={turnoElegido.minutosTotales}
            onConfirmar={handleConfirmarPago}
            />
        )}

        {paso === "listo" && (
            <p className="text-lg">
            ¡Listo! Tu turno quedó pendiente de confirmación por parte de la
            profesora.
            </p>
        )}

        {paso !== "listo" && (
            <Link
            href="/"
            className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition"
            >
            ← Volver al inicio
            </Link>
        )}
        </main>
    );
}
