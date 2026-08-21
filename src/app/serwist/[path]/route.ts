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
  //
  // apple-touch-icon.png (que /offline referencia en un <img> plano) NO
  // va acá — Sprint 13 lo agregaba a mano con esta misma revisión, pero
  // ese archivo YA vive en public/ y Serwist lo precachea solo, con su
  // hash de contenido real. Tenerlo en las dos listas a la vez, cada una
  // con una revisión distinta para la misma URL, es exactamente lo que
  // Serwist rechaza como conflicto — new Serwist() explota al construirse
  // ("add-to-cache-list-conflicting-entries") apenas la revisión de acá
  // difiere de la del escaneo automático, lo que pasa siempre en
  // producción real (VERCEL_GIT_COMMIT_SHA cambia en cada deploy; el hash
  // de contenido del archivo no). Bug real de Sprint 13, nunca disparado
  // hasta la verificación en vivo de Sprint 16 — encontrado y corregido acá.
  additionalPrecacheEntries: [{ url: "/offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }],
});
