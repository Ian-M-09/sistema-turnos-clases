Si cerraste la terminal o el servidor dejó de correr, estos son los pasos:

cd C:\Users\Ian\sistema-turnos-clases
npm run dev

El primer comando (cd) te posiciona dentro de la carpeta del proyecto (esto es necesario siempre, porque npm run dev solo funciona si estás parado en la carpeta que tiene el package.json).
El segundo (npm run dev) levanta el servidor de desarrollo de Next.js.

Después abrís el navegador en http://localhost:3000

---------------------------------------------------------------

la carpeta src/app es el corazón del proyecto. Ahí adentro:

layout.js es el "molde" que envuelve todas las páginas (ideal para el footer,porque así aparece en todo el sitio sin repetir código).

page.js es el contenido de la página principal (/){
    Fijate la función RootLayout de abajo. Esa {children} es el corazón de todo esto: representa "lo que sea que Next.js decida poner ahí", dependiendo de en qué página estés parado. Si estás en /, children es el contenido de page.js. Si mañana creamos /reservar, children va a ser el contenido de esa otra página. El layout.js es el molde fijo que envuelve a todas las páginas, así que todo lo que pongamos afuera de {children} (arriba o abajo) va a aparecer siempre, en cualquier página del sitio. Por eso es el lugar perfecto para el footer.
}
target="_blank" hace que el link se abra en una pestaña nueva.
rel="noopener noreferrer" es una buena práctica de seguridad que siempre se agrega cuando usás target="_blank" (evita que la página que abrís tenga acceso a manipular la pestaña original).

rutas en Next.js (App Router):
Como ya vimos, src/app/page.js es el contenido de la ruta / (la página principal). Lo importante para entender cómo vamos a ir armando el resto del sitio: cada carpeta nueva que crees dentro de src/app se convierte automáticamente en una ruta nueva, siempre que adentro tenga un archivo page.js.

reservar/page.js:
Dato para tus notas: el nombre de la función (Reservar en este caso) puede ser cualquier cosa — no tiene que llamarse igual que el archivo ni la carpeta. Lo que sí es obligatorio es que sea export default (una sola exportación por defecto por archivo page.js), porque así es como Next.js sabe qué función renderizar para esa ruta.

Next.js trae un componente especial llamado Link que hace la navegación sin recargar la página completa — solo actualiza lo que cambió. Es más rápido y es la forma recomendada de moverse entre páginas internas de tu propio sitio. La regla general es:

<Link> → para navegar entre páginas de tu propio sitio (ej. Home → Reservar).
<a> → para links que salen de tu sitio hacia otro lado (como el del footer, que va a GitHub).

Notá dos cosas nuevas:

La línea import Link from "next/link"; arriba de todo — cualquier componente especial de Next.js hay que importarlo primero, igual que harías con cualquier librería en Node.
<Link href="/"> en vez de <a href="/"> — la sintaxis es casi idéntica a la de <a>, cambia solo el nombre de la etiqueta y que ahora es un componente de React, no HTML puro.

inputs controlados con useState

En HTML plano, un <input> guarda su propio valor internamente y vos lo leés cuando lo necesitás (por ejemplo, al hacer submit). En React se trabaja distinto: el valor del input vive en el estado del componente (una variable especial de React), y cada vez que el usuario tipea algo, se actualiza esa variable. Esto se llama input controlado, porque React "controla" en todo momento qué hay escrito ahí.

Para esto usamos un Hook de React llamado useState. Un Hook es simplemente una función especial de React que te da superpoderes dentro de un componente. useState te da dos cosas: una variable con el valor actual, y una función para actualizarla

const [nombre, setNombre] = useState("");
nombre → el valor actual (arranca en "", vacío).
setNombre → la función que usás para cambiar ese valor.
useState("") → le decimos que el valor inicial es un string vacío.