"use client";

import { useEffect } from "react";

import { sincronizarCola } from "@/lib/offline/sincronizador";

// Montado una sola vez por sesión de login (RootLayout, rama `usuario`,
// mismo criterio que PrecargarCatalogos) — sin estado ni render propio.
// Dos disparadores (ver plan.md, "Disparadores de sincronizarCola()"):
// al montar (por si la app se abrió ya con señal y había pendientes de
// una sesión anterior, sin haber disparado "online" todavía) y en cada
// evento "online" del navegador — mismo mecanismo de detección que
// ConnectivityIndicator, no uno nuevo. El botón de reintento manual y la
// visibilidad de qué hay pendiente son de la pantalla de pendientes
// (H6, Sprint 14 14B) — este componente no muestra nada, solo dispara.
export function SincronizadorOffline() {
  useEffect(() => {
    void sincronizarCola();

    function alReconectar() {
      void sincronizarCola();
    }
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, []);

  return null;
}
