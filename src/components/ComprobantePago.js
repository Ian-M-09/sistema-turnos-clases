"use client";

import { useState } from "react";

const CBU_PROFESORA = "0070173630004126905435";
const ALIAS_PROFESORA = "gcread";
const NOMBRE = "Guillermina Cruz Read";
const MONTO_DEPOSITO_POR_HORA = 15000;
// Ahora es un número (sin comillas) para poder multiplicarlo.
// Sigue siendo un valor de prueba hasta que la profesora confirme el monto.

export default function ComprobantePago({ minutos, onConfirmar }) {
    const [comprobante, setComprobante] = useState(null);

    const montoTotal = Math.round((MONTO_DEPOSITO_POR_HORA * minutos) / 60);
    // El depósito es proporcional al tiempo: para 3 h 30 min (210 minutos)
    // da 5000 * 210 / 60 = 17500. "*" multiplica y "/" divide.
    // Math.round redondea al entero más cercano, por si la cuenta da decimales.

    function handleSubmit(e) {
        e.preventDefault();
        onConfirmar({ comprobante });
    }

    return (
        <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-md text-left"
        >
        <div className="bg-superficie border border-borde rounded-lg p-4 text-center">
            <p className="font-medium mb-1">
            Transferir depósito de ${montoTotal.toLocaleString("es-AR")}
            </p>
            {minutos !== 60 && (
            <p className="text-sm mb-1">
                {(minutos / 60).toLocaleString("es-AR")} horas × $
                {MONTO_DEPOSITO_POR_HORA.toLocaleString("es-AR")}
            </p>
            )}
            {/* .toLocaleString("es-AR") formatea con estilo argentino: 17500 →
                "17.500" y 3.5 → "3,5". "!==" significa "distinto de": la línea
                de la cuenta solo aparece cuando no es exactamente 1 hora. */}
            <p className="text-sm">
            Alias: <strong>{ALIAS_PROFESORA}</strong>
            </p>
            <p className="text-sm">
            CBU: <strong>{CBU_PROFESORA}</strong>
            </p>
            <p className="text-sm">
            Nombre: <strong>{NOMBRE}</strong>
            </p>
        </div>

        <div className="flex flex-col">
            <label htmlFor="comprobante" className="mb-1 font-medium">
            Subí el comprobante de la transferencia
            </label>
            <input
            id="comprobante"
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setComprobante(e.target.files[0])}
            className="border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <button
            type="submit"
            className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition"
        >
            Confirmar reserva
        </button>
        </form>
    );
}
