"use client";

import { useState } from "react";

export default function FormularioAlumno({ turno }) {
    const [nombre, setNombre] = useState("");
    const [materia, setMateria] = useState("");
    const [archivo, setArchivo] = useState(null);

    function handleSubmit(e) {
        e.preventDefault();
        console.log("Fecha:", turno.fecha);
        console.log("Hora:", turno.hora);
        console.log("Nombre:", nombre);
        console.log("Materia:", materia);
        console.log("Archivo:", archivo);
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md">
        <div className="flex flex-col text-left">
            <label htmlFor="nombre" className="mb-1 font-medium">
            Nombre completo
            </label>
            <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="materia" className="mb-1 font-medium">
            Materia
            </label>
            <input
            id="materia"
            type="text"
            value={materia}
            onChange={(e) => setMateria(e.target.value)}
            className="border rounded-lg px-3 py-2"
            required
            />
        </div>

        <div className="flex flex-col text-left">
            <label htmlFor="archivo" className="mb-1 font-medium">
            Apuntes de la materia (PDF, foto o Word) — opcional
            </label>
            <input
            id="archivo"
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            onChange={(e) => setArchivo(e.target.files[0])}
            className="border rounded-lg px-3 py-2"
            />
        </div>

        <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
            Continuar
        </button>
        </form>
    );
}