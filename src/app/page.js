import Link from "next/link";
import Ubicacion from "@/components/Ubicacion";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 text-center p-8">
      <h1 className="text-3xl font-bold mb-4">CLASES PARTICULARES</h1>
      <p className="text-lg mb-6">
        Reservá tu turno según los horarios disponibles.
      </p>
      <Link href="/reservar" className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition">
        Reservar un turno
      </Link>
      <div className="mt-8 w-full flex justify-center">
        <Ubicacion />
      </div>
    </main>
  );
}