"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import { revertirSueldoMovimientoAction } from "@/server/actions/sueldo-movimiento";

const VENTANA_MS = VENTANA_GRACIA_MIN * 60_000;

function formatearMMSS(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const minutos = Math.floor(totalSeg / 60);
  const segundos = totalSeg % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

type Props = { movimiento: { id: string; fecha: Date; revertido: boolean } };

// Copia estructural de RevertirMortalidadBoton/RevertirEgresoBoton
// (countdown real, 1s). Ancla a `movimiento.fecha`, no a un `creadoEn`
// aparte — SueldoMovimiento no es editable (decisión 2, spec.md), así
// que `fecha` nunca cambia después del alta y sirve de ancla directa.
export function RevertirSueldoMovimientoBoton({ movimiento }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [restanteMs, setRestanteMs] = useState(
    () => VENTANA_MS - (Date.now() - movimiento.fecha.getTime()),
  );

  useEffect(() => {
    if (movimiento.revertido) return;
    const intervalo = setInterval(() => {
      const restante = VENTANA_MS - (Date.now() - movimiento.fecha.getTime());
      setRestanteMs(restante);
      if (restante <= 0) clearInterval(intervalo);
    }, 1000);
    return () => clearInterval(intervalo);
  }, [movimiento.fecha, movimiento.revertido]);

  if (movimiento.revertido) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (restanteMs <= 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  function confirmar() {
    startTransition(async () => {
      const resultado = await revertirSueldoMovimientoAction({ id: movimiento.id });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo deshacer el movimiento",
          description: resultado.error,
        });
        return;
      }
      router.refresh();
      toastManager.add({ type: "success", title: "Movimiento revertido" });
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={confirmar}>
      <Undo2 data-icon="inline-start" />
      {pending ? "Deshaciendo..." : `Deshacer (${formatearMMSS(restanteMs)})`}
    </Button>
  );
}
