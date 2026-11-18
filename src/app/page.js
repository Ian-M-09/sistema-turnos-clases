import Link from "next/link";
import Ubicacion from "@/components/Ubicacion";

const LINK_INSTAGRAM = "https://www.instagram.com/myr.academia/";
// Si cambia el usuario de la cuenta, alcanza con cambiar esta línea.

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 text-center p-8">
      <h1 className="marca-titulo">M&amp;R</h1>
      <p className="marca-subtitulo mb-8">academia</p>
      <p className="text-lg mb-6">
        Reservá tu turno según los horarios disponibles.
      </p>
      <Link href="/reservar" className="vidrio-activo px-10 py-4 text-lg font-semibold">
        {/* vidrio-activo: el botón principal va siempre con el color de la
            página, para que sea lo primero que se vea. */}
        Reservar un turno
      </Link>
      <a
        href={LINK_INSTAGRAM}
        target="_blank"
        // target="_blank": abre Instagram en otra pestaña, sin perder la página.
        rel="noopener noreferrer"
        // rel: por seguridad, la pestaña nueva no puede controlar a esta.
        className="vidrio mt-6 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm"
        // inline-flex items-center: alinea el ícono y el texto en el medio.
      >
        <svg
          aria-hidden="true"
          // aria-hidden: el ícono es decoración; el lector de pantalla lee el texto.
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          // currentColor: usa el color del texto, así el ícono también cambia
          // de color cuando se presiona el botón.
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
        </svg>
        Seguinos en Instagram
      </a>
      <div className="mt-8 w-full flex justify-center">
        <Ubicacion />
      </div>
    </main>
  );
}