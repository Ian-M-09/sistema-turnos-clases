"use client";
    // "use client" le dice a Next.js que este componente se ejecuta en el
    // navegador del usuario (no en el servidor), porque usamos useState,
    // onChange y otras cosas interactivas que solo existen en el cliente.

import { useState } from "react";
    // "import" trae código de otro archivo o librería para poder usarlo acá.
    // { useState } son "named imports": tomamos específicamente la función
    // useState de todo lo que ofrece la librería "react".
import { achicarImagen, formatearMB, huellaArchivo, MAX_APUNTES, MAX_CANTIDAD_APUNTES, TIPOS_APUNTES } from "@/lib/archivos";
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

    // Nombre, apellido y teléfono ya no se piden: los cargó el profesor al
    // registrar al alumno, y crear_reserva los toma de la tabla alumnos
    // con el DNI. La materia se elige en el primer paso.

    const [anioCursando, setAnioCursando] = useState(inicial.anioCursando ?? "");
    // "const" declara una variable que no se puede reasignar directamente
    // (no podés escribir anioCursando = "otra cosa" más adelante, solo a
    // través de setAnioCursando). useState(...) crea el estado con su valor inicial.
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
        const huellas = await Promise.all(elegidos.map(huellaArchivo));
        // La huella de cada archivo ORIGINAL (antes de achicar las fotos),
        // para saber si es el mismo que uno que ya está en la lista.

        const vistas = new Set(apuntes.map((a) => a.huella));
        // new Set: una colección sin repetidos donde .has(valor) dice si
        // algo está adentro. Arranca con las huellas de los apuntes que ya
        // estaban agregados.
        const nuevos = [];
        const repetidos = [];
        elegidos.forEach((archivo, i) => {
            // forEach: recorre la lista; i es la posición (la misma en huellas).
            if (vistas.has(huellas[i])) {
                repetidos.push(archivo.name);
                // Ya estaba (o vino dos veces en esta misma elección): no se agrega.
            } else {
                vistas.add(huellas[i]);
                nuevos.push({ archivo, huella: huellas[i] });
            }
        });

        const achicados = await Promise.all(nuevos.map(async ({ archivo, huella }) => {
            // .map con una función async devuelve una lista de Promesas, y
            // Promise.all espera a que terminen TODAS.
            const achicado = await achicarImagen(archivo);
            achicado.huella = huella;
            // Le guardamos la huella al archivo para compararla la próxima
            // vez que el alumno agregue apuntes. Un objeto File acepta
            // propiedades nuevas como cualquier objeto de JavaScript.
            return achicado;
        }));
        setProcesando(false);

        // Agregamos los que entran en el espacio que queda, en el orden en
        // que se eligieron. Los que no entran se dejan afuera, pero los demás
        // se agregan igual (antes se rechazaba toda la elección).
        let total = bytesUsados;
        // let: como const, pero se puede volver a asignar (lo vamos sumando).
        const entran = [];
        const sinLugar = [];
        const sobran = [];
        for (const archivo of achicados) {
            // for...of: recorre la lista de a un elemento.
            if (apuntes.length + entran.length >= MAX_CANTIDAD_APUNTES) {
                sobran.push(archivo.name);
                // Ya están los 5 apuntes permitidos: este queda afuera.
            } else if (total + archivo.size <= MAX_APUNTES) {
                entran.push(archivo);
                total += archivo.size;
                // +=: suma y guarda (total = total + archivo.size).
            } else {
                sinLugar.push(archivo.name);
                // No entra, pero seguimos: puede que uno más chico de los
                // que vienen después sí entre.
            }
        }

        const avisos = [];
        if (repetidos.length > 0) {
            avisos.push(`"${repetidos[0]}"${repetidos.length > 1 ? ` y ${repetidos.length - 1} más` : ""} ya estaba${repetidos.length > 1 ? "n" : ""} agregado${repetidos.length > 1 ? "s" : ""}.`);
        }
        if (sinLugar.length > 0) {
            avisos.push(`No ${sinLugar.length > 1 ? "entraron" : "entró"} por superar los 3 MB: ${sinLugar.join(", ")}.`);
            // .join(", "): une los nombres separados por coma.
        }
        if (sobran.length > 0) {
            avisos.push(`Podés subir hasta ${MAX_CANTIDAD_APUNTES} apuntes. Quedaron afuera: ${sobran.join(", ")}.`);
        }
        if (avisos.length > 0) setError(avisos.join(" "));
        // Un solo mensaje con los dos avisos, si hay los dos.

        if (entran.length > 0) setApuntes([...apuntes, ...entran]);
        // Armamos una lista NUEVA con los anteriores y los nuevos. En React
        // nunca se modifica el estado directamente (con .push): se reemplaza.
    }

    function quitarApunte(indice) {
        setApuntes(apuntes.filter((_, i) => i !== indice));
        // Nos quedamos con todos menos el de esa posición. "_" es un nombre
        // de costumbre para un parámetro que no usamos.
    }

    function handleSubmit(e) {
        e.preventDefault();
        // "e" es el "evento" que dispara el navegador al enviar el formulario.
        // .preventDefault() cancela el comportamiento por defecto del
        // navegador (que sería recargar la página), para manejarlo nosotros
        // con JavaScript en su lugar.

        onContinuar({ anioCursando, notas, apuntes });
        // Le "avisamos" al componente padre (page.js) que este paso terminó,
        // mandándole todos los datos juntos en un solo objeto.
    }

    return (
        // "return" acá indica qué HTML/JSX va a mostrar este componente
        // en pantalla.
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md">
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
            Usado: {formatearMB(bytesUsados)} MB de 3 MB ({apuntes.length} de {MAX_CANTIDAD_APUNTES} archivos)
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