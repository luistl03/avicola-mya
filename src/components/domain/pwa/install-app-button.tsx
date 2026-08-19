"use client";

import { useSyncExternalStore } from "react";

import {
  dispararInstalacion,
  obtenerInstalacionDisponible,
  suscribirseAInstalacion,
} from "@/components/domain/pwa/install-prompt-android";
import { Button } from "@/components/ui/button";

// SSR: sin evento capturado todavía (llega recién por interacción real
// del navegador en el cliente) — arranca oculto, se corrige solo con la
// primera suscripción real del cliente.
function obtenerSnapshotServidor() {
  return false;
}

// Botón manual de respaldo del footer del Sidebar (decisión de negocio 3,
// spec.md) — visible solo si el navegador ya ofreció beforeinstallprompt
// y la app todavía no está instalada; se oculta solo tras instalar
// (mismo store que InstallPromptAndroid, ver install-prompt-android.tsx).
export function InstallAppButton() {
  const disponible = useSyncExternalStore(suscribirseAInstalacion, obtenerInstalacionDisponible, obtenerSnapshotServidor);

  if (!disponible) return null;

  return (
    <Button size="sm" variant="outline" className="w-full" onClick={() => dispararInstalacion()}>
      Instalar app
    </Button>
  );
}
