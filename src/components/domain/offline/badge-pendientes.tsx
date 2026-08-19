"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";

import { Badge } from "@/components/ui/badge";
import { listarPendientes } from "@/lib/offline/cola";

// Visible solo cuando hay algo sin sincronizar en este dispositivo —
// acceso directo a /pendientes, no solo un indicador pasivo (a
// diferencia de ConnectivityIndicator, que siempre se muestra). Reusa la
// receta .badge-cola-pendiente de globals.css (memory/convenciones.md:
// ninguna receta de color suelta en un .tsx).
export function BadgePendientes() {
  const cantidad = useLiveQuery(async () => (await listarPendientes()).length, [], 0);

  if (!cantidad) return null;

  return (
    <Link href="/pendientes">
      <Badge variant="outline" className="badge-cola-pendiente">
        {cantidad} pendiente{cantidad === 1 ? "" : "s"}
      </Badge>
    </Link>
  );
}
