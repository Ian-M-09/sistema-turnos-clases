// Layout de /admin. Envuelve a todas las páginas que estén adentro de la
// carpeta admin. Es un componente del SERVIDOR (no lleva "use client"),
// y por eso puede exportar "metadata".

export const metadata = {
    title: "Panel de Profesores",
    robots: { index: false, follow: false },
    // robots: le pide a Google y a otros buscadores que NO muestren esta
    // página en los resultados (index: false) ni sigan sus links
    // (follow: false). Next.js lo convierte en una etiqueta <meta> del HTML.
    // Es solo para que no aparezca en Google: la seguridad real está en el
    // login y en las políticas de la base.
};

export default function AdminLayout({ children }) {
    // children: la página que se está mostrando adentro de /admin.
    return children;
}
