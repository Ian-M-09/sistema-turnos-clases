"use client";

import { useState } from "react";

const CBU_PROFESORA = "0000003100000000000000";
const ALIAS_PROFESORA = "profe.clases.mp";
const MONTO_DEPOSITO = "5000";

export default function ComprobantePago({ onConfirmar }) {
    const [comprobante, setComprobante] = useState(null);

    function handleSubmit(e) {
        e.preventDefault();
        onConfirmar({ comprobante });
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md text-left">
        <div className="bg-gray-100 rounded-lg p-4 text-center">
            <p className="font-medium mb-1">Transferir depósito de ${MONTO_DEPOSITO}</p>
            <p className="text-sm">Alias: <strong>{ALIAS_PROFESORA}</strong></p>
            <p className="text-sm">CBU: <strong>{CBU_PROFESORA}</strong></p>
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
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
            Confirmar reserva
        </button>
        </form>
    );
}