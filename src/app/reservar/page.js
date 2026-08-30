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

    function handleSeleccionarHorario(fecha, hora) {
        setTurnoElegido({ fecha, hora });
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
        <main className="flex flex-col items-center justify-center flex-1 text-center p-8 gap-6">
        <h1 className="text-3xl font-bold">Reservar un turno</h1>

        {paso === "calendario" && (
            <Calendario onSeleccionarHorario={handleSeleccionarHorario} />
        )}

        {paso === "datos" && (
            <div className="flex flex-col items-center gap-4">
            <p className="text-lg">
                Turno elegido: <strong>{turnoElegido.fecha}</strong> a las{" "}
                <strong>{turnoElegido.hora}</strong>
            </p>
            <button
                onClick={() => setPaso("calendario")}
                className="text-blue-600 hover:underline text-sm"
            >
                Cambiar horario
            </button>
            <FormularioAlumno turno={turnoElegido} onContinuar={handleContinuarDatos} />
            </div>
        )}

        {paso === "pago" && (
            <ComprobantePago onConfirmar={handleConfirmarPago} />
        )}

        {paso === "listo" && (
            <p className="text-lg">
            ¡Listo! Tu turno quedó pendiente de confirmación por parte de la profesora.
            </p>
        )}

        {paso !== "listo" && (
            <Link href="/" className="text-blue-600 hover:underline">
            ← Volver al inicio
            </Link>
        )}
        </main>
    );
}