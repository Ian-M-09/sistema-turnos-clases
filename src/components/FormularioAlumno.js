"use client";
    // "use client" le dice a Next.js que este componente se ejecuta en el
    // navegador del usuario (no en el servidor), porque usamos useState,
    // onChange y otras cosas interactivas que solo existen en el cliente.

import { useState } from "react";
    // "import" trae código de otro archivo o librería para poder usarlo acá.
    // { useState } son "named imports": tomamos específicamente la función
    // useState de todo lo que ofrece la librería "react".

export default function FormularioAlumno({ turno, onContinuar }) {
    // "export" hace que esta función se pueda importar desde otros archivos.
    // "default" indica que es la exportación principal de este archivo
    // (por eso en page.js la importamos sin llaves: import FormularioAlumno).
    // "function" declara una función común de JavaScript.
    // { turno, onContinuar } es "destructuring": de todas las props que le
    // llegan a este componente, extraemos solo estas dos por nombre.

    const [nombre, setNombre] = useState("");
    // "const" declara una variable que no se puede reasignar directamente
    // (no podés escribir nombre = "otra cosa" más adelante, solo a través
    // de setNombre). useState("") crea el estado inicial vacío.
    const [apellido, setApellido] = useState("");
    const [telefono, setTelefono] = useState("");
    const [materia, setMateria] = useState("");
    const [anioCursando, setAnioCursando] = useState("");
    const [notas, setNotas] = useState("");
    const [archivo, setArchivo] = useState(null);

    function handleTelefonoChange(e) {
        // Esta función se ejecuta cada vez que el usuario tipea en el input
        // de teléfono. La armamos aparte (en vez de ponerla directo en el
        // onChange) porque tiene más de una línea de lógica adentro.

        const soloNumeros = e.target.value.replace(/[^0-9]/g, "");
        // "e.target.value" es lo que el usuario tiene escrito en este momento.
        // .replace(/[^0-9]/g, "") usa una expresión regular para borrar
        // cualquier caracter que NO sea un número (letras, espacios, guiones).
        // Así, aunque alguien pegue "011-4444-5555", queda solo "01144445555".

        setTelefono(soloNumeros.slice(0, 10));
        // .slice(0, 10) corta el texto para que como máximo tenga 10
        // caracteres, sin importar cuántos números haya escrito o pegado.
    }

    function handleSubmit(e) {
        e.preventDefault();
        // "e" es el "evento" que dispara el navegador al enviar el formulario.
        // .preventDefault() cancela el comportamiento por defecto del
        // navegador (que sería recargar la página), para manejarlo nosotros
        // con JavaScript en su lugar.

        if (telefono.length !== 10) {
        // "if" ejecuta el código de adentro solo si la condición es
        // verdadera. "!==" significa "distinto de" (comparación estricta,
        // sin conversión de tipos).
        alert("El teléfono debe tener exactamente 10 dígitos.");
        return;
        // "return" corta la ejecución de la función acá mismo: si el
        // teléfono está mal, no seguimos, y "onContinuar" nunca se llama.
        }

        onContinuar({ nombre, apellido, telefono, materia, anioCursando, notas, archivo });
        // Le "avisamos" al componente padre (page.js) que este paso terminó,
        // mandándole todos los datos juntos en un solo objeto.
    }

    return (
        // "return" acá indica qué HTML/JSX va a mostrar este componente
        // en pantalla.
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md">
        <div className="flex flex-col text-left">
            <label htmlFor="nombre" className="mb-1 font-medium">
            Nombre - obligatorio
            </label>
            <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="apellido" className="mb-1 font-medium">
            Apellido - obligatorio
            </label>
            <input
            id="apellido"
            type="text"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="telefono" className="mb-1 font-medium">
            Teléfono (10 dígitos) - obligatorio
            </label>
            <input
            id="telefono"
            type="tel"
            // type="tel" hace que en celulares aparezca el teclado numérico.
            inputMode="numeric"
            // inputMode es un refuerzo extra para que el teclado que aparece
            // sea el de números, independientemente del "type".
            value={telefono}
            onChange={handleTelefonoChange}
            maxLength={10}
            // maxLength bloquea a nivel navegador que se escriban más de
            // 10 caracteres, aunque ya lo controlamos también en JS arriba.
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="materia" className="mb-1 font-medium">
            Materia - obligatorio
            </label>
            <input
            id="materia"
            type="text"
            value={materia}
            onChange={(e) => setMateria(e.target.value)}
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="anioCursando" className="mb-1 font-medium">
            Año que está cursando - opcional
            </label>
            <input
            id="anioCursando"
            type="text"
            value={anioCursando}
            onChange={(e) => setAnioCursando(e.target.value)}
            placeholder="Ej: 3er año secundaria, 1er año facultad..."
            className="border rounded-lg px-3 py-2"
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="notas" className="mb-1 font-medium">
            Notas adicionales — opcional
            </label>
            <textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="border rounded-lg px-3 py-2"
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="archivo" className="mb-1 font-medium">
            Apuntes de la materia (PDF, foto o Word) — opcional
            </label>
            <input
            id="archivo"
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => setArchivo(e.target.files[0])}
            className="border rounded-lg px-3 py-2"
            />
        </div>

        <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
            Continuar
        </button>
        </form>
    );
}