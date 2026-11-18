"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Barra de arriba con el logo. En la página de inicio no se muestra,
// porque ahí el logo ya aparece en grande.

export default function Encabezado() {
    const ruta = usePathname();
    if (ruta === "/") return null;

    return (
        <header className="barra-vidrio sticky top-0 z-40 px-4 py-3 text-center">
            {/* sticky top-0: la barra queda pegada arriba al bajar por la página.
                z-40: se dibuja por encima del contenido. */}
            <Link href="/" className="text-xl font-extrabold tracking-tight" aria-label="M&R academia, ir al inicio">
                M&amp;R
            </Link>
        </header>
    );
}
