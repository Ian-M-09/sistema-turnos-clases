// Ruta del SERVIDOR: /api/subir.
// POST { dni, bucket, extension } → devuelve { nombre, token } para subir
// UN archivo a Storage.
//
// Por qué existe: antes el navegador subía directo a Storage y cualquiera
// podía llenar el espacio sin tener un DNI registrado. Ahora primero pasa
// por acá: la base valida el DNI (permiso_subida, 024) y recién ahí se
// entrega una URL firmada.
//
// URL firmada: un permiso temporal para subir UN archivo con UN nombre
// exacto. El token es la "firma": Supabase comprueba que la generó alguien
// con la clave secreta, y por eso no hace falta una política de subida.

import { createClient } from "@supabase/supabase-js";

const EXTENSIONES_POR_BUCKET = {
    comprobantes: ["pdf", "jpg", "png", "webp"],
    apuntes: ["pdf", "jpg", "png", "webp", "docx"],
};
// Las mismas listas que la política de 007.

const RECHAZOS = {
    demasiados_intentos: {
        estado: 429,
        mensaje: "Hubo demasiados intentos con DNIs que no están registrados. Esperá 15 minutos y probá de nuevo.",
    },
    dni_no_registrado: {
        estado: 404,
        mensaje: "Ese DNI no está registrado. Escribile a tu profesor para que te registre.",
    },
    bloqueado: {
        estado: 403,
        mensaje: "Ya no queda lugar en los horarios elegidos. Elegí otro horario.",
        // El mismo texto que crear_reserva: al alumno bloqueado no se le
        // dice que está bloqueado.
    },
    tiene_pendiente: {
        estado: 409,
        mensaje: "Ya tenés una reserva esperando que el profesor la confirme. Cuando la confirme o la rechace vas a poder hacer otra.",
    },
    limite_subidas: {
        estado: 429,
        mensaje: "Subiste demasiados archivos en poco tiempo. Esperá 30 minutos y probá de nuevo.",
    },
    limite_diario: {
        estado: 429,
        mensaje: "Llegaste al máximo de archivos que se pueden subir en un día. Probá de nuevo mañana.",
        // Tope de 20 URLs cada 24 horas por alumno (026).
    },
};
// Traduce cada palabra que devuelve permiso_subida a un código HTTP y a un
// mensaje para el alumno. 429 = demasiados pedidos, 409 = conflicto con
// algo que ya existe, 403 = sin permiso, 404 = no existe.

function respuestaError(mensaje, estado) {
    return Response.json({ error: mensaje }, { status: estado });
}

export async function POST(request) {
    // 1. Leer el pedido. request.json() falla si el cuerpo no es JSON:
    // .catch(() => null) convierte ese error en un null.
    const cuerpo = await request.json().catch(() => null);
    const { dni, bucket, extension } = cuerpo ?? {};

    // 2. Validar lo que mandó el navegador: nunca hay que confiar en eso.
    if (typeof dni !== "string" || !/^[0-9]{7,8}$/.test(dni)) {
        return respuestaError("El DNI tiene que tener 7 u 8 números, sin puntos.", 400);
    }
    if (
        typeof bucket !== "string" ||
        !Object.hasOwn(EXTENSIONES_POR_BUCKET, bucket) ||
        !EXTENSIONES_POR_BUCKET[bucket].includes(extension)
    ) {
        // Object.hasOwn(objeto, clave): true solo si la clave es propia del
        // objeto. Evita que pasen claves heredadas, como "constructor".
        return respuestaError("Ese tipo de archivo no está permitido.", 400);
    }

    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!clave) return respuestaError("Falta configurar la clave service_role.", 503);
    // Esta clave saltea RLS: vive solo en el servidor (sin NEXT_PUBLIC_).
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, clave, {
        auth: { persistSession: false },
        // persistSession: false: en el servidor no hay dónde guardar la sesión.
    });

    // 3. La IP real del alumno. Este encabezado lo agrega Netlify. No se usa
    // x-forwarded-for porque el navegador puede mandarlo con cualquier valor.
    const ip = request.headers.get("x-nf-client-connection-ip") ?? "sin-ip";

    // 4. La base decide si este DNI puede subir.
    const { data: resultado, error: errorPermiso } = await admin.rpc("permiso_subida", {
        p_dni: dni,
        p_ip: ip,
    });
    if (errorPermiso) return respuestaError("No se pudo validar el DNI. Probá de nuevo.", 500);

    if (resultado !== "ok") {
        const rechazo = RECHAZOS[resultado];
        return respuestaError(rechazo?.mensaje ?? "No se pudo validar el DNI. Probá de nuevo.", rechazo?.estado ?? 500);
        // ?.: si rechazo no existe, da undefined en vez de romper.
        // ??: usa el valor de la derecha si el de la izquierda no existe.
    }

    // 5. El nombre lo elige el servidor: el navegador no puede pisar ni
    // adivinar el archivo de otro alumno.
    const nombre = `${crypto.randomUUID()}.${extension}`;

    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(nombre);
    if (error) return respuestaError("No se pudo preparar la subida. Probá de nuevo.", 500);

    return Response.json({ nombre, token: data.token });
    // uploadToSignedUrl (en el navegador) solo necesita el nombre y el token.
}
