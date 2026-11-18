/** @type {import('next').NextConfig} */
const nextConfig = {
  // headers(): Next.js agrega estas cabeceras a cada respuesta que genera.
  // Son las mismas de netlify.toml: acá cubren las páginas y las rutas /api,
  // que en Netlify se sirven desde una función.
  async headers() {
    return [
      {
        source: "/:path*",
        // "/:path*": cualquier dirección del sitio.
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
