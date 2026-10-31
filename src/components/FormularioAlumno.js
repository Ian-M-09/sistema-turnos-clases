"use client";
    // "use client" le dice a Next.js que este componente se ejecuta en el
    // navegador del usuario (no en el servidor), porque usamos useState,
    // onChange y otras cosas interactivas que solo existen en el cliente.

import { useState } from "react";
    // "import" trae código de otro archivo o librería para poder usarlo acá.
    // { useState } son "named imports": tomamos específicamente la función
    // useState de todo lo que ofrece la librería "react".
import { achicarImagen, formatearMB, MAX_APUNTES, TIPOS_APUNTES } from "@/lib/archivos";
    // Las funciones y límites de archivos están en src/lib/archivos.js.

export default function FormularioAlumno({ turno, datosIniciales, onContinuar }) {
    // "export" hace que esta función se pueda importar desde otros archivos.
    // "default" indica que es la exportación principal de este archivo
    // (por eso en page.js la importamos sin llaves: import FormularioAlumno).
    // "function" declara una función común de JavaScript.
    // { turno, onContinuar } es "destructuring": de todas las props que le
    // llegan a este componente, extraemos solo estas dos por nombre.

    const inicial = datosIniciales ?? {};
    // datosIniciales trae lo que el alumno ya había escrito (por ejemplo,
    // si volvió a elegir otro horario), así no tiene que tipear todo de nuevo.
    // "??" significa "si lo de la izquierda es null o undefined, usá lo de
    // la derecha": la primera vez usamos un objeto vacío.

    const [nombre, setNombre] = useState(inicial.nombre ?? "");
    // "const" declara una variable que no se puede reasignar directamente
    // (no podés escribir nombre = "otra cosa" más adelante, solo a través
    // de setNombre). useState(...) crea el estado con su valor inicial.
    const [apellido, setApellido] = useState(inicial.apellido ?? "");
    const [telefono, setTelefono] = useState(inicial.telefono ?? "");
    const [materia, setMateria] = useState(inicial.materia ?? "");
    const [anioCursando, setAnioCursando] = useState(inicial.anioCursando ?? "");
    const [notas, setNotas] = useState(inicial.notas ?? "");
    const [apuntes, setApuntes] = useState(inicial.apuntes ?? []);
    // Ahora es una LISTA de archivos (puede quedar vacía: son opcionales).
    const [error, setError] = useState(null);
    // Mensaje de error para mostrar en pantalla (reemplaza a los alert()).
    const [procesando, setProcesando] = useState(false);
    // true mientras se achican las fotos recién elegidas.

    const bytesUsados = apuntes.reduce((total, a) => total + a.size, 0);
    // .reduce recorre la lista acumulando un resultado: arranca en 0 y a
    // cada paso le suma el tamaño (size, en bytes) de un archivo.

    async function handleApuntesChange(e) {
        const elegidos = Array.from(e.target.files);
        // e.target.files no es una lista común: Array.from la convierte en
        // una para poder usar .map, .filter, etc.
        e.target.value = "";
        // Vaciamos el input para que se pueda volver a elegir el mismo
        // archivo después de quitarlo. Los archivos ya quedaron en "elegidos".
        setError(null);

        const invalidos = elegidos.filter((a) => !TIPOS_APUNTES.includes(a.type));
        // .filter se queda solo con los elementos que cumplen la condición.
        if (invalidos.length > 0) {
            setError(`"${invalidos[0].name}" no es PDF, foto (JPG, PNG o WebP) ni Word (.docx).`);
            return;
        }

        setProcesando(true);
        const achicados = await Promise.all(elegidos.map(achicarImagen));
        // .map llama a achicarImagen con cada archivo y devuelve una lista
        // de Promesas. Promise.all espera a que terminen TODAS.
        setProcesando(false);

        const nuevoTotal = bytesUsados + achicados.reduce((t, a) => t + a.size, 0);
        if (nuevoTotal > MAX_APUNTES) {
            setError(`Los apuntes no pueden sumar más de 3 MB (quedarían ${formatearMB(nuevoTotal)} MB).`);
            return;
        }
        setApuntes([...apuntes, ...achicados]);
        // Armamos una lista NUEVA con los anteriores y los nuevos. En React
        // nunca se modifica el estado directamente (con .push): se reemplaza.
    }

    function quitarApunte(indice) {
        setApuntes(apuntes.filter((_, i) => i !== indice));
        // Nos quedamos con todos menos el de esa posición. "_" es un nombre
        // de costumbre para un parámetro que no usamos.
    }

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
        setError("El teléfono debe tener exactamente 10 dígitos.");
        // Ya no usamos alert(): guardamos el mensaje y se muestra abajo.
        return;
        // "return" corta la ejecución de la función acá mismo: si el
        // teléfono está mal, no seguimos, y "onContinuar" nunca se llama.
        }

        onContinuar({ nombre, apellido, telefono, materia, anioCursando, notas, apuntes });
        // Le "avisamos" al componente padre (page.js) que este paso terminó,
        // mandándole todos los datos juntos en un solo objeto.
    }

    return (
        // "return" acá indica qué HTML/JSX va a mostrar este componente
        // en pantalla.
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md">
        <div className="flex flex-col text-left">
            <label htmlFor="nombre" className="mb-1 font-medium">
            Nombre
            </label>
            <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="apellido" className="mb-1 font-medium">
            Apellido
            </label>
            <input
            id="apellido"
            type="text"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="telefono" className="mb-1 font-medium">
            Teléfono (10 dígitos)
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
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="materia" className="mb-1 font-medium">
            Materia
            </label>
            <select
                id="materia"
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
                required
            >
            {/* <select> muestra una lista deplegable. Cada <option> de adentro es una opcion elegible. el "value"
            del select sigue funcionando igual que con un input de texto: se actualiza con onChance */}
            <option value="">Elegí una materia</option>
            {/*esta opcion vacia fuerza a que el alumno elija algo a proposito,
            en vez de que quede seleccionada la primer materia por defecto */}
            <option value="Lengua">Lengua</option>
            <option value="Matemática">Matemática</option>
            <option value="Preparación Global 5to (BHM)">Preparación para el Global de 5to (BHM)</option>
            <option value="Inglés">Inglés</option>
            <option value="Latín">Latín</option>
            <option value="Griego">Griego</option>
            <option value="Dibujo">Dibujo</option>
            <option value="Apoyo con tareas">Apoyo con tareas</option>
            </select>
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="anioCursando" className="mb-1 font-medium">
            Año que está cursando
            </label>
            <input
            id="anioCursando"
            type="text"
            value={anioCursando}
            onChange={(e) => setAnioCursando(e.target.value)}
            placeholder="Ej: 3er año secundaria, 1er año facultad..."
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="notas" className="mb-1 font-medium">
            Notas adicionales
            </label>
            <textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="apuntes" className="mb-1 font-medium">
            Apuntes de la materia (PDF, foto o Word, opcional)
            </label>
            <input
            id="apuntes"
            type="file"
            multiple
            // "multiple" deja elegir varios archivos a la vez.
            accept=".pdf,.docx,image/jpeg,image/png,image/webp"
            onChange={handleApuntesChange}
            disabled={procesando}
            className="w-full border border-borde rounded-lg px-3 py-2 bg-superficie"
            />
            {procesando && <p className="text-sm mt-1">Preparando fotos...</p>}
            {/* "&&": si lo de la izquierda es true, muestra lo de la derecha. */}

            {apuntes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
                {apuntes.map((a, i) => (
                // key: React necesita un identificador único por elemento de
                // la lista para saber cuál cambió.
                <li key={`${a.name}-${i}`} className="flex justify-between items-center gap-2 text-sm">
                    <span className="truncate">
                    {a.name} ({formatearMB(a.size)} MB)
                    </span>
                    <button
                    type="button"
                    // type="button" para que NO envíe el formulario.
                    onClick={() => quitarApunte(i)}
                    className="underline shrink-0"
                    >
                    Quitar
                    </button>
                </li>
                ))}
            </ul>
            )}
            <p className="text-sm mt-1">
            Usado: {formatearMB(bytesUsados)} MB de 3 MB
            </p>
        </div>

        {error && (
            // role="alert" hace que los lectores de pantalla lean el mensaje.
            <p role="alert" className="text-red-700 font-medium">
            {error}
            </p>
        )}

        <button
            type="submit"
            disabled={procesando}
            className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition"
        >
            Continuar
        </button>
        </form>
    );
}