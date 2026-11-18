"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import IdentificacionAlumno from "@/components/IdentificacionAlumno";
import Calendario from "@/components/Calendario";
import FormularioAlumno from "@/components/FormularioAlumno";
import ComprobantePago from "@/components/ComprobantePago";
import Ubicacion from "@/components/Ubicacion";
import { supabase } from "@/lib/supabase";
import { subirArchivo } from "@/lib/archivos";

export default function Reservar() {
    const [paso, setPaso] = useState("identificacion"); // "identificacion" | "calendario" | "datos" | "pago" | "listo"
    const [alumno, setAlumno] = useState(null);
    // { dni, materia, profesorId, inicialAlumno, habilitado }, del primer paso.
    const [turnoElegido, setTurnoElegido] = useState(null);
    const [datosAlumno, setDatosAlumno] = useState(null);
    const [enviando, setEnviando] = useState(false);
    // true mientras se suben los archivos y se guarda la reserva.
    const [errorEnvio, setErrorEnvio] = useState(null);
    const [sinLugar, setSinLugar] = useState(false);
    // true si el error fue porque alguien ocupó el último lugar: ahí
    // mostramos un botón para volver a elegir horario.
    const archivosSubidos = useRef(new WeakMap());
    // useRef guarda un valor que sobrevive entre renders sin redibujar la
    // página. WeakMap es un diccionario cuyas claves son objetos: acá, cada
    // archivo con el nombre que recibió en Storage.

    async function subirUnaVez(bucket, archivo) {
        // Si la reserva falla (por ejemplo, se ocupó el horario) y el alumno
        // reintenta, no se vuelve a subir lo que ya está en Storage. Así no
        // gasta las 6 subidas que tiene cada 30 minutos (024).
        const yaSubido = archivosSubidos.current.get(archivo);
        if (yaSubido) return yaSubido;

        const nombre = await subirArchivo(bucket, archivo, alumno.dni);
        archivosSubidos.current.set(archivo, nombre);
        return nombre;
    }

    function handleIdentificado(datos) {
        setAlumno(datos);
        setPaso("calendario");
    }

    function handleConfirmarHorarios(fecha, horarios, resumen, minutosTotales) {
        // Ahora recibe el día, la LISTA de horarios (cada uno con su id), el
        // texto resumen para mostrar y los minutos totales de la reserva.
        setTurnoElegido({ fecha, horarios, resumen, minutosTotales });
        setErrorEnvio(null);
        setSinLugar(false);
        setPaso("datos");
    }

    function handleContinuarDatos(datos) {
        setDatosAlumno(datos);
        setPaso("pago");
    }

    async function handleConfirmarPago({ comprobante }) {
        // "async" porque adentro esperamos (await) a Supabase varias veces.
        setEnviando(true);
        setErrorEnvio(null);
        setSinLugar(false);

        try {
            // 1. Subir los apuntes, uno por uno, y juntar sus nombres.
            const nombresApuntes = [];
            for (const archivo of datosAlumno.apuntes) {
                // "for...of" recorre la lista elemento por elemento. Lo usamos
                // en vez de .map porque así cada subida espera a la anterior.
                nombresApuntes.push(await subirUnaVez("apuntes", archivo));
                // .push agrega al final de la lista (acá sí se puede porque es
                // una variable común, no un estado de React).
            }

            // 2. Subir el comprobante.
            const nombreComprobante = await subirUnaVez("comprobantes", comprobante);

            // 3. Llamar a la función crear_reserva de la base (009). Ella
            // valida todo de nuevo y guarda la reserva, todo o nada. El
            // nombre, apellido y teléfono los saca de la tabla alumnos con el DNI.
            const { data, error } = await supabase.rpc("crear_reserva", {
                // .rpc("nombre", { parámetros }) ejecuta una función SQL. Los
                // nombres de las claves tienen que ser iguales a los de la función.
                p_horarios: turnoElegido.horarios.map((h) => h.id),
                // De cada horario elegido nos quedamos solo con su id.
                p_dni: alumno.dni,
                p_materia: alumno.materia,
                p_anio_cursando: datosAlumno.anioCursando,
                p_notas: datosAlumno.notas,
                p_apuntes: nombresApuntes,
                p_comprobante_url: nombreComprobante,
            });

            if (error) {
                // error.message trae el texto del "raise exception" de la
                // función (ya está en español y pensado para el alumno).
                setErrorEnvio(error.message);
                setSinLugar(
                    error.message.includes("Ya no queda lugar") ||
                    error.message.includes("ya no existe") ||
                    error.message.includes("24 horas")
                );
                // Estos tres errores se arreglan eligiendo otro horario.
                return;
                // El "finally" de abajo se ejecuta igual aunque hagamos return.
            }

            if (!data) {
                // Desde 015, crear_reserva devuelve null (en vez de un error)
                // cuando el DNI no está registrado, para poder anotar el intento.
                setErrorEnvio("Ese DNI no está registrado. Escribile a tu profesor para que te registre.");
                return;
            }

            setPaso("listo");
        } catch (err) {
            // Acá llegan los errores de subirArchivo (los "throw new Error")
            // o un problema de conexión.
            setErrorEnvio(err.message || "Algo salió mal. Probá de nuevo.");
        } finally {
            setEnviando(false);
            // "finally" se ejecuta siempre al final, haya salido bien o mal.
        }
    }

    return (
        <main className="flex flex-col items-center justify-center flex-1 text-center p-4 sm:p-8 gap-6">
        <h1 className="text-3xl font-bold">Reservar un turno</h1>

        {paso === "identificacion" && (
            <IdentificacionAlumno
                datosIniciales={alumno}
                onContinuar={handleIdentificado}
            />
        )}

        {paso === "calendario" && (
            <>
            <p className="text-lg">
                Hola, <strong>{alumno.inicialAlumno}</strong>. Clase de{" "}
                <strong>{alumno.materia}</strong>.
            </p>
            <button
                onClick={() => setPaso("identificacion")}
                className="underline"
            >
                Cambiar DNI o materia
            </button>
            <Calendario
                onConfirmarHorarios={handleConfirmarHorarios}
                sinLugares={!alumno.habilitado}
                // Un alumno bloqueado ve todos los horarios sin lugar.
            />
            </>
        )}

        {paso === "datos" && (
            <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <p className="text-lg">
                Turno elegido: <strong>{turnoElegido.fecha}</strong>,{" "}
                <strong>{turnoElegido.resumen}</strong>
            </p>
            <button
                onClick={() => setPaso("calendario")}
                className="vidrio px-6 py-3"
            >
                Cambiar horario
            </button>
            <FormularioAlumno
                turno={turnoElegido}
                datosIniciales={datosAlumno}
                // Si ya había completado los datos (y volvió a cambiar el
                // horario), el formulario arranca con lo que había escrito.
                onContinuar={handleContinuarDatos}
            />
            </div>
        )}

        {paso === "pago" && (
            <>
            {/* <> ... </> es un "Fragment": agrupa varios elementos sin
                agregar una etiqueta extra al HTML. */}
            <ComprobantePago
                profesorId={alumno.profesorId}
                // La cuenta y el precio son los del profesor de la materia.
                minutos={turnoElegido.minutosTotales}
                onConfirmar={handleConfirmarPago}
                enviando={enviando}
                errorEnvio={errorEnvio}
            />
            {sinLugar && (
                <button
                onClick={() => setPaso("calendario")}
                className="vidrio px-6 py-3"
                >
                Elegir otro horario
                </button>
            )}
            {!enviando && !sinLugar && (
                <button
                onClick={() => setPaso("datos")}
                className="underline"
                >
                ← Volver a mis datos
                </button>
            )}
            </>
        )}

        {paso === "listo" && (
            <>
            <p className="text-lg">
            ¡Listo! Tu turno quedó pendiente de confirmación. Te van a avisar
            por WhatsApp cuando esté confirmado.
            </p>
            <Ubicacion />
            </>
        )}

        {!enviando && (
            // Se muestra en todos los pasos (también en "listo", para que el
            // alumno no tenga que recargar la página) menos mientras se
            // guarda la reserva, así no se va a la mitad.
            <Link
            href="/"
            className="vidrio px-6 py-3"
            >
            ← Volver al inicio
            </Link>
        )}
        </main>
    );
}
