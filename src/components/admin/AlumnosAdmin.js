"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Sección "Alumnos" del panel: registrar, editar, bloquear y desbloquear.
// Acá sí se escribe directo en la tabla alumnos: las políticas de 013 solo
// se lo permiten a los profesores, y los checks de la base validan los datos.

const FORM_VACIO = { dni: "", nombre: "", apellido: "", telefono: "" };

function soloNumeros(texto, maximo) {
    return texto.replace(/[^0-9]/g, "").slice(0, maximo);
    // Igual que en el formulario del alumno: borra todo lo que no sea
    // número y corta en "maximo" caracteres.
}

export default function AlumnosAdmin() {
    const [alumnos, setAlumnos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState("");
    const [form, setForm] = useState(FORM_VACIO);
    // Un solo estado con un objeto para los cuatro campos del formulario.
    const [editandoId, setEditandoId] = useState(null);
    // null = registrando uno nuevo; un id = editando ese alumno.
    const [mensaje, setMensaje] = useState(null);
    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        async function cargar() {
            const { data, error } = await supabase
                .from("alumnos")
                .select("id, dni, nombre, apellido, telefono, bloqueado")
                .order("apellido")
                .order("nombre");

            if (error) {
                setError("No se pudieron cargar los alumnos.");
            } else {
                setAlumnos(data);
            }
            setCargando(false);
        }

        cargar();
    }, [version]);

    function cambiarCampo(campo, valor) {
        setForm({ ...form, [campo]: valor });
        // Copia el formulario y cambia solo ese campo.
    }

    function empezarEdicion(alumno) {
        setEditandoId(alumno.id);
        setForm({ dni: alumno.dni, nombre: alumno.nombre, apellido: alumno.apellido, telefono: alumno.telefono });
        setMensaje(null);
        setError(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Sube la página hasta el formulario, con un desplazamiento suave.
    }

    function cancelarEdicion() {
        setEditandoId(null);
        setForm(FORM_VACIO);
        setError(null);
    }

    async function handleGuardar(e) {
        e.preventDefault();
        setMensaje(null);
        setError(null);

        const datos = {
            dni: form.dni,
            nombre: form.nombre.trim(),
            apellido: form.apellido.trim(),
            telefono: form.telefono,
        };
        // .trim() saca los espacios del principio y del final.

        if (!/^[0-9]{7,8}$/.test(datos.dni)) {
            setError("El DNI tiene que tener 7 u 8 números.");
            return;
        }
        if (!datos.nombre || !datos.apellido) {
            setError("Faltan el nombre o el apellido.");
            return;
        }
        if (datos.telefono.length !== 10) {
            setError("El teléfono tiene que tener 10 números (código de área sin 0 y número sin 15).");
            return;
        }

        setGuardando(true);
        const { error } = editandoId
            ? await supabase.from("alumnos").update(datos).eq("id", editandoId)
            : await supabase.from("alumnos").insert(datos);
        // .update(datos).eq("id", ...): cambia esa fila. .insert(datos): agrega una nueva.
        setGuardando(false);

        if (error) {
            setError(
                error.code === "23505"
                    ? "Ya hay un alumno registrado con ese DNI."
                    : "No se pudo guardar. Revisá los datos y probá de nuevo."
            );
            // 23505 es el código de error de Postgres cuando se repite un
            // valor UNIQUE (acá, el DNI).
            return;
        }

        setMensaje(editandoId ? "Datos actualizados." : `${datos.nombre} ${datos.apellido} quedó registrado. Ya puede reservar con su DNI.`);
        setEditandoId(null);
        setForm(FORM_VACIO);
        setVersion((v) => v + 1);
    }

    async function cambiarBloqueo(alumno) {
        const accion = alumno.bloqueado ? "desbloquear" : "bloquear";
        const aviso = alumno.bloqueado
            ? ""
            : " Va a ver todos los horarios sin lugar y no va a poder reservar.";
        if (!window.confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} a ${alumno.nombre} ${alumno.apellido}?${aviso}`)) return;
        // accion[0].toUpperCase() + accion.slice(1): pone la primera letra en
        // mayúscula ("bloquear" → "Bloquear").

        setMensaje(null);
        setError(null);
        const { error } = await supabase
            .from("alumnos")
            .update({ bloqueado: !alumno.bloqueado })
            // "!" invierte el valor: true pasa a false y al revés.
            .eq("id", alumno.id);

        if (error) {
            setError("No se pudo cambiar. Probá de nuevo.");
            return;
        }
        setVersion((v) => v + 1);
    }

    const texto = busqueda.trim().toLowerCase();
    const filtrados = alumnos.filter((a) =>
        `${a.nombre} ${a.apellido} ${a.dni}`.toLowerCase().includes(texto)
    );
    // Busca en el nombre, el apellido y el DNI a la vez. .toLowerCase()
    // pasa todo a minúsculas, así "juan" encuentra a "Juan". Con la
    // búsqueda vacía, includes("") da true y se ven todos.

    return (
        <div className="flex flex-col gap-6 w-full max-w-lg text-left">
        <form onSubmit={handleGuardar} className="flex flex-col gap-3 bg-superficie border border-borde rounded-lg p-4">
            <h2 className="text-xl font-bold">{editandoId ? "Editar alumno" : "Registrar alumno"}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* En el celular, una columna; desde pantallas medianas (sm:), dos. */}
            <label className="flex flex-col text-sm font-medium">
                DNI
                <input
                inputMode="numeric"
                value={form.dni}
                onChange={(e) => cambiarCampo("dni", soloNumeros(e.target.value, 8))}
                className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
                required
                />
            </label>
            {/* Un <label> que envuelve al <input> los conecta sin necesidad de
                htmlFor e id. */}
            <label className="flex flex-col text-sm font-medium">
                Teléfono (10 números)
                <input
                type="tel"
                inputMode="numeric"
                value={form.telefono}
                onChange={(e) => cambiarCampo("telefono", soloNumeros(e.target.value, 10))}
                placeholder="Ej: 3874123456"
                className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
                required
                />
            </label>
            <label className="flex flex-col text-sm font-medium">
                Nombre
                <input
                value={form.nombre}
                onChange={(e) => cambiarCampo("nombre", e.target.value)}
                className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
                required
                />
            </label>
            <label className="flex flex-col text-sm font-medium">
                Apellido
                <input
                value={form.apellido}
                onChange={(e) => cambiarCampo("apellido", e.target.value)}
                className="mt-1 border border-borde rounded-lg px-3 py-2 bg-superficie font-normal"
                required
                />
            </label>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
            <button
                type="submit"
                disabled={guardando}
                className="vidrio px-6 py-3 disabled:opacity-60"
            >
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar"}
                {/* Dos ternarios seguidos: si guarda, "Guardando..."; si no, según
                    si está editando o registrando. */}
            </button>
            {editandoId && (
                <button type="button" onClick={cancelarEdicion} className="underline">
                Cancelar
                </button>
            )}
            </div>
        </form>

        {mensaje && <p className="font-medium">{mensaje}</p>}
        {error && (
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Alumnos registrados ({alumnos.length})</h2>
            <input
            type="search"
            // type="search": un campo de texto con una crucecita para borrar.
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o DNI"
            aria-label="Buscar alumno"
            className="border border-borde rounded-lg px-3 py-2 bg-superficie"
            />

            {cargando && <p>Cargando alumnos...</p>}
            {!cargando && filtrados.length === 0 && (
            <p>{alumnos.length === 0 ? "Todavía no hay alumnos registrados." : "No se encontró ningún alumno."}</p>
            )}

            <ul className="flex flex-col gap-2">
            {filtrados.map((a) => (
                <li
                key={a.id}
                className={`border rounded-lg px-3 py-2 text-sm flex flex-wrap justify-between items-center gap-2 ${
                    a.bloqueado ? "bg-fondo border-borde opacity-70" : "bg-superficie border-borde"
                }`}
                >
                <div>
                    <p className="font-medium text-base">
                    {a.apellido}, {a.nombre}
                    {a.bloqueado && (
                        <span className="ml-2 text-xs font-medium text-red-700 border border-red-700 rounded px-1">
                        Bloqueado
                        </span>
                    )}
                    </p>
                    <p>DNI {a.dni} · Tel {a.telefono}</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => empezarEdicion(a)} className="underline">
                    Editar
                    </button>
                    <button onClick={() => cambiarBloqueo(a)} className="underline">
                    {a.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                </div>
                </li>
            ))}
            </ul>
        </section>
        </div>
    );
}
