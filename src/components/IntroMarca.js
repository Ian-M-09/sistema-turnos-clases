"use client";
// "use client" porque usePathname solo funciona en el navegador.

import { usePathname } from "next/navigation";

// Animación de entrada con el logo. Toda la animación está hecha con CSS
// (clase .intro de globals.css): aunque falle el JavaScript, la capa
// desaparece sola y la página se puede usar igual.
// Vive en layout.js, que no se vuelve a armar al pasar de una página a otra.
// Por eso se ve al abrir o recargar el sitio, y no en cada cambio de página.

export default function IntroMarca() {
    const ruta = usePathname();
    // usePathname: la dirección actual, por ejemplo "/reservar".

    if (ruta.startsWith("/admin")) return null;
    // Los profesores entran a trabajar: en el panel no se muestra.

    return (
        <div className="intro" aria-hidden="true">
            {/* aria-hidden: los lectores de pantalla la saltean, porque es
                solo decoración. */}
            <span className="marca-titulo">M&amp;R</span>
            {/* &amp; es la forma de escribir el símbolo & en JSX. */}
            <span className="marca-subtitulo">academia</span>
        </div>
    );
}
