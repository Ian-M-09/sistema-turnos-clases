import { supabase } from "@/lib/supabase";
// Funciones para preparar y subir archivos a Storage (paso A4).
// Los tipos y tamaños son los mismos que pusimos en supabase/007_storage.sql:
// si la pantalla dejara pasar algo distinto, Supabase lo rechazaría igual.

export const MB = 1024 * 1024;
// 1 MB = 1024 KB y 1 KB = 1024 bytes. Lo exportamos para usarlo en las pantallas.

export const MAX_COMPROBANTE = 2 * MB;
export const MAX_APUNTES = 3 * MB;
// MAX_APUNTES es el total entre TODOS los apuntes, no por archivo.

const EXTENSIONES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
// Un objeto usado como "diccionario": la clave es el MIME type (la
// etiqueta que dice qué es el archivo) y el valor, la extensión que le
// ponemos al nombre. Así un JPEG siempre termina en .jpg (nunca .jpeg),
// que es lo que acepta la política de 007.

export const TIPOS_COMPROBANTE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const TIPOS_APUNTES = [...TIPOS_COMPROBANTE, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
// "..." (spread) copia todos los elementos de la otra lista adentro de esta.

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];
const LADO_MAXIMO = 1600; // en píxeles; alcanza para leer una hoja sacada con el celular
const CALIDAD_JPEG = 0.8; // de 0 a 1: más bajo = más liviano pero más borroso

export function formatearMB(bytes) {
    // Ej: 1572864 bytes → "1,5". toLocaleString con "es-AR" usa coma decimal.
    return (bytes / MB).toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

export async function achicarImagen(archivo) {
    // "async" hace que la función pueda usar "await" adentro y que
    // devuelva una Promesa (un valor que llega más tarde).
    if (!TIPOS_IMAGEN.includes(archivo.type)) {
        return archivo;
        // .includes() dice si la lista contiene ese valor. Si no es una
        // foto (PDF o Word), la devolvemos tal cual.
    }

    let imagen;
    // "let" declara una variable que sí se puede reasignar más adelante.
    try {
        imagen = await createImageBitmap(archivo);
        // createImageBitmap lee el archivo y lo decodifica como imagen.
        // "await" espera a que termine antes de seguir.
    } catch {
        return archivo;
        // try/catch: si algo adentro del "try" falla (por ejemplo, una
        // imagen dañada), en vez de romper todo se ejecuta el "catch".
        // Devolvemos el original y que Supabase decida.
    }

    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    // Math.max da el lado más largo. Si mide 4000 px, la escala es 0.4.
    // Math.min(1, ...) evita AGRANDAR fotos que ya son chicas.
    const ancho = Math.round(imagen.width * escala);
    const alto = Math.round(imagen.height * escala);

    const canvas = document.createElement("canvas");
    // Un <canvas> es un "lienzo" donde se puede dibujar. Lo creamos en
    // memoria, sin mostrarlo en la página.
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext("2d");
    // El contexto "2d" es el objeto que tiene las funciones para dibujar.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, ancho, alto);
    // Pintamos el fondo de blanco: si un PNG tiene partes transparentes,
    // en JPEG quedarían negras.
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    // Dibuja la foto ya achicada al tamaño nuevo.
    imagen.close();
    // Libera la memoria de la imagen original.

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG));
    // canvas.toBlob convierte el dibujo en un archivo JPEG, pero avisa con
    // un "callback" (una función que llama cuando termina) en vez de una
    // Promesa. "new Promise" lo envuelve para poder usar await.
    // Un Blob es un "pedazo de datos binarios" (un archivo sin nombre).

    if (!blob || blob.size >= archivo.size) {
        return archivo;
        // "||" significa "o". Si no se pudo convertir o quedó MÁS pesado
        // que el original, nos quedamos con el original.
    }

    const nombreNuevo = archivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    // La expresión regular /\.[^.]+$/ encuentra la extensión del final
    // (un punto y lo que sigue) y la borramos para poner .jpg.
    return new File([blob], nombreNuevo, { type: "image/jpeg" });
    // new File arma un archivo de verdad (con nombre y tipo) a partir del Blob.
}

export async function subirArchivo(bucket, archivo) {
    const extension = EXTENSIONES[archivo.type];
    // EXTENSIONES[clave] busca el valor en el diccionario. Si el tipo no
    // está, da undefined.
    if (!extension) {
        throw new Error(`El archivo "${archivo.name}" no es de un tipo permitido.`);
        // "throw" lanza un error: corta la función y lo atrapa el try/catch
        // de quien la llamó (page.js).
    }

    const nombre = `${crypto.randomUUID()}.${extension}`;
    // crypto.randomUUID() genera un identificador aleatorio imposible de
    // adivinar, por ejemplo "3f2b9c1e-8a4d-4f6b-9e2a-1c5d7b8e9f00". Es el
    // formato que exige la política de subida de 007.

    const { error } = await supabase.storage
        .from(bucket)
        .upload(nombre, archivo, { contentType: archivo.type });
    // .upload sube el archivo. Sin "upsert: true" nunca reemplaza uno
    // existente (anon tampoco tendría permiso para hacerlo).

    if (error) {
        throw new Error(`No se pudo subir "${archivo.name}". Probá de nuevo.`);
    }
    return nombre;
    // Devolvemos el nombre con el que quedó guardado: es lo que se le pasa
    // a crear_reserva.
}
