"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Formulario de ingreso de los profesores (email y contraseña).
// No hay botón de "crear cuenta": las cuentas las crea Ian en Supabase.

export default function LoginProfesor() {
    const [email, setEmail] = useState("");
    const [contrasenia, setContrasenia] = useState("");
    const [error, setError] = useState(null);
    const [entrando, setEntrando] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setEntrando(true);

        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: contrasenia,
        });
        // supabase.auth.signInWithPassword: le manda el email y la contraseña
        // a Supabase Auth. Si son correctos, Supabase guarda la "sesión" en el
        // navegador y desde ese momento todos los pedidos van como
        // "authenticated". La página /admin se entera sola (onAuthStateChange).

        setEntrando(false);
        if (error) {
            setError("Email o contraseña incorrectos.");
            // No decimos cuál de los dos está mal: así nadie puede averiguar
            // qué emails tienen cuenta.
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm text-left">
        <div className="flex flex-col">
            <label htmlFor="email" className="mb-1 font-medium">
            Email
            </label>
            <input
            id="email"
            type="email"
            // type="email": el navegador revisa que tenga forma de email y en
            // el celular muestra el teclado con @.
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <div className="flex flex-col">
            <label htmlFor="contrasenia" className="mb-1 font-medium">
            Contraseña
            </label>
            <input
            id="contrasenia"
            type="password"
            // type="password": muestra puntitos en vez de las letras.
            autoComplete="current-password"
            // autoComplete: le avisa al navegador qué es cada campo, así puede
            // ofrecer guardar y completar la contraseña.
            value={contrasenia}
            onChange={(e) => setContrasenia(e.target.value)}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <button
            type="submit"
            disabled={entrando}
            className="vidrio px-6 py-3 disabled:opacity-60"
        >
            {entrando ? "Entrando..." : "Entrar"}
        </button>
        </form>
    );
}
