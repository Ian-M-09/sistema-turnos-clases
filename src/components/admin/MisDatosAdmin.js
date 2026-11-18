"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Sección "Mis datos" del panel: cada profesor cambia su nombre, su
// precio por hora y los datos de su cuenta. Lo que se guarda acá es lo
// que ve el alumno en el paso del pago. La base (014) solo le deja
// cambiar SU fila y estas columnas.

export default function MisDatosAdmin({ profesorId, onNombreCambiado }) {
    // onNombreCambiado: avisa al panel para que el "Hola, ..." se actualice.
    const [form, setForm] = useState(null);
    // null mientras se cargan los datos.
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from("profesores")
                .select("nombre, precio_por_hora, cbu, alias, titular")
                .eq("id", profesorId)
                .single();

            if (error) {
                setError("No se pudieron cargar tus datos.");
                return;
            }
            setForm({ ...data, precio_por_hora: String(Number(data.precio_por_hora)) });
            // El precio llega como "15000.00"; Number lo pasa a 15000 y
            // String de vuelta a texto ("15000") para mostrarlo en el campo.
        }

        cargar();
    }, [profesorId]);

    function cambiarCampo(campo, valor) {
        setForm({ ...form, [campo]: valor });
    }

    async function handleGuardar(e) {
        e.preventDefault();
        setMensaje(null);
        setError(null);

        const datos = {
            nombre: form.nombre.trim(),
            precio_por_hora: Number(form.precio_por_hora),
            cbu: form.cbu,
            alias: form.alias.trim(),
            titular: form.titular.trim(),
        };

        // Las mismas reglas que los checks de 014, para avisar antes de enviar.
        if (!datos.nombre || !datos.titular) {
            setError("Completá tu nombre y el titular de la cuenta.");
            return;
        }
        if (!Number.isInteger(datos.precio_por_hora) || datos.precio_por_hora <= 0) {
            // Number.isInteger: true si es un número entero (sin coma).
            setError("El precio tiene que ser un número entero mayor que 0, sin puntos.");
            return;
        }
        if (!/^[0-9]{22}$/.test(datos.cbu)) {
            setError("El CBU o CVU tiene que tener 22 números.");
            return;
        }
        if (!/^[A-Za-z0-9.-]{6,20}$/.test(datos.alias)) {
            setError("El alias tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones.");
            return;
        }

        setGuardando(true);
        const { data, error } = await supabase
            .from("profesores")
            .update(datos)
            .eq("id", profesorId)
            .select("id");
        // .select() después de .update() pide que devuelva las filas que
        // cambió. Si las políticas no dejaran cambiar nada, no da error:
        // devuelve una lista vacía. Así nos damos cuenta.
        setGuardando(false);

        if (error || data.length === 0) {
            setError("No se pudieron guardar los cambios. Probá de nuevo.");
            return;
        }
        setMensaje("Datos guardados. Los alumnos ya ven los nuevos en el paso del pago.");
        onNombreCambiado(datos.nombre);
    }

    if (!form) {
        return error ? <p role="alert" className="text-red-700 font-medium">{error}</p> : <p>Cargando tus datos...</p>;
    }

    const precio = Number(form.precio_por_hora);

    return (
        <form onSubmit={handleGuardar} className="flex flex-col gap-4 w-full max-w-lg text-left bg-superficie border border-borde rounded-lg p-4">
        <h2 className="text-xl font-bold">Mis datos</h2>

        <label className="flex flex-col text-sm font-medium">
            Tu nombre (aparece en el saludo del panel)
            <input
            value={form.nombre}
            onChange={(e) => cambiarCampo("nombre", e.target.value)}
            className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
            required
            />
        </label>

        <label className="flex flex-col text-sm font-medium">
            Precio por hora de clase ($)
            <input
            inputMode="numeric"
            value={form.precio_por_hora}
            onChange={(e) => cambiarCampo("precio_por_hora", e.target.value.replace(/[^0-9]/g, ""))}
            className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
            required
            />
            {precio > 0 && (
            <span className="mt-1 font-normal text-texto/70">
                1 hora: ${precio.toLocaleString("es-AR")} · media hora: $
                {Math.round(precio / 2).toLocaleString("es-AR")}
            </span>
            // Vista previa de cuánto paga el alumno (la media hora paga la mitad).
            )}
        </label>

        <label className="flex flex-col text-sm font-medium">
            CBU o CVU (22 números)
            <input
            inputMode="numeric"
            value={form.cbu}
            onChange={(e) => cambiarCampo("cbu", e.target.value.replace(/[^0-9]/g, "").slice(0, 22))}
            className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
            required
            />
        </label>

        <label className="flex flex-col text-sm font-medium">
            Alias
            <input
            value={form.alias}
            onChange={(e) => cambiarCampo("alias", e.target.value)}
            className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
            required
            />
        </label>

        <label className="flex flex-col text-sm font-medium">
            Titular de la cuenta
            <input
            value={form.titular}
            onChange={(e) => cambiarCampo("titular", e.target.value)}
            className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
            required
            />
        </label>

        {mensaje && <p className="font-medium">{mensaje}</p>}
        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <button
            type="submit"
            disabled={guardando}
            className="vidrio px-6 py-3 disabled:opacity-60"
        >
            {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
        <p className="text-sm text-texto/70">
            Las reservas que ya están hechas no cambian de precio: el monto se
            guarda al reservar.
        </p>
        </form>
    );
}
