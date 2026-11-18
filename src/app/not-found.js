// Página 404 (paso F2): se muestra cuando alguien entra a una dirección
// que no existe (por ejemplo /reserva en vez de /reservar).
// not-found.js: nombre especial de Next.js. Al estar en la raíz de src/app,
// sirve para TODO el sitio. Se muestra adentro de layout.js, así que ya
// tiene las fuentes, los colores y el footer, igual que las demás páginas.
// Es un componente del servidor (sin "use client"): no tiene estado ni botones
// con lógica, solo un link.

import Link from "next/link";
// Link: el link de Next.js. Cambia de página sin recargar todo el sitio.

export const metadata = {
    title: "Página no encontrada | M&R Academia",
    // Título de la pestaña mientras se ve esta página.
};

export default function NotFound() {
    // export default: Next.js busca esta función y la muestra como la página.
    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-8">
            {/* Mismas clases que la home (src/app/page.js) para que se vea igual. */}
            <p className="text-6xl font-bold text-acento mb-4">404</p>
            <h1 className="text-2xl font-bold mb-4">Esta página no existe</h1>
            <p className="text-lg mb-6">
                Puede que el link esté mal escrito o que la página se haya movido.
            </p>
            <Link href="/" className="vidrio px-6 py-3">
                Volver al inicio
            </Link>
        </main>
    );
}
