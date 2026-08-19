"use client";

import { useSyncExternalStore } from "react";

import { puedeInstalarEnIos, reabrirBannerIos } from "@/components/domain/pwa/ios-install-banner";
import { Button } from "@/components/ui/button";

// Sin suscripción real: puedeInstalarEnIos() es estable durante la sesión
// (detección de plataforma, no cambia con el tiempo) — el no-op acá solo
// da la lectura diferida al cliente (SSR-safe), a diferencia del store de
// obtenerBannerVisible en ios-install-banner.tsx, que sí cambia.
function sinSuscripcion() {
  return () => {};
}

function obtenerSnapshotServidor() {
  return false;
}

// Botón manual "Cómo instalar" del footer del Sidebar (decisión de
// negocio 4, spec.md) — visible solo en iOS Safari sin la app instalada,
// sin importar si el banner automático ya se cerró; lo reabre al tocarlo.
export function IosInstallButton() {
  const disponible = useSyncExternalStore(sinSuscripcion, puedeInstalarEnIos, obtenerSnapshotServidor);

  if (!disponible) return null;

  return (
    <Button size="sm" variant="outline" className="w-full" onClick={() => reabrirBannerIos()}>
      Cómo instalar
    </Button>
  );
}
