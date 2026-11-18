// Función programada de Netlify (paso F1): una vez por día le pide algo
// chiquito a Supabase para que el proyecto no se pause por inactividad
// (el plan gratuito lo pausa si pasa una semana sin pedidos).
// No es parte de Next.js: Netlify la despliega aparte porque está en
// la carpeta netlify/functions, y la ejecuta sola según el horario de abajo.
// .mjs: archivo de JavaScript con módulos (import/export), igual que en src.

export default async () => {
    // export default: lo que este archivo "entrega" hacia afuera. Netlify
    // busca esa función y la ejecuta en cada horario programado.
    // async: la función puede usar await (esperar algo que tarda, como un
    // pedido por internet).
    // () => { ... }: función flecha sin parámetros.

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // const: variable que no se vuelve a asignar.
    // process.env: las variables de entorno. Son las mismas que ya cargaste
    // en Netlify para el sitio, así que no hay que configurar nada nuevo.
    // Usamos la clave pública: alcanza para leer una tabla pública.

    if (!url || !clave) {
        // !: "no". ||: "o". Si falta alguna de las dos (vacía o inexistente)...
        throw new Error("Faltan las variables de Supabase en Netlify.");
        // throw: corta la función con un error. Netlify lo muestra en el
        // registro (log) de la función, así te enterás de que algo falló.
        // new Error("..."): crea un objeto de error con ese mensaje.
    }

    const respuesta = await fetch(`${url}/rest/v1/profesores?select=id&limit=1`, {
        // await: espera a que Supabase conteste antes de seguir.
        // fetch: hace un pedido HTTP (como cuando el navegador abre una página).
        // `...${url}...`: texto con comillas invertidas, donde ${} mete el
        // valor de una variable.
        // /rest/v1/profesores: la API de Supabase para la tabla profesores
        // (tiene lectura pública, ver 009).
        // ?select=id&limit=1: pide solo la columna id y una sola fila. Es lo
        // mínimo posible: no importa la respuesta, importa que haya un pedido.
        headers: { apikey: clave },
        // headers: datos extra del pedido. Supabase pide la clave en "apikey".
    });

    if (!respuesta.ok) {
        // .ok: true si Supabase contestó bien (código 200 a 299).
        throw new Error(`Supabase respondió ${respuesta.status}`);
        // .status: el código de respuesta (por ejemplo 401 si la clave está mal).
    }

    console.log("Ping a Supabase OK");
    // console.log: escribe en el log de la función. Sirve para ver en
    // Netlify que se ejecutó bien.
};

export const config = {
    // export const config: Netlify lee este objeto para saber cómo ejecutar
    // la función.
    schedule: "@daily",
    // schedule: cada cuánto se ejecuta. "@daily" = una vez por día, a las
    // 00:00 UTC (21:00 en Argentina). Al tener schedule, la función no
    // tiene URL pública: nadie de afuera la puede llamar.
};
