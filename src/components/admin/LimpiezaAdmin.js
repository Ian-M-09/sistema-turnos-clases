"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Sección "Limpieza" del panel (paso E4). Muestra qué se puede borrar
// (reservas con más de 30 días y archivos sueltos) y cuántos MB se
// liberan, y tiene el botón para borrarlo. Lo puede usar cualquiera de
// los dos profesores. El trabajo lo hace la ruta /api/limpieza.

async function pedir(metodo) {
    // Hace el pedido a /api/limpieza con el token de la sesión.
    // metodo: "GET" (ver el resumen) o "POST" (borrar).
    const { data } = await supabase.auth.getSession();
    const respuesta = await fetch("/api/limpieza", {
        method: metodo,
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error ?? "Algo salió mal.");
    // throw new Error(...): "lanza" un error; lo atrapa el catch de quien llamó.
    return resultado;
}

export default function LimpiezaAdmin() {
    const [resumen, setResumen] = useState(null);
    const [error, setError] = useState(null);
    const [mensaje, setMensaje] = useState(null);
    const [borrando, setBorrando] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        async function cargar() {
            try {
                setResumen(await pedir("GET"));
            } catch (e) {
                setError(e.message);
            }
        }

        cargar();
    }, [version]);

    const hayAlgo = resumen && (resumen.reservas > 0 || resumen.huerfanos > 0);

    async function handleLimpiar() {
        if (!window.confirm(`Se van a borrar ${resumen.archivosDeReservas + resumen.huerfanos} archivos y ${resumen.chats} chats. No se puede deshacer. ¿Seguir?`)) return;

        setBorrando(true);
        setError(null);
        setMensaje(null);
        try {
            const hecho = await pedir("POST");
            setMensaje(`Listo: se borraron ${hecho.archivosDeReservas + hecho.huerfanos} archivos y ${hecho.chats} chats (${hecho.megas} MB liberados).`);
        } catch (e) {
            setError(e.message);
        }
        setBorrando(false);
        setVersion((v) => v + 1);
        // Volver a pedir el resumen (tendría que quedar en cero).
    }

    return (
        <div className="flex flex-col gap-4 w-full max-w-lg text-left">
        <h2 className="text-xl font-bold">Limpieza de mitad de mes</h2>
        <p className="text-sm text-texto/70">
            De las clases de hace más de 30 días se borran el comprobante, los apuntes
            y el chat de Gemini (la reserva queda en el historial). También se borran
            los archivos que no son de ninguna reserva. Las vencidas que falta
            devolver no se tocan. Así se cuida el espacio gratuito (1 GB).
        </p>

        {!resumen && !error && <p>Cargando...</p>}

        {resumen && (
            <div className="bg-superficie border border-borde rounded-lg p-4 flex flex-col gap-1 text-sm">
            <p>Reservas con más de 30 días: <strong>{resumen.reservas}</strong></p>
            <p>Sus archivos: <strong>{resumen.archivosDeReservas}</strong> · chats: <strong>{resumen.chats}</strong></p>
            <p>Archivos sueltos (sin reserva): <strong>{resumen.huerfanos}</strong></p>
            <p className="font-medium mt-1">Se liberan {resumen.megas} MB.</p>
            </div>
        )}

        {resumen && !hayAlgo && <p>No hay nada para limpiar.</p>}

        {hayAlgo && (
            <button
            onClick={handleLimpiar}
            disabled={borrando}
            className="self-start bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
            >
            {borrando ? "Borrando..." : "Limpiar"}
            </button>
        )}

        {mensaje && <p className="font-medium">{mensaje}</p>}
        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}
        </div>
    );
}
