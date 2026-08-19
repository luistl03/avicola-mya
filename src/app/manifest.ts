import type { MetadataRoute } from "next";

// Next genera /manifest.webmanifest automáticamente a partir de este
// archivo (convención nativa de App Router) — no hace falta un
// public/manifest.json estático ni declarar <link rel="manifest"> a mano.
// Colores confirmados leyendo globals.css real en S13-1 (no asumidos):
// --background (light) = #ffffff, --primary (light) = #f4900f (mismo
// valor ya documentado en memory/estado-proyecto.md, "Paleta de color").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avícola M&A",
    short_name: "Avícola M&A",
    description: "Sistema de gestión interna — Avícola M&A",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f4900f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
