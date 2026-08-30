"use client";

import { useState } from "react";

// Datos de mentira: fechas con horarios disponibles.
// Formato "YYYY-MM-DD" para que sea fácil de comparar como texto.
const disponibilidad = [
    { fecha: "2026-09-01", horarios: ["10:00", "11:00", "15:00"] },
    { fecha: "2026-09-03", horarios: ["09:00", "14:00"] },
    { fecha: "2026-09-04", horarios: [] },
    { fecha: "2026-09-08", horarios: ["16:00", "17:00"] },
];

export default function Calendario({ onSeleccionarHorario }) {
    const [diaSeleccionado, setDiaSeleccionado] = useState(null);

    const anio = 2026;
    const mes = 8; // Septiembre (recordá: 0 = enero, entonces 8 = septiembre)

    const primerDiaDelMes = new Date(anio, mes, 1);
    const diasEnElMes = new Date(anio, mes + 1, 0).getDate();
    const diaDeLaSemanaInicial = primerDiaDelMes.getDay();

    // Armamos un array con los números de día del mes: [1, 2, 3, ..., 30]
    const dias = Array.from({ length: diasEnElMes }, (_, i) => i + 1);

    // Armamos "espacios vacíos" para alinear el día 1 en la columna correcta
    const espaciosVacios = Array.from({ length: diaDeLaSemanaInicial }, (_, i) => i);

    function formatearFecha(dia) {
        const mesTexto = String(mes + 1).padStart(2, "0");
        const diaTexto = String(dia).padStart(2, "0");
        return `${anio}-${mesTexto}-${diaTexto}`;
    }

    function tieneDisponibilidad(fechaTexto) {
        const dia = disponibilidad.find((d) => d.fecha === fechaTexto);
        return dia && dia.horarios.length > 0;
    }

    function handleClickDia(dia) {
        const fechaTexto = formatearFecha(dia);
        if (tieneDisponibilidad(fechaTexto)) {
        setDiaSeleccionado(fechaTexto);
        }
    }

    const horariosDelDiaSeleccionado = diaSeleccionado
        ? disponibilidad.find((d) => d.fecha === diaSeleccionado)?.horarios
        : [];

    return (
        <div className="w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Septiembre 2026</h2>

        <div className="grid grid-cols-7 gap-2 text-sm mb-2 font-medium">
            <span>Dom</span>
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
            {espaciosVacios.map((_, i) => (
            <div key={`vacio-${i}`}></div>
            ))}

            {dias.map((dia) => {
            const fechaTexto = formatearFecha(dia);
            const disponible = tieneDisponibilidad(fechaTexto);
            const seleccionado = diaSeleccionado === fechaTexto;

            return (
                <button
                key={dia}
                onClick={() => handleClickDia(dia)}
                disabled={!disponible}
                className={`p-2 rounded-lg text-sm
                    ${disponible ? "bg-blue-100 hover:bg-blue-200 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}
                    ${seleccionado ? "bg-blue-600 text-white" : ""}
                `}
                >
                {dia}
                </button>
            );
            })}
        </div>

        {diaSeleccionado && (
            <div className="mt-6 text-left">
            <h3 className="font-medium mb-2">Horarios disponibles:</h3>
            <div className="flex flex-wrap gap-2">
                {horariosDelDiaSeleccionado.map((hora) => (
                <button
                    key={hora}
                    onClick={() => onSeleccionarHorario(diaSeleccionado, hora)}
                    className="border rounded-lg px-3 py-2 hover:bg-blue-50"
                >
                    {hora}
                </button>
                ))}
            </div>
            </div>
        )}
        </div>
    );
}