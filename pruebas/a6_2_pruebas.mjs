// =====================================================================
// A6, paso 2: pruebas de concurrencia y de reservas de varias horas.
// Antes: correr a6_1_preparar.sql en el SQL Editor.
// Cómo se corre (desde la carpeta del proyecto, en PowerShell):
//   node --env-file=.env.local pruebas/a6_2_pruebas.mjs
// --env-file=.env.local: Node carga las variables de ese archivo en
// process.env (como hace Next.js), así usamos la misma URL y la misma
// clave pública que la página. O sea: el script tiene exactamente los
// mismos permisos que un alumno desde el navegador, ni uno más.
// .mjs: le dice a Node que el archivo usa "import" (módulos de JavaScript).
// =====================================================================

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Una imagen PNG de 1x1 píxel, escrita en base64 (texto que representa
// bytes). Buffer.from(texto, "base64") la vuelve a convertir en bytes.
const PNG_CHIQUITO = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
);

let fallidas = 0;
// "let" (y no "const") porque la vamos a ir sumando.

// ---------------------------------------------------------------------
// Funciones de ayuda
// ---------------------------------------------------------------------

// Sube un comprobante nuevo (cada reserva necesita uno distinto) y
// devuelve su nombre. Igual que la página: uuid + extensión.
async function subirComprobante() {
    const nombre = crypto.randomUUID() + ".png";
    const { error } = await supabase.storage
        .from("comprobantes")
        .upload(nombre, PNG_CHIQUITO, { contentType: "image/png" });
    if (error) throw new Error("No se pudo subir el comprobante: " + error.message);
    // "throw" corta la ejecución con un error (frena todo el script).
    return nombre;
}

// Busca los ids de los horarios de prueba. Devuelve un objeto como
// { "2028-03-15 10:00": "uuid...", ... } para pedirlos por fecha y hora.
async function cargarHorarios() {
    const { data, error } = await supabase
        .from("disponibilidad")
        .select("id, fecha, hora")
        .or("fecha.in.(2028-03-15,2028-03-16),hora.eq.05:13:00");
    // .or("a,b"): trae las filas que cumplen a O b (la coma separa las
    // condiciones). Es la misma consulta del final de a6_1_preparar.sql.
    if (error) throw new Error("No se pudieron leer los horarios: " + error.message);

    const horarios = {};
    for (const h of data) {
        // h.hora llega como "10:00:00": .slice(0, 5) se queda con "10:00".
        horarios[h.fecha + " " + h.hora.slice(0, 5)] = h.id;
    }
    return horarios;
}

// Llama a crear_reserva igual que la página. Devuelve "ok" o el texto
// del error (nunca tira error, así podemos comparar resultados).
async function reservar(dni, materia, idsHorarios) {
    const comprobante = await subirComprobante();
    const { data, error } = await supabase.rpc("crear_reserva", {
        p_horarios: idsHorarios,
        p_dni: dni,
        p_materia: materia,
        p_anio_cursando: "",
        p_notas: "Prueba A6",
        p_apuntes: [],
        p_comprobante_url: comprobante,
    });
    if (error) return error.message;
    if (!data) return "DNI no registrado";
    return "ok";
}

// Muestra si una prueba pasó (✔) o no (✘).
function revisar(nombre, paso, detalle) {
    console.log((paso ? "  ✔ " : "  ✘ ") + nombre + (detalle ? "  →  " + detalle : ""));
    // condición ? a : b  es un "if" corto: si la condición es true usa a, si no b.
    if (!paso) fallidas++;
    // fallidas++ es lo mismo que fallidas = fallidas + 1.
}

// Para las pruebas que tienen que fallar: pasa si el error contiene el
// texto esperado.
async function esperarError(nombre, dni, materia, ids, textoEsperado) {
    const resultado = await reservar(dni, materia, ids);
    revisar(nombre, resultado.includes(textoEsperado), resultado);
}

// ---------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------

async function main() {
    // Una materia cualquiera de la tabla (cuál no importa para la prueba).
    const { data: materias, error } = await supabase.from("materias").select("nombre").limit(1);
    // { data: materias }: "renombra" data a materias al desestructurar.
    if (error || materias.length === 0) throw new Error("No se pudo leer la tabla materias.");
    const materia = materias[0].nombre;

    const h = await cargarHorarios();
    if (Object.keys(h).length < 10) {
        // Object.keys(objeto): la lista de claves. Tiene que haber 10 horarios.
        throw new Error("Faltan horarios de prueba: ¿corriste a6_1_preparar.sql?");
    }

    // Si el horario de las 10:00 no tiene 4 lugares ocupados, el script ya
    // se corrió antes y los resultados no servirían (los alumnos ya
    // tendrían una pendiente). Hay que limpiar y preparar de nuevo.
    const { data: diez } = await supabase
        .from("disponibilidad")
        .select("cupo_ocupado")
        .eq("id", h["2028-03-15 10:00"])
        .single();
    // .single(): esperamos una sola fila, y data llega como objeto (no como lista).
    if (diez?.cupo_ocupado !== 4) {
        // diez?.cupo_ocupado: el "?." evita un error si diez es null.
        throw new Error(
            "Las pruebas ya se corrieron sobre estos datos. Corré a6_4_limpiar.sql, " +
            "después a6_1_preparar.sql, y recién ahí este script (una sola vez)."
        );
    }

    // --- 1. Concurrencia: 3 alumnos distintos, 1 solo lugar. ---------
    console.log("\n1. Tres alumnos a la vez sobre el último lugar (10:00)");
    const carrera = await Promise.all([
        // Promise.all([...]): arranca todas las llamadas AL MISMO TIEMPO y
        // espera a que terminen todas. Devuelve la lista de resultados en
        // el mismo orden.
        reservar("99000001", materia, [h["2028-03-15 10:00"]]),
        reservar("99000002", materia, [h["2028-03-15 10:00"]]),
        reservar("99000003", materia, [h["2028-03-15 10:00"]]),
    ]);
    console.log("     resultados:", carrera);
    const okCarrera = carrera.filter((r) => r === "ok").length;
    // .filter(condición): se queda con los elementos que la cumplen.
    revisar("exactamente 1 reserva guardada", okCarrera === 1, okCarrera + " guardadas");
    revisar(
        "las otras 2 dicen que no hay lugar",
        carrera.filter((r) => r.includes("Ya no queda lugar")).length === 2
    );

    // --- 2. Doble clic: el mismo alumno manda 5 a la vez. ------------
    console.log("\n2. El mismo alumno manda 5 reservas a la vez (12:00)");
    const dobleClic = await Promise.all(
        [1, 2, 3, 4, 5].map(() => reservar("99000004", materia, [h["2028-03-15 12:00"]]))
        // .map arma 5 llamadas iguales; Promise.all las larga juntas.
    );
    console.log("     resultados:", dobleClic);
    revisar("exactamente 1 reserva guardada", dobleClic.filter((r) => r === "ok").length === 1);
    revisar(
        "las otras 4 dicen que ya tiene una pendiente",
        dobleClic.filter((r) => r.includes("Ya tenés una reserva")).length === 4
    );

    // --- 3. Varias horas: 2 horas y media seguidas. ------------------
    console.log("\n3. Reserva de 2 horas y media (14:00 + 15:00 + media hora de las 16:00)");
    const larga = await reservar("99000005", materia, [
        // Las mandamos desordenadas a propósito: la función las ordena sola.
        h["2028-03-15 16:00"],
        h["2028-03-15 14:00"],
        h["2028-03-15 15:00"],
    ]);
    revisar("se guarda", larga === "ok", larga);

    // --- 4. Casos que tienen que fallar (alumno 99000006). -----------
    // Como fallan, la función deshace todo y el alumno nunca queda con
    // una pendiente: por eso puede usarse en todas.
    console.log("\n4. Reservas inválidas (todas tienen que dar error)");
    const dni = "99000006";
    await esperarError("horarios no seguidos (18 y 20)", dni, materia,
        [h["2028-03-15 18:00"], h["2028-03-15 20:00"]], "seguidos");
    await esperarError("distinto día", dni, materia,
        [h["2028-03-15 18:00"], h["2028-03-16 14:00"]], "mismo día");
    await esperarError("empieza con media hora", dni, materia,
        [h["2028-03-15 16:00"]], "empezar con un horario de 1 hora");
    await esperarError("media hora en el medio (15 + 16 media + 16:30)", dni, materia,
        [h["2028-03-15 15:00"], h["2028-03-15 16:00"], h["2028-03-15 16:30"]], "solo puede ir al final");
    await esperarError("horario repetido", dni, materia,
        [h["2028-03-15 18:00"], h["2028-03-15 18:00"]], "repetido");
    // Para el de 05:13 buscamos la clave que termina en "05:13" (la fecha
    // es la de hoy y no la sabemos de antemano).
    const clave0513 = Object.keys(h).find((k) => k.endsWith("05:13"));
    await esperarError("menos de 24 hs de anticipación", dni, materia,
        [h[clave0513]], "24 horas");
    await esperarError("horario que no existe", dni, materia,
        [crypto.randomUUID()], "ya no existe");
    await esperarError("sin horarios", dni, materia, [], "al menos un horario");

    console.log(
        fallidas === 0
            ? "\nTodo bien. Ahora corré a6_3_revisar.sql y después a6_4_limpiar.sql.\n"
            : `\n${fallidas} prueba(s) fallaron. Revisá los ✘ de arriba.\n`
        // `texto ${variable}`: "template string", mete el valor de la
        // variable adentro del texto.
    );
}

main().catch((err) => {
    // .catch: si main tiró un error (throw), lo mostramos y terminamos.
    console.error("\nError:", err.message);
    process.exit(1);
    // process.exit(1): termina Node con código 1 (significa "salió mal").
});
