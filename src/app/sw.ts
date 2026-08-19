import { defaultCache } from "@serwist/turbopack/worker";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope;

// Constantes locales, no importadas de @/lib/constants: este archivo lo
// compila esbuild por separado (@serwist/turbopack), no el bundler
// normal de Next — no hay garantía de que resuelva el alias "@/" del
// resto del proyecto, así que se mantiene autocontenido a propósito.
const PANTALLAS_DE_CAMPO = ["/mortalidad", "/bitacora", "/recoleccion"];
const RUNTIME_CACHE_MAX_AGE_SEGUNDOS = 86_400; // 24h — decisión 6, spec.md

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Activación en el próximo reload, no interrumpe una sesión en curso —
  // "Fuera de alcance" en spec.md (sin actualización silenciosa forzada).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Server Actions y cualquier mutación (decisión 2, spec.md) —
      // explícito aunque Serwist ya sólo intercepta GET por defecto
      // (RuntimeCaching.method sin declarar asume "GET"): un POST sin
      // ninguna regla que lo capture ya cae directo a la red nativa del
      // navegador. Esta regla lo hace explícito en el código.
      matcher: () => true,
      method: "POST",
      handler: new NetworkOnly({
        // handlerDidError propio, a propósito: sin esto, el constructor
        // de Serwist adjunta automáticamente el PrecacheFallbackPlugin de
        // `fallbacks` (más abajo) a CUALQUIER estrategia que no tenga ya
        // su propio handlerDidError — una Server Action fallida por falta
        // de red devolvería la página /offline en vez de un error de red
        // real, rompiendo useActionState del lado del cliente (H3,
        // spec.md: "la Server Action falla con el error de red esperado").
        // Retornar undefined deja que el error original se re-lance tal
        // cual (confirmado leyendo Strategy.ts de serwist: si ningún
        // handlerDidError devuelve una Response, se re-lanza el error).
        plugins: [{ handlerDidError: async () => undefined }],
      }),
    },
    // Cachés dedicadas y aisladas para las 3 pantallas de campo (documento
    // completo y navegación interna RSC) — hallazgo real de verificación
    // en dispositivo Android real: dejarlas caer en los buckets
    // genéricos "others"/"pages-rsc" de defaultCache (compartidos con
    // CUALQUIER tráfico same-origin, limitados a 32 entradas cada uno)
    // las exponía a que otra navegación normal del Gerente/Operario
    // fuera empujando esas 3 entradas fuera de la caché por el límite de
    // tamaño — la app abría sin señal al principio de una sesión offline
    // y dejaba de hacerlo más adelante en la misma sesión, sin que el
    // usuario hiciera nada raro. `maxEntries` alto a propósito (nunca va
    // a haber más de 6 combinaciones reales: 3 pantallas x 2 formatos),
    // así nunca compite por espacio con nada más.
    {
      matcher: ({ url, request }) =>
        PANTALLAS_DE_CAMPO.includes(url.pathname) && request.headers.get("RSC") !== "1",
      handler: new NetworkFirst({
        cacheName: "pantallas-campo",
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: RUNTIME_CACHE_MAX_AGE_SEGUNDOS })],
      }),
    },
    {
      matcher: ({ url, request }) =>
        PANTALLAS_DE_CAMPO.includes(url.pathname) && request.headers.get("RSC") === "1",
      handler: new NetworkFirst({
        cacheName: "pantallas-campo-rsc",
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: RUNTIME_CACHE_MAX_AGE_SEGUNDOS })],
      }),
    },
    // Set de reglas recomendado oficialmente por Serwist para apps Next.js
    // (CacheFirst para assets estáticos que nunca cambian entre deploys,
    // NetworkFirst a 24h para HTML/RSC/RSC-prefetch de cualquier OTRA
    // página same-origin) — las reglas de arriba, al ir primero en el
    // array, ya capturaron las 3 pantallas de campo antes de llegar acá.
    // En `next dev` este array completo se reemplaza por una sola regla
    // NetworkOnly — el caché real solo existe en builds de producción
    // (npm run build && npm run start), confirmado leyendo el código
    // fuente del paquete.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        // Acotado a navegación de documento (recarga dura / URL directa)
        // a propósito — un fallback sin matcher (o uno más amplio) se
        // adjuntaría también a estrategias de imagen/fuente/API fallidas,
        // devolviendo la página /offline completa en vez de un error de
        // red normal para esos recursos.
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
