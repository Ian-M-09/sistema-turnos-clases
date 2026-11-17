// Los textos que se le mandan a Gemini (paso E2). Este archivo lo usa
// solo la ruta del servidor (src/app/api/gemini/route.js).
// Regla de privacidad (decidida 17/11): a Gemini NUNCA se le mandan
// nombre, apellido, DNI ni teléfono del alumno. En el plan gratuito,
// Google usa lo que recibe para entrenar sus modelos.
// Para afinar el prompt con la profesora (E5), se cambia acá.

export const PROMPT_SISTEMA = `Sos el asistente de un profesor particular de apoyo escolar y universitario en Argentina.
Tu trabajo es preparar material para UNA clase con UN alumno, a partir de los apuntes que te pasa el profesor.
El material lo lee el profesor (no el alumno): él lo revisa y decide qué usar.

Cuando te pidan el material de la clase, armá:
1. Un resumen corto de qué temas aparecen en los apuntes.
2. Teoría breve y clara de esos temas, con un ejemplo resuelto paso a paso.
3. Entre 5 y 8 ejercicios, de más fácil a más difícil.
4. Al final, las soluciones de los ejercicios (con el desarrollo, no solo el resultado).

Reglas:
- Escribí en español de Argentina.
- Ajustá el nivel al año que cursa el alumno, si lo sabés.
- Basate en los apuntes. Si no hay apuntes o no se entienden, decilo y proponé material general de la materia.
- No inventes datos sobre el alumno.
- Usá texto plano: títulos en MAYÚSCULAS y listas con números o guiones. No uses Markdown (nada de #, ** ni tablas).
- Para fórmulas, escribilas en una línea (por ejemplo: x^2 + 3x = 0, raíz(9) = 3).
- Si después el profesor te pide cambios ("más fácil", "agregá un ejemplo"), rehacé solo lo que pide.`;

export function pedidoInicial(reserva, cantidadApuntes) {
    // Arma el primer mensaje del chat con los datos de la reserva que SÍ
    // se pueden mandar: materia, año y notas.
    const lineas = [
        "Prepará el material para la clase.",
        `Materia: ${reserva.materia}.`,
        `Año que cursa: ${reserva.anio_cursando || "no lo indicó"}.`,
        // ||: si anio_cursando está vacío (null o ""), usa el texto de la derecha.
        `Notas del alumno: ${reserva.notas || "ninguna"}.`,
        cantidadApuntes > 0
            ? `Te adjunto ${cantidadApuntes} archivo${cantidadApuntes === 1 ? "" : "s"} de apuntes.`
            : "El alumno no subió apuntes.",
    ];
    return lineas.join("\n");
    // .join("\n"): une la lista en un solo texto, con un salto de línea entre cada una.
}
