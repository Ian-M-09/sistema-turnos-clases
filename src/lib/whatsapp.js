import { DIRECCION, LINK_MAPS } from "@/components/Ubicacion";

// Arma los links de WhatsApp con el mensaje ya escrito (paso D3).
// El profesor toca el botón, se abre WhatsApp con el mensaje listo para
// el número del alumno, y solo tiene que tocar Enviar.

export function linkWhatsApp(telefono, mensaje) {
    return `https://wa.me/549${telefono}?text=${encodeURIComponent(mensaje)}`;
    // wa.me es el link oficial de WhatsApp para abrir un chat.
    // 549 es el prefijo de Argentina para celulares (54 el país y 9 los
    // celulares), y después van los 10 dígitos que guardamos.
    // ?text= lleva el mensaje; encodeURIComponent lo convierte para que
    // pueda ir en una URL (los saltos de línea, los emojis, los espacios).
}

// clase = { nombre, materia, dia, desde, hasta }, por ejemplo
// { nombre: "Juan", materia: "Matemática", dia: "lunes 16/11", desde: "14:00", hasta: "16:00" }

export function mensajeConfirmada(clase) {
    return [
        `¡Hola ${clase.nombre}! Tu clase de ${clase.materia} quedó CONFIRMADA ✅`,
        "",
        `📅 ${clase.dia}, de ${clase.desde} a ${clase.hasta}`,
        `📍 ${DIRECCION}`,
        LINK_MAPS,
        "",
        "Política de devolución: si cancelás con más de 24 horas de anticipación, te devolvemos el 100% del pago. Con menos de 24 horas, el pago no se devuelve.",
        "",
        "¡Te esperamos!",
    ].join("\n");
    // Armamos una lista con cada línea y .join("\n") las une con un salto
    // de línea entre cada una ("\n" es el carácter de "enter"). Las
    // cadenas vacías "" dejan una línea en blanco.
}

export function mensajeRechazada(clase) {
    return [
        `Hola ${clase.nombre}, no pudimos confirmar tu reserva de ${clase.materia} del ${clase.dia} de ${clase.desde} a ${clase.hasta}.`,
        "",
        "Si hiciste la transferencia, respondenos este mensaje y lo resolvemos. Podés volver a reservar otro horario en la página.",
    ].join("\n");
}

export function mensajeCancelada(clase, devolucion, monto) {
    const motivo = devolucion
        ? `Como cancelaste con más de 24 horas de anticipación, te vamos a devolver el 100% del pago ($${monto}).`
        : "Como cancelaste con menos de 24 horas de anticipación, según la política de devolución el pago no se devuelve.";
    return [
        `Hola ${clase.nombre}, registramos la cancelación de tu clase de ${clase.materia} del ${clase.dia} de ${clase.desde} a ${clase.hasta}.`,
        "",
        motivo,
    ].join("\n");
}
