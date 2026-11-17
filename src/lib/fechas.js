// Funciones para manejar fechas y horas en el panel. Las usan Horarios
// (HorariosAdmin) y Agenda (AgendaAdmin). Las fechas van como texto
// "2026-11-16" y las horas como "14:00", igual que en la base.
// "export function": a diferencia de "export default", un archivo puede
// tener muchas; se importan por nombre entre llaves:
//   import { sumarDias, formatearDia } from "@/lib/fechas";

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function aTexto(fecha) {
    // Convierte un Date en "2026-11-16" (el formato que usa la base).
    const a = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const d = String(fecha.getDate()).padStart(2, "0");
    return `${a}-${m}-${d}`;
}

export function sumarDias(texto, dias) {
    const fecha = new Date(`${texto}T00:00`);
    // "T00:00" para que JavaScript lo tome como medianoche en la hora local
    // (sin la hora, lo tomaría en UTC y podría correrse un día).
    fecha.setDate(fecha.getDate() + dias);
    // setDate con un número más grande que el mes pasa solo al mes siguiente
    // (el 31 + 1 da el 1 del mes que viene).
    return aTexto(fecha);
}

export function lunesDeEstaSemana() {
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    // getDay(): 0 = domingo, 1 = lunes, ..., 6 = sábado.
    const pasaron = diaSemana === 0 ? 6 : diaSemana - 1;
    // Cuántos días pasaron desde el lunes (el domingo es el último día de
    // la semana, así que desde el lunes pasaron 6).
    return sumarDias(aTexto(hoy), -pasaron);
}

export function proximoLunes() {
    // El lunes de la semana que viene (la profesora carga la semana siguiente).
    return sumarDias(lunesDeEstaSemana(), 7);
}

export function formatearDia(texto) {
    // "2026-11-16" → "16/11".
    const [, m, d] = texto.split("-");
    // La coma inicial salta el primer elemento (el año): no lo usamos.
    return `${d}/${m}`;
}

export function horaFin(hora, minutos) {
    // "14:00" y 60 → "15:00".
    const [h, m] = hora.split(":").map(Number);
    const total = h * 60 + m + minutos;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
