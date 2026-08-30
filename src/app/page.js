import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 text-center p-8">
      <h1 className="text-3xl font-bold mb-4">Clases particulares</h1>
      <p className="text-lg mb-6">
        Reservá tu turno según los horarios disponibles de la profesora.
      </p>
      <Link href="/reservar" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
        Reservar un turno
      </Link>
    </main>
  );
}