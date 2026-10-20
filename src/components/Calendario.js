"use client";
// Este componente corre en el navegador (usa estado y clics).

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
// Una constante afuera del componente: nunca cambia, así que no hace
// falta recrearla en cada dibujo. Por convención, las constantes fijas
// se escriben en MAYÚSCULAS. El índice 0 es enero, igual que getMonth().

const MESES_ADELANTE = 2;
// Cuántos meses hacia adelante puede mirar el alumno.
const HORAS_MINIMAS = 24;
// Anticipación mínima para reservar (regla de la profesora).
const MINUTOS_MINIMOS = 60;
// Duración mínima de una reserva: 1 hora. Un horario que dura menos
// (media hora) solo puede ser el final de una reserva, nunca el inicio.

function aMinutos(hora) {
  // Convierte "15:30" en 930 (minutos desde la medianoche).
  const [horas, minutos] = hora.split(":").map(Number);
  // .split(":") parte el texto en cada ":" → ["15", "30"].
  // .map(Number) convierte cada texto en número → [15, 30].
  // [horas, minutos] = ... es "destructuring" de lista: el primer elemento
  // va a "horas" y el segundo a "minutos".
  return horas * 60 + minutos;
}

function aTexto(totalMinutos) {
  // Hace el camino inverso: 930 → "15:30".
  const horas = Math.floor(totalMinutos / 60);
  // Math.floor redondea hacia abajo: 930 / 60 = 15.5 → 15.
  const minutos = totalMinutos % 60;
  // "%" devuelve el resto de la división: 930 % 60 = 30.
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
  // padStart(2, "0") completa con un cero adelante: 9 → "09".
}

function textoDuracion(minutos) {
  // Convierte 210 en "3 h 30 min" y 120 en "2 horas".
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (resto === 0) {
    // "if" ejecuta el bloque solo si la condición es verdadera.
    // "===" compara valor y tipo. Acá: si son horas exactas.
    return horas === 1 ? "1 hora" : `${horas} horas`;
    // "? :" (operador ternario) elige entre singular y plural.
  }
  return `${horas} h ${resto} min`;
}

export default function Calendario({ onConfirmarHorarios }) {
  const hoy = new Date();
  // new Date() sin argumentos crea la fecha y hora de este momento.

  const [anio, setAnio] = useState(hoy.getFullYear());
  // getFullYear() devuelve el año actual (2026).
  const [mes, setMes] = useState(hoy.getMonth());
  // getMonth() devuelve el mes actual de 0 a 11. El mes es estado:
  // cuando cambia, React vuelve a dibujar el calendario.
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [inicioElegido, setInicioElegido] = useState(null);
  // El horario de inicio que tocó el alumno (objeto { id, hora, lugares,
  // duracion }), o null si todavía no tocó ninguno.
  const [bloquesElegidos, setBloquesElegidos] = useState(1);
  // Cuántos horarios seguidos usa la reserva (el de inicio cuenta como 1).

  useEffect(() => {
    async function cargarDisponibilidad() {
      const { data, error } = await supabase
        .from("disponibilidad")
        .select("id, fecha, hora, cupo_maximo, cupo_ocupado, duracion_minutos")
        // Ahora también pedimos la duración de cada horario.
        .order("fecha", { ascending: true })
        .order("hora", { ascending: true });

      if (error) {
        setErrorCarga("No se pudieron cargar los horarios. Probá de nuevo más tarde.");
        setCargando(false);
        return;
      }

      const limite = Date.now() + HORAS_MINIMAS * 60 * 60 * 1000;
      // Date.now() devuelve el momento actual en milisegundos.
      // Sumamos 24 horas: horas * 60 min * 60 seg * 1000 ms.
      // Todo horario anterior a "limite" ya no se puede reservar.

      const disponibles = data.filter((fila) => {
        // .filter conserva solo las filas para las que la función
        // devuelve true.
        const hayLugar = fila.cupo_ocupado < fila.cupo_maximo;
        // Da true si todavía quedan lugares.
        const momentoClase = new Date(`${fila.fecha}T${fila.hora}`).getTime();
        // Armamos un texto como "2026-09-29T10:00:00" (las comillas
        // invertidas ` ` permiten meter variables con ${ }).
        // Sin zona horaria escrita, JavaScript lo toma en la hora local
        // del navegador. .getTime() lo pasa a milisegundos para comparar.
        return hayLugar && momentoClase >= limite;
        // && exige que se cumplan las dos condiciones a la vez.
      });

      const agrupado = [];
      disponibles.forEach((fila) => {
        const horario = {
          id: fila.id,
          hora: fila.hora.slice(0, 5),
          lugares: fila.cupo_maximo - fila.cupo_ocupado,
          // "lugares" guarda cuántos lugares libres quedan: se calcula
          // restando el cupo ocupado al máximo.
          duracion: fila.duracion_minutos,
          // Cuántos minutos dura este horario (60, o 30 si es media hora).
        };
        const diaExistente = agrupado.find((d) => d.fecha === fila.fecha);
        if (diaExistente) {
          diaExistente.horarios.push(horario);
        } else {
          agrupado.push({ fecha: fila.fecha, horarios: [horario] });
        }
      });

      setDisponibilidad(agrupado);
      setCargando(false);
    }

    cargarDisponibilidad();
  }, []);

  const primerDiaDelMes = new Date(anio, mes, 1);
  const diasEnElMes = new Date(anio, mes + 1, 0).getDate();
  const diaDeLaSemanaInicial = primerDiaDelMes.getDay();

  const dias = Array.from({ length: diasEnElMes }, (_, i) => i + 1);
  const espaciosVacios = Array.from({ length: diaDeLaSemanaInicial }, (_, i) => i);

  const diferenciaMeses = (anio - hoy.getFullYear()) * 12 + (mes - hoy.getMonth());
  // Cuántos meses nos alejamos del mes actual. Ejemplo: de diciembre 2026
  // a enero 2027 son (1 * 12) + (0 - 11) = 1 mes. Sirve aunque cambie el año.
  const puedeRetroceder = diferenciaMeses > 0;
  // No se puede ir antes del mes actual.
  const puedeAvanzar = diferenciaMeses < MESES_ADELANTE;

  function cambiarMes(cantidad) {
    // cantidad vale -1 (mes anterior) o 1 (mes siguiente).
    let nuevoMes = mes + cantidad;
    let nuevoAnio = anio;
    // "let" declara una variable que sí se puede reasignar,
    // a diferencia de "const".
    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio = anio - 1;
      // Retrocedimos desde enero: pasamos a diciembre del año anterior.
    } else if (nuevoMes > 11) {
      // "else if" prueba otra condición si la anterior fue falsa.
      nuevoMes = 0;
      nuevoAnio = anio + 1;
      // Avanzamos desde diciembre: pasamos a enero del año siguiente.
    }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
    setDiaSeleccionado(null);
    setInicioElegido(null);
    setBloquesElegidos(1);
    // Al cambiar de mes se borra el día elegido y todo lo que dependía de él.
  }

  function formatearFecha(dia) {
    const mesTexto = String(mes + 1).padStart(2, "0");
    const diaTexto = String(dia).padStart(2, "0");
    return `${anio}-${mesTexto}-${diaTexto}`;
  }

  function tieneDisponibilidad(fechaTexto) {
    return disponibilidad.some(
      (d) =>
        d.fecha === fechaTexto &&
        d.horarios.some((h) => h.duracion >= MINUTOS_MINIMOS)
    );
    // .some devuelve true si al menos un elemento cumple la condición.
    // Un día solo se habilita si tiene al menos un horario desde el cual
    // se pueda empezar (los de media hora no sirven como inicio).
  }

  function handleClickDia(dia) {
    const fechaTexto = formatearFecha(dia);
    if (tieneDisponibilidad(fechaTexto)) {
      setDiaSeleccionado(fechaTexto);
      setInicioElegido(null);
      setBloquesElegidos(1);
      // Al cambiar de día se borra el inicio elegido: los horarios de un
      // día no sirven para otro.
    }
  }

  const horariosDelDiaSeleccionado =
    disponibilidad.find((d) => d.fecha === diaSeleccionado)?.horarios ?? [];
  // "?." evita un error si find no encontró nada: devuelve undefined.
  // "??" usa lo de la derecha ([]) si lo de la izquierda es undefined o null.

  const horariosDeInicio = horariosDelDiaSeleccionado.filter(
    (h) => h.duracion >= MINUTOS_MINIMOS
  );
  // Los horarios desde los que se puede empezar: los de media hora quedan
  // afuera, porque la reserva mínima es de 1 hora.

  function armarCadena(inicio) {
    // Arma la lista de horarios pegados que arranca en "inicio".
    const cadena = [];
    let actual = inicio;
    // "let" porque "actual" va cambiando en cada vuelta del while.

    while (actual) {
      // "while" repite el bloque MIENTRAS "actual" tenga un horario
      // (cuando vale undefined, el ciclo termina).
      cadena.push(actual);
      // .push agrega al final de la lista. Acá sí se puede usar porque
      // "cadena" es una variable local, no un estado de React.
      if (actual.duracion < MINUTOS_MINIMOS) {
        break;
        // "break" corta el while: una media hora siempre es el final de la
        // reserva, no se puede seguir sumando después de ella.
      }
      const minutoSiguiente = aMinutos(actual.hora) + actual.duracion;
      // El próximo horario tendría que empezar justo cuando termina este.
      actual = horariosDelDiaSeleccionado.find(
        (h) => aMinutos(h.hora) === minutoSiguiente
      );
      // .find devuelve ese horario, o undefined si no existe.
    }
    return cadena;
  }

  function armarOpciones(cadena) {
    // Para cada cantidad de horarios posible, calcula cuántos minutos suma.
    const opciones = [];
    let acumulado = 0;
    cadena.forEach((h, i) => {
      // .forEach recorre la lista; "i" es la posición (0, 1, 2...).
      acumulado += h.duracion;
      // "+=" suma y guarda: va acumulando los minutos de cada horario.
      if (acumulado >= MINUTOS_MINIMOS) {
        opciones.push({ bloques: i + 1, minutos: acumulado });
        // Cada opción dice cuántos horarios usa y cuántos minutos suma.
      }
    });
    return opciones;
  }

  const cadena = inicioElegido ? armarCadena(inicioElegido) : [];
  // Si hay un inicio elegido arma la cadena de horarios pegados, y si no,
  // queda vacía.
  const opciones = armarOpciones(cadena);
  const opcionActual = opciones.find((o) => o.bloques === bloquesElegidos);
  // La opción que el alumno tiene marcada en este momento.

  function elegirInicio(horario) {
    setInicioElegido(horario);
    setBloquesElegidos(1);
    // Al elegir otro inicio, la duración vuelve a la mínima (1 hora).
  }

  function confirmarHorarios() {
    const bloque = cadena.slice(0, bloquesElegidos);
    // .slice(0, n) toma los primeros n elementos de la lista, sin
    // modificarla: son los horarios que usa la reserva.
    const fin = aMinutos(inicioElegido.hora) + opcionActual.minutos;
    const resumen = `de ${inicioElegido.hora} a ${aTexto(fin)}`;
    // Ej: "de 15:00 a 18:30". Es el texto que se muestra en los pasos siguientes.
    onConfirmarHorarios(diaSeleccionado, bloque, resumen, opcionActual.minutos);
    // Le avisamos al padre (page.js): este día, estos horarios, este
    // resumen y estos minutos totales (para calcular el depósito).
  }

  if (cargando) {
    return <p>Cargando horarios...</p>;
  }

  if (errorCarga) {
    return <p className="text-red-600">{errorCarga}</p>;
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => cambiarMes(-1)}
          disabled={!puedeRetroceder}
          aria-label="Mes anterior"
          className="px-3 py-1 rounded-lg border border-borde bg-rosa-suave text-acento-hover hover:bg-borde disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ←
        </button>
        {/* aria-label le da un nombre al botón para lectores de pantalla.
            "disabled:" en Tailwind aplica esos estilos solo si el botón
            está deshabilitado. */}

        <h2 className="text-xl font-bold">
          {NOMBRES_MESES[mes]} {anio}
        </h2>
        {/* NOMBRES_MESES[mes] usa el número del mes como posición en la lista. */}

        <button
          onClick={() => cambiarMes(1)}
          disabled={!puedeAvanzar}
          aria-label="Mes siguiente"
          className="px-3 py-1 rounded-lg border border-borde bg-rosa-suave text-acento-hover hover:bg-borde disabled:opacity-30 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-sm mb-2 font-semibold text-acento">
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
              className={`p-2 rounded-lg text-sm border
                ${
                  seleccionado
                    ? "bg-acento border-acento text-white"
                    : disponible
                      ? "bg-rosa-suave border-borde text-acento-hover font-medium hover:bg-borde cursor-pointer"
                      : "bg-fondo border-transparent text-texto/30 cursor-not-allowed"
                }
              `}
            >
              {dia}
            </button>
          );
        })}
      </div>

      {diaSeleccionado && (
        <div className="mt-6 text-left">
          <h3 className="font-medium mb-2">¿A qué hora querés empezar?</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {horariosDeInicio.map((h) => {
              const elegido = inicioElegido?.id === h.id;
              // "?." evita un error si inicioElegido es null: en vez de
              // romper, devuelve undefined. Después compara los ids.
              return (
                <button
                  key={h.id}
                  onClick={() => elegirInicio(h)}
                  aria-pressed={elegido}
                  className={`border rounded-lg px-3 py-2 font-medium ${
                    elegido
                      ? "bg-acento border-acento text-white"
                      : "bg-rosa-suave border-borde text-acento-hover hover:bg-borde"
                  }`}
                >
                  {/* aria-pressed le avisa a los lectores de pantalla que el
                      botón funciona como interruptor (elegido o no). */}
                  {h.hora}
                  {h.lugares === 1 && (
                    <span
                      className={`ml-2 text-xs font-medium ${
                        elegido ? "text-white" : "text-aviso"
                      }`}
                    >
                      ¡Último lugar!
                    </span>
                  )}
                  {/* h.lugares === 1 da true solo si queda exactamente 1 lugar.
                      && funciona como "y entonces": si lo de la izquierda es
                      true, se dibuja lo de la derecha. */}
                </button>
              );
            })}
          </div>

          {inicioElegido && opciones.length > 1 && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">¿Cuánto tiempo?</h3>
              <div className="flex flex-wrap gap-2">
                {opciones.map((o) => (
                  <button
                    key={o.bloques}
                    onClick={() => setBloquesElegidos(o.bloques)}
                    aria-pressed={bloquesElegidos === o.bloques}
                    className={`border rounded-lg px-4 py-2 font-medium ${
                      bloquesElegidos === o.bloques
                        ? "bg-acento border-acento text-white"
                        : "bg-rosa-suave border-borde text-acento-hover hover:bg-borde"
                    }`}
                  >
                    {textoDuracion(o.minutos)}
                  </button>
                ))}
                {/* Una opción por cada duración posible desde este inicio,
                    así solo se ofrecen las que realmente existen. */}
              </div>
            </div>
          )}

          {inicioElegido && opcionActual && (
            <div>
              <p className="text-sm mb-2">
                De {inicioElegido.hora} a{" "}
                {aTexto(aMinutos(inicioElegido.hora) + opcionActual.minutos)} (
                {textoDuracion(opcionActual.minutos)})
              </p>
              <button
                onClick={confirmarHorarios}
                className="bg-acento text-white px-6 py-3 rounded-lg hover:bg-acento-hover transition"
              >
                Continuar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}