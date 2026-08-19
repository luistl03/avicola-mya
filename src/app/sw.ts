import { defaultCache } from "@serwist/turbopack/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope;

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
    // Set de reglas recomendado oficialmente por Serwist para apps Next.js
    // (CacheFirst para assets estáticos que nunca cambian entre deploys,
    // NetworkFirst a 24h para HTML/RSC/RSC-prefetch de CUALQUIER página
    // same-origin — no solo las 3 pantallas de campo; la precarga
    // proactiva de esas 3 al login, decisión 1, es un mecanismo aparte,
    // ver components/domain/pwa/precargar-catalogos.tsx). En `next dev`
    // este array completo se reemplaza por una sola regla NetworkOnly —
    // el caché real solo existe en builds de producción (npm run build
    // && npm run start), confirmado leyendo el código fuente del paquete.
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
