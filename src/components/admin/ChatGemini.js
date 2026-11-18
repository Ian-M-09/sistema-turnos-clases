"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// El chat con Gemini de UNA reserva (pasos E2 y E3). Se abre desde las
// próximas clases en Reservas. Lee el historial de la tabla chats
// (política de 020) y, para hablar con Gemini, llama a la Edge Function
// "gemini" de Supabase (supabase/functions/gemini/index.ts), donde está
// la clave secreta.

export default function ChatGemini({ reservaId }) {
    const [historial, setHistorial] = useState(null);
    // null = cargando; [] = todavía no se generó nada.
    const [pedido, setPedido] = useState("");
    const [esperando, setEsperando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from("chats")
                .select("historial")
                .eq("reserva_id", reservaId)
                .maybeSingle();
            if (error) {
                setError("No se pudo cargar el chat.");
                setHistorial([]);
                return;
            }
            setHistorial(data?.historial ?? []);
        }

        cargar();
    }, [reservaId]);

    async function pedirAGemini(mensaje) {
        setEsperando(true);
        setError(null);

        const { data, error: errorFuncion } = await supabase.functions.invoke("gemini", {
            body: { reservaId, mensaje },
        });
        // functions.invoke: llama a la Edge Function y le manda solo el token
        // de la sesión, para que hable con la base como este profesor.
        // error: errorFuncion: guarda "error" con otro nombre, porque este
        // componente ya tiene un estado llamado error.

        if (errorFuncion) {
            let texto = "No se pudo conectar con el servidor.";
            if (errorFuncion.context?.json) {
                // context: la respuesta de la función, cuando llegó a contestar.
                // ?.: si no existe (por ejemplo, sin internet), no sigue.
                try {
                    const resultado = await errorFuncion.context.json();
                    texto = resultado.error ?? "Algo salió mal. Probá de nuevo.";
                } catch {
                    texto = "Algo salió mal. Probá de nuevo.";
                    // catch: la respuesta no era JSON.
                }
            }
            setError(texto);
        } else {
            setHistorial(data.historial);
            setPedido("");
        }
        setEsperando(false);
    }

    function handleEnviar(e) {
        e.preventDefault();
        if (!pedido.trim()) return;
        pedirAGemini(pedido);
    }

    if (historial === null) return <p className="text-sm">Cargando chat...</p>;

    return (
        <div className="flex flex-col gap-3 border-t border-borde pt-3">
        <p className="text-xs text-texto/70">
            A Gemini se le mandan la materia, el año, las notas y los apuntes; nunca el
            nombre ni el teléfono. Revisá el material antes de usarlo.
        </p>

        {historial.length === 0 && (
            <button
            onClick={() => pedirAGemini("")}
            disabled={esperando}
            className="self-start bg-acento text-white px-4 py-2 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
            >
            {esperando ? "Generando (puede tardar un poco)..." : "Generar material"}
            </button>
        )}

        {historial.map((m, i) => (
            <div
            key={i}
            // key={i}: acá sirve el número de posición porque los mensajes
            // solo se agregan al final (nunca se reordenan ni se borran).
            className={m.rol === "user" ? "self-end bg-suave border border-borde rounded-lg px-3 py-2 max-w-[85%]" : "bg-superficie"}
            >
            {m.inicial ? (
                <p className="text-xs italic">Pedido inicial del material</p>
            ) : (
                <p className="whitespace-pre-wrap">{m.texto}</p>
                // whitespace-pre-wrap: respeta los saltos de línea del texto
                // (sin esto, todo el material saldría en un solo párrafo).
            )}
            </div>
        ))}

        {historial.length > 0 && (
            <form onSubmit={handleEnviar} className="flex flex-col gap-2">
            <label htmlFor={`pedido-${reservaId}`} className="text-sm font-medium">
                Pedile un ajuste
            </label>
            <textarea
                id={`pedido-${reservaId}`}
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder='Por ejemplo: "más fácil" o "agregá un ejemplo con fracciones"'
                className="border border-borde rounded-lg px-3 py-2 bg-superficie"
            />
            <button
                type="submit"
                disabled={esperando || !pedido.trim()}
                className="self-start bg-acento text-white px-4 py-2 rounded-lg hover:bg-acento-hover transition disabled:opacity-60"
            >
                {esperando ? "Esperando a Gemini..." : "Enviar"}
            </button>
            </form>
        )}

        {error && (
            <p role="alert" className="text-red-700 font-medium text-sm">
            {error}
            </p>
        )}
        </div>
    );
}
