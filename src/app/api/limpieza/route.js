// Ruta del SERVIDOR: /api/limpieza (paso E4).
//   GET:  muestra qué se borraría (cuántos archivos, chats y MB), sin borrar.
//   POST: borra de verdad.
// Las dos piden la sesión de un profesor (cualquiera de los dos).
//
// Para borrar usa la clave service_role de Supabase: esa clave saltea
// TODAS las políticas RLS (puede leer y borrar cualquier cosa). Por eso:
//   - vive solo acá, en el servidor (variable SIN NEXT_PUBLIC_);
//   - nunca se usa antes de comprobar que quien pide es un profesor;
//   - qué borrar lo decide la base (021), no lo que mande el navegador.

import { createClient } from "@supabase/supabase-js";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

function respuestaError(mensaje, estado) {
    return Response.json({ error: mensaje }, { status: estado });
}

async function esProfesor(request) {
    // El navegador manda el token de la sesión.
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return false;

    const comoUsuario = createClient(URL_SUPABASE, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
    });
    const { data } = await comoUsuario.rpc("mi_profesor_id");
    // mi_profesor_id (010): el profesor de esta cuenta, o null si no es profesor.
    return data !== null && data !== undefined;
}

function clienteAdmin() {
    // El cliente con la clave service_role. Si falta la clave, devuelve null.
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!clave) return null;
    return createClient(URL_SUPABASE, clave, { auth: { persistSession: false } });
}

async function armarResumen(admin) {
    // Pide a la base (021) la lista de reservas y de archivos a limpiar.
    const { data: reservas, error: e1 } = await admin.rpc("reservas_para_limpiar");
    const { data: archivos, error: e2 } = await admin.rpc("archivos_para_limpiar");
    if (e1 || e2) return null;

    const ids = reservas.map((r) => r.reserva_id);
    let chats = 0;
    if (ids.length > 0) {
        const { count } = await admin
            .from("chats")
            .select("id", { count: "exact", head: true })
            .in("reserva_id", ids);
        // { count: "exact", head: true }: no trae las filas, solo cuántas son.
        chats = count ?? 0;
    }

    const huerfanos = archivos.filter((a) => a.reserva_id === null);
    const bytes = archivos.reduce((suma, a) => suma + Number(a.bytes), 0);
    // .reduce: recorre la lista acumulando un valor (acá, la suma de bytes).
    // Arranca en 0 (el segundo parámetro).

    return {
        ids,
        archivos,
        resumen: {
            reservas: ids.length,
            archivosDeReservas: archivos.length - huerfanos.length,
            huerfanos: huerfanos.length,
            chats,
            megas: Math.round((bytes / (1024 * 1024)) * 10) / 10,
            // bytes → MB con un decimal (1 MB = 1024 × 1024 bytes).
        },
    };
}

export async function GET(request) {
    if (!(await esProfesor(request))) return respuestaError("No tenés permiso.", 401);
    const admin = clienteAdmin();
    if (!admin) return respuestaError("Falta configurar la clave service_role.", 503);

    const datos = await armarResumen(admin);
    if (!datos) return respuestaError("No se pudo armar el resumen.", 500);
    return Response.json(datos.resumen);
}

export async function POST(request) {
    if (!(await esProfesor(request))) return respuestaError("No tenés permiso.", 401);
    const admin = clienteAdmin();
    if (!admin) return respuestaError("Falta configurar la clave service_role.", 503);

    // Se vuelve a armar la lista acá (no se usa la que vio la pantalla):
    // entre ver el resumen y apretar el botón pudo cambiar algo.
    const datos = await armarResumen(admin);
    if (!datos) return respuestaError("No se pudo armar la lista.", 500);

    // 1. Borrar los archivos, de a 100 por pedido, con la API de Storage.
    for (const bucket of ["comprobantes", "apuntes"]) {
        const nombres = datos.archivos.filter((a) => a.bucket === bucket).map((a) => a.nombre);
        for (let i = 0; i < nombres.length; i += 100) {
            // for clásico: i arranca en 0 y sube de a 100 mientras sea menor
            // que la cantidad. .slice(i, i + 100): los 100 de esa vuelta.
            const { error } = await admin.storage.from(bucket).remove(nombres.slice(i, i + 100));
            if (error) return respuestaError("Falló el borrado de archivos. Probá de nuevo.", 500);
            // Si falla a la mitad, lo que ya se borró queda borrado y lo
            // demás aparece en la próxima limpieza (nada queda a medias en la base).
        }
    }

    // 2. Borrar los chats y marcar las reservas como limpias.
    if (datos.ids.length > 0) {
        const { error: e1 } = await admin.from("chats").delete().in("reserva_id", datos.ids);
        const { error: e2 } = await admin
            .from("reservas")
            .update({ archivos_borrados_en: new Date().toISOString() })
            .in("id", datos.ids);
        // toISOString(): la fecha y hora en el formato que entiende la base.
        if (e1 || e2) return respuestaError("Se borraron los archivos, pero falló marcar las reservas.", 500);
    }

    return Response.json(datos.resumen);
    // Devuelve lo que se borró (el mismo formato que el resumen).
}
