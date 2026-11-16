import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const online = process.env.AI_OFFICE_ONLINE === "1";

// La oficina nunca carga nada de afuera: fuentes, imágenes y scripts salen del propio
// servidor. Esta política lo hace cumplir en el navegador. `unsafe-inline` en scripts
// hace falta porque Next inyecta los datos de la página en línea; lo que escriben los
// agentes nunca se inserta como HTML (ver `components/markdown-lite.tsx`). En desarrollo
// Next necesita además `unsafe-eval` y el websocket de recarga.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${production ? "" : " ws: wss:"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Online siempre hay HTTPS adelante; en localhost no, y forzarlo rompería la página.
  ...(online ? ["upgrade-insecure-requests"] : []),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Sólo online: en localhost no hay HTTPS y el navegador lo ignoraría igual.
  ...(online
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // El indicador de desarrollo tapa la esquina de la lista de tareas.
  devIndicators: false,
  // No anunciar con qué está hecha.
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
