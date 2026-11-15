// Muestra la dirección del estudio con un enlace que abre Google Maps.
// No lleva "use client": no tiene estado ni clics manejados con
// JavaScript (el enlace lo maneja el navegador solo), así que puede
// usarse tanto en páginas del servidor como del cliente.

export const DIRECCION = "12 de Octubre 827, Salta Capital";

export const LINK_MAPS =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("12 de Octubre 827, Salta, Argentina");
// Este es el formato oficial de Google para abrir una búsqueda en Maps.
// encodeURIComponent convierte el texto para que pueda ir en una URL
// (los espacios pasan a ser %20, la coma a %2C, etc.). En el celular,
// el link abre directamente la app de Google Maps si está instalada.

export default function Ubicacion() {
    return (
        <div className="bg-superficie border border-borde rounded-lg p-4 text-center w-full max-w-md">
            <p className="font-medium mb-2">📍 {DIRECCION}</p>
            <a
                href={LINK_MAPS}
                target="_blank"
                // target="_blank": abre en una pestaña nueva, así el alumno no
                // pierde la página.
                rel="noopener noreferrer"
                // rel="noopener noreferrer": por seguridad, la pestaña nueva
                // no puede controlar a esta (siempre va junto con _blank).
                className="inline-block bg-acento text-white px-5 py-2 rounded-lg hover:bg-acento-hover transition"
            >
                Cómo llegar (Google Maps)
            </a>
        </div>
    );
}
