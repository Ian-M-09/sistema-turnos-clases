import Link from "next/link";
import FormularioAlumno from "@/components/FormularioAlumno";

export default function Reservar() {
    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-8 gap-6">
        <h1 className="text-3xl font-bold">Reservar un turno</h1>
        <FormularioAlumno />
        <Link href="/" className="text-blue-600 hover:underline">
            ← Volver al inicio
        </Link>
        </main>
    );
}