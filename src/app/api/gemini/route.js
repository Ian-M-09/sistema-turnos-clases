// Ruta del SERVIDOR: /api/gemini (pasos E1, E2 y E3).
// Un archivo route.js adentro de src/app no es una página: es un
// "route handler", código que corre en el servidor de Next.js cuando el
// navegador le hace un pedido (fetch) a esa dirección. Por eso acá sí se
// puede usar la clave de Gemini: este código nunca llega al navegador.
//
// Qué hace, con un POST { reservaId, mensaje }:
//   - sin mensaje: genera el material inicial (crea el chat).
//   - con mensaje: le pide un ajuste a Gemini (sigue el chat).
// Devuelve { historial } o { error }.

import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
// mammoth: librería que saca el texto de un archivo Word (.docx).
import { PROMPT_SISTEMA, pedidoInicial } from "@/lib/promptGemini";

export const maxDuration = 60;
// maxDuration: cuántos segundos como máximo puede tardar esta ruta (Gemini
// con varios PDF puede tardar). El hosting puede tener su propio tope.

const MODELO = process.env.GEMINI_MODELO || "gemini-flash-latest";
// El modelo de Gemini. Se puede cambiar con la variable GEMINI_MODELO en
// .env.local sin tocar el código. "gemini-flash-latest" apunta siempre a
// la última versión Flash (verificar en AI Studio que esté en el plan gratuito).

const LARGO_MAXIMO_MENSAJE = 2000;
// Tope de letras para un pedido de ajuste (para no gastar de más).

const TIPOS = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};
// Los tipos de archivo que Gemini puede leer directo, según la extensión.
// Los .docx no están: se convierten a texto con mammoth.

function respuestaError(mensaje, estado) {
    // Response.json(datos, { status }): arma la respuesta HTTP en JSON.
    // status es el código HTTP: 400 = pedido mal hecho, 401 = sin sesión,
    // 404 = no existe, 502 = falló otro servicio (Gemini), 503 = no configurado.
    return Response.json({ error: mensaje }, { status: estado });
}

async function leerApuntes(supabase, nombres) {
    // Baja cada apunte de Storage y lo convierte en una "parte" del
    // mensaje para Gemini. Devuelve la lista de partes.
    const partes = [];
    for (const nombre of nombres) {
        const { data: archivo, error } = await supabase.storage.from("apuntes").download(nombre);
        // download: baja el archivo (con la sesión del profesor; la política
        // de 012 solo deja si el apunte es de una reserva suya).
        if (error) continue;

        const extension = nombre.split(".").pop();
        // .pop(): saca y devuelve el último elemento ("pdf" de "abc.pdf").
        const buffer = Buffer.from(await archivo.arrayBuffer());
        // arrayBuffer(): los bytes del archivo. Buffer es la forma de Node.js
        // de manejar bytes (solo existe en el servidor, no en el navegador).

        if (extension === "docx") {
            const { value } = await mammoth.extractRawText({ buffer });
            // extractRawText: el texto del Word, sin formato.
            partes.push({ text: `Contenido de un apunte en Word:\n${value}` });
        } else if (TIPOS[extension]) {
            partes.push({
                inlineData: { mimeType: TIPOS[extension], data: buffer.toString("base64") },
                // inlineData: el archivo va adentro del pedido, en base64
                // (bytes escritos como texto). Sirve hasta 20 MB y los
                // apuntes son de 3 MB como mucho.
            });
        }
    }
    return partes;
}

export async function POST(request) {
    // "export async function POST": Next.js llama a esta función cuando
    // llega un pedido POST a /api/gemini. request trae el pedido.

    // 1. ¿Quién pide? El navegador manda el token de la sesión del profesor
    // en el encabezado Authorization ("Bearer el-token").
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return respuestaError("Tenés que iniciar sesión.", 401);

    // Un cliente de Supabase que habla COMO ese profesor: la base aplica
    // sus políticas RLS, igual que en el navegador. Si el token es falso o
    // venció, la base no devuelve nada.
    // persistSession: false: en el servidor no hay dónde guardar la sesión.
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false },
        }
    );

    // 2. Qué pide.
    let cuerpo;
    try {
        cuerpo = await request.json();
        // request.json(): lee el cuerpo del pedido y lo convierte en objeto.
    } catch {
        // catch sin (error): no nos importa cuál fue el error.
        return respuestaError("Pedido inválido.", 400);
    }
    const reservaId = cuerpo.reservaId;
    const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
    // typeof x === "string": nos aseguramos de que sea texto antes de usar .trim().
    if (!reservaId) return respuestaError("Falta la reserva.", 400);
    if (mensaje.length > LARGO_MAXIMO_MENSAJE) {
        return respuestaError(`El pedido es muy largo (máximo ${LARGO_MAXIMO_MENSAJE} letras).`, 400);
    }

    // 3. La reserva. Solo los datos que se pueden mandar a Gemini (nada de
    // nombre, apellido ni teléfono). Si es de otro profesor, la política
    // de 012 no la devuelve y da "no se encontró".
    const { data: reserva } = await supabase
        .from("reservas")
        .select("id, materia, anio_cursando, notas, apuntes, estado, profesor_id")
        .eq("id", reservaId)
        .maybeSingle();
    if (!reserva) return respuestaError("No se encontró la reserva.", 404);
    if (reserva.estado !== "confirmado") {
        return respuestaError("Solo se puede usar Gemini en clases confirmadas.", 400);
    }

    // 4. La clave de Gemini de ESE profesor (una por profesor, decidido 17/11):
    // GEMINI_API_KEY_1 (profesora) o GEMINI_API_KEY_2 (profesor).
    // process.env[texto]: lee una variable cuyo nombre armamos con texto.
    const clave = process.env[`GEMINI_API_KEY_${reserva.profesor_id}`];
    if (!clave) return respuestaError("Falta configurar la clave de Gemini de este profesor.", 503);

    // 5. El chat que ya existe (si hay).
    const { data: chat } = await supabase
        .from("chats")
        .select("id, historial")
        .eq("reserva_id", reservaId)
        .maybeSingle();
    const anterior = chat?.historial ?? [];

    if (!mensaje && anterior.length > 0) return respuestaError("El material ya estaba generado.", 400);
    if (mensaje && anterior.length === 0) return respuestaError("Primero generá el material.", 400);

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

    // 7. Llamar a Gemini (su API REST, con fetch, como Telegram en 018).
    let respuesta;
    try {
        respuesta = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": clave,
                    // La clave va en un encabezado, no en la dirección (así no
                    // queda escrita en los registros de los servidores).
                },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
                    // systemInstruction: las reglas generales (el "rol" de Gemini).
                    contents,
                }),
                // JSON.stringify: convierte el objeto en texto JSON.
            }
        );
    } catch {
        return respuestaError("No se pudo conectar con Gemini. Probá de nuevo.", 502);
    }

    if (!respuesta.ok) {
        // respuesta.ok es false si el código HTTP no es 2xx.
        // 429 = se pasó el límite del plan gratuito.
        if (respuesta.status === 429) {
            return respuestaError("Se terminó el cupo gratuito de Gemini por ahora. Probá más tarde.", 502);
        }
        console.error("Gemini respondió", respuesta.status, await respuesta.text());
        // console.error en el servidor: se ve en la terminal de "npm run dev",
        // no en el navegador. Nunca mostramos la clave.
        return respuestaError("Gemini no pudo responder. Probá de nuevo.", 502);
    }

    const datos = await respuesta.json();
    const texto = datos.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    // La respuesta viene en candidates[0].content.parts (una lista de
    // partes de texto). ?. corta si algo no existe, en vez de romper.
    if (!texto) return respuestaError("Gemini devolvió una respuesta vacía. Probá de nuevo.", 502);

    const final = [...historial, { rol: "model", texto }];

    // 8. Guardar el historial (políticas de 020).
    const { error } = chat
        ? await supabase.from("chats").update({ historial: final }).eq("id", chat.id)
        : await supabase.from("chats").insert({ reserva_id: reservaId, historial: final });
    if (error) return respuestaError("Gemini respondió, pero no se pudo guardar el chat.", 500);

    return Response.json({ historial: final });
}
