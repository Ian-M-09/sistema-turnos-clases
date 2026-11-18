// @ts-nocheck
// @ts-nocheck: el archivo termina en .ts porque Supabase lo pide así, pero
// está escrito en JavaScript común. Esta línea le dice a VS Code que no
// marque errores de tipos.
//
// Edge Function "gemini" (pasos E1, E2 y E3). Es código que corre en los
// servidores de Supabase, no en el navegador: por eso acá se puede usar la
// clave de Gemini. Reemplaza a la ruta /api/gemini de Netlify, que cortaba
// el pedido antes de que Gemini terminara de leer los apuntes pesados.
// Supabase espera hasta 150 segundos (plan gratuito).
//
// Corre con Deno, otro entorno de JavaScript parecido a Node.js. Las
// librerías se importan con "npm:" adelante y no hace falta instalarlas.
//
// Qué hace, con un POST { reservaId, mensaje }:
//   - sin mensaje: genera el material inicial (crea el chat).
//   - con mensaje: le pide un ajuste a Gemini (sigue el chat).
// Devuelve { historial } o { error }.
//
// Regla de privacidad (decidida 17/11): a Gemini NUNCA se le mandan
// nombre, apellido, DNI ni teléfono del alumno. En el plan gratuito,
// Google usa lo que recibe para entrenar sus modelos.

import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
// Buffer: la forma de Node.js de manejar bytes. "node:" le pide a Deno su
// versión compatible.
import { unzipSync } from "npm:fflate@0.8.2";
// fflate: librería chiquita para descomprimir archivos ZIP.

const MODELO = Deno.env.get("GEMINI_MODELO") || "gemini-flash-latest";
// Deno.env.get: lee un secreto de Supabase (como process.env en Node.js).
// ||: si no está cargado, usa el texto de la derecha.

const MODELO_RESPALDO = Deno.env.get("GEMINI_MODELO_RESPALDO") || "gemini-flash-lite-latest";
// Modelo de respaldo: más liviano y menos saturado, aunque el material
// puede salir un poco menos elaborado.

const SATURADO = [500, 503, 504];
// Códigos de Google que significan "problema de ellos": 500 = error
// interno, 503 = sobrecargado, 504 = tardó demasiado. Con estos se pasa al
// respaldo. Los demás (400, 429...) no se arreglan cambiando de modelo.

const TOPE_PRINCIPAL_MS = 50000;
const TOPE_RESPALDO_MS = 85000;
// Cuánto se espera a cada modelo, en milisegundos (50 y 85 segundos).
// Suman 135 segundos: dejan margen dentro de los 150 que da Supabase para
// bajar los apuntes y guardar el chat.

const LARGO_MAXIMO_MENSAJE = 2000;
// Tope de letras para un pedido de ajuste (para no gastar de más).

const TIPOS = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};
// Los tipos de archivo que Gemini puede leer directo, según la extensión.
// Los .docx no están: se convierten a texto con textoDeWord.

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// CORS: el panel está en netlify.app y esta función en supabase.co. El
// navegador bloquea los pedidos entre sitios distintos salvo que la
// respuesta traiga estos encabezados. El "*" no abre la puerta a
// cualquiera: sin el token de un profesor, la base no devuelve nada.

// Para afinar el prompt con la profesora (E5), se cambia acá y se vuelve a
// desplegar la función.
const PROMPT_SISTEMA = `Sos el asistente de un profesor particular de apoyo escolar y universitario en Argentina.
Tu trabajo es preparar material para UNA clase con UN alumno, a partir de los apuntes que te pasa el profesor.
El material lo lee el profesor (no el alumno): él lo revisa y decide qué usar.

Cuando te pidan el material de la clase, armá:
1. Un resumen corto de qué temas aparecen en los apuntes.
2. Teoría breve y clara de esos temas, con un ejemplo resuelto paso a paso.
3. Entre 5 y 8 ejercicios, de más fácil a más difícil.
4. Al final, las soluciones de los ejercicios (con el desarrollo, no solo el resultado).

Reglas:
- Escribí en español de Argentina.
- Ajustá el nivel al año que cursa el alumno, si lo sabés.
- Basate en los apuntes. Si no hay apuntes o no se entienden, decilo y proponé material general de la materia.
- No inventes datos sobre el alumno.
- Usá texto plano: títulos en MAYÚSCULAS y listas con números o guiones. No uses Markdown (nada de #, ** ni tablas).
- Para fórmulas, escribilas en una línea (por ejemplo: x^2 + 3x = 0, raíz(9) = 3).
- Si después el profesor te pide cambios ("más fácil", "agregá un ejemplo"), rehacé solo lo que pide.`;

function pedidoInicial(reserva, cantidadApuntes) {
    // Arma el primer mensaje del chat con los datos de la reserva que SÍ
    // se pueden mandar: materia, año y notas.
    const lineas = [
        "Prepará el material para la clase.",
        `Materia: ${reserva.materia}.`,
        `Año que cursa: ${reserva.anio_cursando || "no lo indicó"}.`,
        `Notas del alumno: ${reserva.notas || "ninguna"}.`,
        cantidadApuntes > 0
            ? `Te adjunto ${cantidadApuntes} archivo${cantidadApuntes === 1 ? "" : "s"} de apuntes.`
            : "El alumno no subió apuntes.",
    ];
    return lineas.join("\n");
    // .join("\n"): une la lista en un solo texto, con un salto de línea entre cada una.
}

function responder(datos, estado) {
    // Response.json(datos, { status, headers }): arma la respuesta HTTP en
    // JSON. status es el código: 200 = bien, 400 = pedido mal hecho,
    // 404 = no existe, 502 = falló Gemini, 503 = no configurado.
    return Response.json(datos, { status: estado, headers: CORS });
}

async function pedirAGemini(modelo, clave, cuerpo, topeMs) {
    // Hace UN pedido a Gemini. Devuelve la respuesta de fetch, o null si no
    // se pudo conectar o si tardó más que el tope.
    try {
        return await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": clave,
                    // La clave va en un encabezado, no en la dirección (así no
                    // queda escrita en los registros de los servidores).
                },
                body: cuerpo,
                signal: AbortSignal.timeout(topeMs),
                // AbortSignal.timeout: cancela el pedido si pasa ese tiempo.
                // Al cancelarse, fetch lanza un error y cae en el catch.
            }
        );
    } catch {
        return null;
    }
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
// En XML, algunos caracteres se escriben con códigos: "&amp;" es "&".

function textoDeWord(bytes) {
    // Saca el texto de un .docx. Un .docx es en realidad un ZIP, y el texto
    // está adentro, en el archivo word/document.xml.
    // (La librería mammoth, que se usaba antes, no funciona en Deno.)
    const archivos = unzipSync(bytes, {
        filter: (archivo) => archivo.name === "word/document.xml",
        // filter: descomprime solo ese archivo, para gastar menos procesador.
    });
    const documento = archivos["word/document.xml"];
    if (!documento) return "";

    const xml = new TextDecoder().decode(documento);
    // TextDecoder: convierte los bytes en texto.

    return xml
        .split("</w:p>")
        // </w:p> cierra cada párrafo: nos queda una lista de párrafos.
        .map((parrafo) =>
            [...parrafo.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
                // matchAll: busca todos los pedazos de texto (<w:t>...</w:t>).
                // [^<]*: cualquier cantidad de caracteres que no sean "<".
                // Los paréntesis guardan el texto, que queda en m[1].
                .map((m) => m[1])
                .join("")
        )
        .filter((parrafo) => parrafo.trim() !== "")
        // Saca los párrafos vacíos.
        .join("\n")
        .replace(/&(amp|lt|gt|quot|apos);/g, (_, nombre) => ENTIDADES[nombre])
        // Cambia cada código por su carácter.
        .replace(/&#(\d+);/g, (_, numero) => String.fromCodePoint(Number(numero)));
        // Lo mismo para los códigos con número (por ejemplo &#233; es "é").
}

async function leerApuntes(supabase, nombres) {
    // Baja cada apunte de Storage y lo convierte en una "parte" del
    // mensaje para Gemini. Devuelve la lista de partes.
    const partes = [];
    for (const nombre of nombres) {
        const { data: archivo, error } = await supabase.storage.from("apuntes").download(nombre);
        // download: baja el archivo con la sesión del profesor (la política
        // de 012 solo deja si el apunte es de una reserva suya).
        if (error) continue;

        const extension = nombre.split(".").pop();
        // .pop(): saca y devuelve el último elemento ("pdf" de "abc.pdf").
        const buffer = Buffer.from(await archivo.arrayBuffer());

        if (extension === "docx") {
            partes.push({ text: `Contenido de un apunte en Word:\n${textoDeWord(buffer)}` });
        } else if (TIPOS[extension]) {
            partes.push({
                inlineData: { mimeType: TIPOS[extension], data: buffer.toString("base64") },
                // inlineData: el archivo va adentro del pedido, en base64
                // (bytes escritos como texto).
            });
        }
    }
    return partes;
}

Deno.serve(async (request) => {
    // Deno.serve: Supabase llama a esta función con cada pedido que llega.

    if (request.method === "OPTIONS") {
        // OPTIONS: antes del POST, el navegador pregunta si tiene permiso
        // (CORS). Contestamos que sí, sin hacer nada más.
        return new Response("ok", { headers: CORS });
    }
    if (request.method !== "POST") return responder({ error: "Método no permitido." }, 405);

    // 1. ¿Quién pide? supabase.functions.invoke manda solo el token de la
    // sesión del profesor en el encabezado Authorization.
    const autorizacion = request.headers.get("Authorization");
    if (!autorizacion) return responder({ error: "Tenés que iniciar sesión." }, 401);

    // Un cliente de Supabase que habla COMO ese profesor: la base aplica
    // sus políticas RLS, igual que en el navegador.
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL"),
        Deno.env.get("SUPABASE_ANON_KEY"),
        // Estas dos variables las carga Supabase solo.
        {
            global: { headers: { Authorization: autorizacion } },
            auth: { persistSession: false },
            // persistSession: false: en el servidor no hay dónde guardar la sesión.
        }
    );

    // 2. Qué pide.
    let cuerpo;
    try {
        cuerpo = await request.json();
    } catch {
        return responder({ error: "Pedido inválido." }, 400);
    }
    const reservaId = cuerpo.reservaId;
    const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
    // typeof x === "string": nos aseguramos de que sea texto antes de usar .trim().
    if (!reservaId) return responder({ error: "Falta la reserva." }, 400);
    if (mensaje.length > LARGO_MAXIMO_MENSAJE) {
        return responder({ error: `El pedido es muy largo (máximo ${LARGO_MAXIMO_MENSAJE} letras).` }, 400);
    }

    // 3. La reserva. Solo los datos que se pueden mandar a Gemini (nada de
    // nombre, apellido ni teléfono). Si es de otro profesor, la política
    // de 012 no la devuelve y da "no se encontró".
    const { data: reserva } = await supabase
        .from("reservas")
        .select("id, materia, anio_cursando, notas, apuntes, estado, profesor_id")
        .eq("id", reservaId)
        .maybeSingle();
    if (!reserva) return responder({ error: "No se encontró la reserva." }, 404);
    if (reserva.estado !== "confirmado") {
        return responder({ error: "Solo se puede usar Gemini en clases confirmadas." }, 400);
    }

    // 4. La clave de Gemini de ESE profesor: GEMINI_API_KEY_1 (profesora)
    // o GEMINI_API_KEY_2 (profesor).
    const clave = Deno.env.get(`GEMINI_API_KEY_${reserva.profesor_id}`);
    if (!clave) return responder({ error: "Falta configurar la clave de Gemini de este profesor." }, 503);

    // 5. El chat que ya existe (si hay).
    const { data: chat } = await supabase
        .from("chats")
        .select("id, historial")
        .eq("reserva_id", reservaId)
        .maybeSingle();
    const anterior = chat?.historial ?? [];

    if (!mensaje && anterior.length > 0) return responder({ error: "El material ya estaba generado." }, 400);
    if (mensaje && anterior.length === 0) return responder({ error: "Primero generá el material." }, 400);

    // 6. Armar el pedido. El historial se guarda como
    // [{ rol: "user" | "model", texto, inicial? }].
    // Los apuntes NO se guardan en el historial: se vuelven a bajar en cada
    // pedido y van pegados al primer mensaje (Gemini no recuerda nada entre
    // un pedido y otro: hay que mandarle la conversación entera cada vez).
    const apuntes = await leerApuntes(supabase, reserva.apuntes ?? []);
    const nuevo = mensaje
        ? { rol: "user", texto: mensaje }
        : { rol: "user", texto: pedidoInicial(reserva, apuntes.length), inicial: true };
    const historial = [...anterior, nuevo];

    const contents = historial.map((m, i) => ({
        role: m.rol,
        parts: i === 0 ? [...apuntes, { text: m.texto }] : [{ text: m.texto }],
        // En el primer mensaje van los apuntes + el texto; en los demás, solo el texto.
    }));

    // 7. Llamar a Gemini. Si el principal está saturado o tarda demasiado,
    // se pasa directo al respaldo: Google llegó a tardar 25 segundos en
    // contestar un 503, así que reintentar el mismo modelo pierde tiempo.
    const pedidoGemini = JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
        // systemInstruction: las reglas generales (el "rol" de Gemini).
        contents,
    });

    let respuesta = await pedirAGemini(MODELO, clave, pedidoGemini, TOPE_PRINCIPAL_MS);
    // let: la vamos a reemplazar si hay que usar el respaldo.

    if (!respuesta || SATURADO.includes(respuesta.status)) {
        // .includes: true si el código está en la lista SATURADO.
        console.warn("Gemini", MODELO, "respondió", respuesta?.status ?? "sin respuesta", "; se usa", MODELO_RESPALDO);
        // console.warn: queda en los logs de la función en Supabase.
        respuesta = await pedirAGemini(MODELO_RESPALDO, clave, pedidoGemini, TOPE_RESPALDO_MS);
    }

    if (!respuesta) {
        return responder({ error: "Gemini tardó demasiado o no se pudo conectar. Probá de nuevo." }, 502);
    }

    if (!respuesta.ok) {
        // respuesta.ok es false si el código HTTP no es 2xx.
        // 429 = se pasó el límite del plan gratuito.
        if (respuesta.status === 429) {
            return responder({ error: "Se terminó el cupo gratuito de Gemini por ahora. Probá más tarde." }, 502);
        }
        console.error("Gemini respondió", respuesta.status, await respuesta.text());
        return responder({ error: `Gemini no pudo responder (error ${respuesta.status}). Probá de nuevo.` }, 502);
    }

    const datos = await respuesta.json();
    const texto = datos.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    // La respuesta viene en candidates[0].content.parts (una lista de
    // partes de texto). ?. corta si algo no existe, en vez de romper.
    if (!texto) return responder({ error: "Gemini devolvió una respuesta vacía. Probá de nuevo." }, 502);

    const final = [...historial, { rol: "model", texto }];

    // 8. Guardar el historial (políticas de 020).
    const { error } = chat
        ? await supabase.from("chats").update({ historial: final }).eq("id", chat.id)
        : await supabase.from("chats").insert({ reserva_id: reservaId, historial: final });
    if (error) return responder({ error: "Gemini respondió, pero no se pudo guardar el chat." }, 500);

    return responder({ historial: final }, 200);
});
