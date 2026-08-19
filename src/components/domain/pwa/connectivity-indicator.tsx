"use client";

import { useSyncExternalStore } from "react";

function suscribirse(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function obtenerSnapshot() {
  return navigator.onLine;
}

// SSR: navigator no existe en el servidor — asume online, se corrige solo
// en el primer render del cliente (evita el warning de hidratación que
// causaría cualquier otro valor fijo distinto entre servidor y cliente).
function obtenerSnapshotServidor() {
  return true;
}

// Vive en el footer del Sidebar (decisión de negocio 5, spec.md), en línea
// junto a la etiqueta de rol — no en su propia fila (bug real de UX
// reportado por el Product Owner probando en Android: el punto solo en
// una fila propia se veía "huérfano", flotando entre el rol y "Cerrar
// sesión"). `inline-flex`, pensado para componerse dentro de otro
// contenedor flex, no un bloque aparte.
// useSyncExternalStore, no useState+useEffect: es el patrón recomendado
// por React para suscribirse a estado externo del navegador (el propio
// linter de React lo marca como anti-patrón si se hace con setState
// dentro de un efecto — mismo tipo de hallazgo real que ya documentó
// Sprint 4 para BitacoraMuro, ver memory/convenciones.md).
export function ConnectivityIndicator() {
  const online = useSyncExternalStore(suscribirse, obtenerSnapshot, obtenerSnapshotServidor);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={online ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-muted-foreground"}
        aria-hidden
      />
      {!online && <span>Sin conexión</span>}
    </span>
  );
}
