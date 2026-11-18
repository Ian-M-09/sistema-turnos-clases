// Muestra la dirección del estudio con un enlace que abre Google Maps.
// No lleva "use client": no tiene estado ni clics manejados con
// JavaScript (el enlace lo maneja el navegador solo), así que puede
// usarse tanto en páginas del servidor como del cliente.

export const DIRECCION = "12 de Octubre 827, Salta Capital";

export const LINK_MAPS = "https://maps.app.goo.gl/sTioGYkccd8vUUwT7";
// Link corto de Google Maps (G2): se saca desde la app de Maps con
// Compartir. Apunta al pin exacto del estudio y queda corto en el mensaje
// de WhatsApp (antes era una búsqueda por texto, larga y llena de %20).
// Al link que da Compartir se le sacó el final "?g_st=aw": solo le dice a
// Google desde dónde se compartió, no cambia a dónde lleva.
// En el celular abre directamente la app de Google Maps si está instalada.
// Si el estudio se muda, hay que cambiar este link y DIRECCION.

export default function Ubicacion() {
    return (
        <div className="text-center w-full max-w-md">
            <p className="font-medium mb-2">📍 {DIRECCION}</p>
            <a
                href={LINK_MAPS}
                target="_blank"
                // target="_blank": abre en una pestaña nueva, así el alumno no
                // pierde la página.
                rel="noopener noreferrer"
                // rel="noopener noreferrer": por seguridad, la pestaña nueva
                // no puede controlar a esta (siempre va junto con _blank).
                className="inline-block vidrio px-3.5 py-1.5 text-sm"
            >
                Cómo llegar (Google Maps)
            </a>
        </div>
    );
}
