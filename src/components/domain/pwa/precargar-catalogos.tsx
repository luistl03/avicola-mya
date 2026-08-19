"use client";

import { useEffect } from "react";

// Decisión de negocio 1 (spec.md): al hacer login, se calienta la caché
// del Service Worker con las 3 pantallas de campo (las únicas que ya
// cumplen el Contrato Offline-Ready del lado de datos) — ninguna pantalla
// de gestión se precarga acá. No hace falta ningún endpoint de catálogos
// aparte: Mortalidad/Bitácora/Recolección son Server Components que ya
// hacen su propio fetch de Prisma (galpones/lotes activos) y lo pasan
// como props — cachear el HTML completo de estas 3 URLs cachea esos
// catálogos con él (ver "Cómo funciona la precarga" en plan.md).
// Exportada para que sidebar.tsx limite el prefetch automático de <Link>
// de Next a estas 3 rutas (ver plan.md, hallazgo real de S13-13) — una
// sola fuente de verdad, sin repetir la lista en dos componentes que
// podrían desincronizarse.
export const PANTALLAS_DE_CAMPO = ["/mortalidad", "/bitacora", "/recoleccion"];

// Montado una sola vez por sesión de login (RootLayout, rama `usuario`,
// que no se remonta entre navegaciones dentro de la misma sesión) — no
// usa router.prefetch() de Next (solo trae el flight data del bundle, no
// garantiza pasar por el runtime caching del Service Worker de la misma
// forma que un fetch real). Sin estado ni render propio.
export function PrecargarCatalogos() {
  useEffect(() => {
    if (!navigator.onLine) return; // sin sentido intentar precargar sin red
    for (const ruta of PANTALLAS_DE_CAMPO) {
      // Documento HTML completo — cubre la recarga dura / URL directa
      // (cae en la caché "others" de defaultCache).
      fetch(ruta, { credentials: "include" }).catch(() => {
        // Silencioso a propósito — un fallo acá no es un error visible
        // para el usuario, es simplemente "no se pudo precargar todavía".
      });
      // Fetch con header RSC:1 — replica el formato exacto que Next usa
      // para la navegación interna vía <Link>/router.push (cae en la
      // caché "pages-rsc" de defaultCache, DISTINTA de "others"). Sin
      // este segundo fetch, un clic en el Sidebar sin señal se queda
      // colgado esperando una respuesta de red que nunca llega — no hay
      // nada cacheado bajo ese formato para servir de respaldo (hallazgo
      // real de S13-17, confirmado en vivo con el servidor apagado: la
      // recarga dura funcionaba, pero la navegación interna del Sidebar
      // no. Ver R1 en spec.md, exactamente el riesgo que anticipaba).
      fetch(ruta, { credentials: "include", headers: { RSC: "1" } }).catch(() => {});
    }
  }, []);
  return null;
}
