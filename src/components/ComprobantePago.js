"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// El depósito por hora, el CBU, el alias y el titular ya no están escritos
// acá: se leen de la tabla configuracion de Supabase. Así los datos reales
// de la cuenta no quedan en el repo público y la profesora los puede
// cambiar sin tocar el código.

export default function ComprobantePago({ minutos, onConfirmar }) {
    const [comprobante, setComprobante] = useState(null);
    const [config, setConfig] = useState(null);
    // config guarda la fila de configuracion; null mientras no llegó.
    const [errorCarga, setErrorCarga] = useState(null);

    useEffect(() => {
        async function cargarConfiguracion() {
            const { data, error } = await supabase
                .from("configuracion")
                .select("deposito_por_hora, cbu, alias, titular")
                .single();
            // .single() pide exactamente una fila y la devuelve como objeto
            // (no como lista). La tabla siempre tiene una sola fila.

            if (error) {
                setErrorCarga("No se pudieron cargar los datos de pago. Probá de nuevo más tarde.");
                return;
            }
            setConfig(data);
        }

        cargarConfiguracion();
    }, []);

    if (errorCarga) {
        return <p className="text-center">{errorCarga}</p>;
    }
    if (!config) {
        return <p className="text-center">Cargando datos de pago...</p>;
        // "!config" es true cuando config todavía es null.
    }

    const depositoPorHora = Number(config.deposito_por_hora);
    // Supabase devuelve las columnas numeric como texto ("15000.00") para
    // no perder precisión. Number() lo convierte en número para hacer cuentas.
    const montoTotal = Math.round((depositoPorHora * minutos) / 60);
    // El depósito es proporcional al tiempo: para 3 h 30 min (210 minutos)
    // da 15000 * 210 / 60 = 52500. "*" multiplica y "/" divide.
    // Math.round redondea al entero más cercano, por si la cuenta da decimales.
    // Es solo para mostrar: el monto que se guarda lo calcula la base (A2).

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
                {depositoPorHora.toLocaleString("es-AR")}
            </p>
            )}
            {/* .toLocaleString("es-AR") formatea con estilo argentino: 17500 →
                "17.500" y 3.5 → "3,5". "!==" significa "distinto de": la línea
                de la cuenta solo aparece cuando no es exactamente 1 hora. */}
            <p className="text-sm">
            Alias: <strong>{config.alias}</strong>
            </p>
            <p className="text-sm">
            CBU: <strong>{config.cbu}</strong>
            </p>
            <p className="text-sm">
            Nombre: <strong>{config.titular}</strong>
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
