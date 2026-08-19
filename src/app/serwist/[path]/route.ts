import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  // Fuerza esbuild nativo en todas las plataformas (Windows local Y
  // Vercel/Linux) — el default de la librería depende de la plataforma
  // (win32 → nativo, cualquier otra → esbuild-wasm) y este proyecto solo
  // instaló `esbuild` (S13-2), no `esbuild-wasm` — sin esto, el build de
  // producción en Vercel fallaría al no encontrar ese paquete.
  useNativeEsbuild: true,
  // /offline debe estar precacheado para poder servir como fallback de
  // navegación (fallbacks.entries en sw.ts) — sin un `revision` explícito,
  // Serwist advierte "precaching URLs without revision info". Se usa el
  // SHA del commit (disponible en Vercel) como firma de la build entera;
  // en local, sin esa env var, cae a un valor fijo (sin revisión real
  // entre corridas de `npm run build` locales, aceptable para desarrollo).
  // El imagotipo va con la misma revisión: /offline lo referencia en un
  // <img> plano (no next/image), y sin precachearlo junto con la página el
  // logo podría faltar en una instalación que nunca visitó /login ni el
  // Sidebar expandido antes de perder señal.
  additionalPrecacheEntries: [
    { url: "/offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { url: "/avicolamya-imagotipo-2.png", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  ],
});
