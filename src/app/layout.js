import { Montserrat, Work_Sans } from "next/font/google";
// Montserrat (geométrica, sans-serif) reemplaza a Lora en los títulos.
// Work Sans sigue en los textos.
import "./globals.css";
import IntroMarca from "@/components/IntroMarca";
import Encabezado from "@/components/Encabezado";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  // Esto crea la variable CSS --font-montserrat, que usamos en globals.css.
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "M&R Academia",
  // title: el texto de la pestaña del navegador. También es el título que
  // muestran WhatsApp y Google cuando se comparte o se busca el link.
  // Las páginas que tengan su propio title (como /admin) lo reemplazan.
  description: "Reservá tu clase particular: elegí el día y el horario y pagá el depósito por transferencia.",
  // description: el texto corto que aparece debajo del título en Google y
  // en la vista previa del link en WhatsApp.
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased"  >

      <body className={`${montserrat.variable} ${workSans.variable} antialiased min-h-full flex flex-col`}>
        {/* min-h-full: el body mide como mínimo el alto de la pantalla (el
            html ya tiene h-full). flex flex-col: ordena a sus hijos (la
            página y el footer) uno debajo del otro. Como el <main> de cada
            página tiene flex-1 (ocupa todo el espacio que sobra), el footer
            queda empujado al final aunque la página tenga poco contenido. */}
        <IntroMarca />
        <Encabezado />
        {children}
        <footer className="border-t border-borde mt-auto py-6 px-4 text-center text-sm text-texto/70">
          {/* mt-auto: margen de arriba automático; es un refuerzo para que
              el footer quede pegado abajo. */}
          <p>
            Desarrollado por{" "}
            {/* {" "}: un espacio explícito. JSX borra los espacios al final
                de una línea, y sin esto quedaría "porIan". */}
            <a
              href="https://ian-m-09.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-texto hover:text-acento-hover underline underline-offset-2"
            >
              Ian Miño
            </a>
            {" · "}
            {/* ·: un punto medio para separar las dos partes. */}
            © {new Date().getFullYear()} M&amp;R Academia. Todos los derechos reservados.
            {/* ©: el símbolo de copyright. new Date().getFullYear(): el año
                actual. Esta página se arma cuando Netlify compila el sitio,
                así que el año se actualiza en el primer deploy de cada año. */}
          </p>
        </footer>
      </body>
    </html>
  );
}
