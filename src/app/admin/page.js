"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import LoginProfesor from "@/components/LoginProfesor";
import HorariosAdmin from "@/components/admin/HorariosAdmin";
import ReservasAdmin from "@/components/admin/ReservasAdmin";
import AlumnosAdmin from "@/components/admin/AlumnosAdmin";
import MisDatosAdmin from "@/components/admin/MisDatosAdmin";

// Panel de los profesores. Esta página no tiene ningún link desde el
// resto del sitio. Si no hay sesión, muestra el login. Si la cuenta no
// está en usuarios_profesores (010), no deja pasar.
// Ojo: esto es lo que se VE en pantalla. Lo que protege los datos de
// verdad son las políticas RLS de la base: aunque alguien saltee esta
// pantalla, la base no le devuelve nada si no es profesor.

const SECCIONES = ["Horarios", "Reservas", "Alumnos", "Mis datos"];
// Las pestañas del panel.

export default function Admin() {
    const [sesion, setSesion] = useState(undefined);
    // Tres valores posibles: undefined = todavía no sabemos (cargando),
    // null = no inició sesión, un objeto = la sesión de la cuenta.
    const [seccion, setSeccion] = useState("Horarios");
    // La pestaña que está abierta.
    const [profesor, setProfesor] = useState(undefined);
    // Igual: undefined = cargando, null = la cuenta no es de un profesor,
    // un objeto = { profesor_id, profesores: { nombre, tema } }.

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSesion(data.session));
        // getSession: lee la sesión que Supabase dejó guardada en el
        // navegador (si el profesor ya había entrado antes, sigue adentro).
        // .then(función): otra forma de esperar una Promesa, sin "await".

        const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
            setSesion(nuevaSesion);
        });
        // onAuthStateChange: Supabase llama a esta función cada vez que
        // alguien entra o sale. Así la pantalla cambia sola al hacer login.
        // Adentro solo guardamos la sesión: Supabase recomienda no hacer
        // otros pedidos dentro de esta función (se pueden trabar).

        return () => data.subscription.unsubscribe();
        // Limpieza: cuando se cierra la página, dejamos de escuchar.
    }, []);

    const userId = sesion?.user.id;
    // El id de la cuenta, o undefined si no hay sesión.

    useEffect(() => {
        if (!userId) return;

        async function cargarProfesor() {
            const { data } = await supabase
                .from("usuarios_profesores")
                .select("profesor_id, profesores(nombre, tema)")
                .maybeSingle();
            // La política de 010 solo le deja ver SU fila, así que no hace
            // falta filtrar por id. maybeSingle(): como single(), pero si no
            // hay ninguna fila devuelve null en vez de un error.
            setProfesor(data);
        }

        cargarProfesor();
    }, [userId]);
    // Se vuelve a correr cuando cambia la cuenta (por ejemplo, al entrar).

    useEffect(() => {
        const tema = profesor?.profesores.tema;
        if (!tema) return;
        document.documentElement.dataset.tema = tema;
        // El panel toma el color del profesor (rosa o azul), igual que /reservar.
        return () => {
            delete document.documentElement.dataset.tema;
        };
    }, [profesor]);

    async function cerrarSesion() {
        await supabase.auth.signOut();
        // signOut borra la sesión del navegador. onAuthStateChange se entera
        // y pone sesion en null, así vuelve a aparecer el login.
        setProfesor(undefined);
    }

    let contenido;
    // "let" porque le asignamos un valor distinto según el caso.
    if (sesion === undefined || (sesion && profesor === undefined)) {
        contenido = <p>Cargando...</p>;
    } else if (!sesion) {
        contenido = <LoginProfesor />;
    } else if (!profesor) {
        contenido = (
            <div className="flex flex-col items-center gap-4">
            <p>Esta cuenta no tiene acceso al panel.</p>
            <button onClick={cerrarSesion} className="underline">
                Salir
            </button>
            </div>
        );
    } else {
        contenido = (
            <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <div className="flex items-center justify-between w-full">
                <p className="text-lg">
                Hola, <strong>{profesor.profesores.nombre}</strong>.
                </p>
                <button onClick={cerrarSesion} className="underline text-sm">
                Cerrar sesión
                </button>
            </div>

            <nav className="flex flex-wrap justify-center gap-2" aria-label="Secciones del panel">
                {SECCIONES.map((s) => (
                <button
                    key={s}
                    onClick={() => setSeccion(s)}
                    aria-pressed={seccion === s}
                    className={`px-4 py-2 rounded-lg border font-medium transition ${
                    seccion === s
                        ? "bg-acento border-acento text-white"
                        : "bg-suave border-borde text-acento-hover hover:bg-borde"
                    }`}
                >
                    {s}
                </button>
                ))}
            </nav>

            {seccion === "Horarios" && <HorariosAdmin />}
            {seccion === "Reservas" && <ReservasAdmin />}
            {seccion === "Alumnos" && <AlumnosAdmin />}
            {seccion === "Mis datos" && (
                <MisDatosAdmin
                profesorId={profesor.profesor_id}
                onNombreCambiado={(nombre) =>
                    setProfesor({ ...profesor, profesores: { ...profesor.profesores, nombre } })
                }
                // Copia el profesor con el nombre nuevo, así el saludo de
                // arriba cambia sin recargar la página.
                />
            )}
            </div>
        );
    }

    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-4 sm:p-8 gap-6">
        <h1 className="text-3xl font-bold">Panel de profesores</h1>
        {contenido}
        </main>
    );
}
