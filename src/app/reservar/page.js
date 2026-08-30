import Link from "next/link";

export default function Reservar() {
    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <h1 className="text-3xl font-bold mb-4">Reservar un turno</h1>
            <p className="text-lg mb-6">Acá va a ir el calendario y el formulario de reserva.</p>
            <Link href="/" className="text-blue-600 hover:underline">
            ← Volver al inicio
            </Link>
        </main>
    );
}