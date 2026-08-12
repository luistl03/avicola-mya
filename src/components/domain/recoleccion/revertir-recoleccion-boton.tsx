"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import { revertirRecoleccionAction } from "@/server/actions/recoleccion";

const VENTANA_MS = VENTANA_GRACIA_MIN * 60_000;

function formatearMMSS(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const minutos = Math.floor(totalSeg / 60);
  const segundos = totalSeg % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

type Props = {
  registro: { id: string; creadoEn: Date; revertido: boolean; paquetesNoDisponibles: number };
};

// Clon directo de RevertirMortalidadBoton (Sprint 4) — mismo countdown
// real por setInterval, mismo criterio de "el plazo autoritativo lo
// revalida el servidor al hacer clic (puedeRevertirRecoleccion en
// server/services/recoleccion.ts), esto es solo cosmético". Única
// diferencia real: el chequeo de paquetesNoDisponibles (Mortalidad no
// tiene equivalente — nunca genera inventario vendible) — si algún
// Paquete de este registro ya no está DISPONIBLE, no tiene sentido
// mostrar un botón que el servidor va a rechazar siempre.
export function RevertirRecoleccionBoton({ registro }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [restanteMs, setRestanteMs] = useState(
    () => VENTANA_MS - (Date.now() - registro.creadoEn.getTime()),
  );

  useEffect(() => {
    if (registro.revertido || registro.paquetesNoDisponibles > 0) return;
    const intervalo = setInterval(() => {
      const restante = VENTANA_MS - (Date.now() - registro.creadoEn.getTime());
      setRestanteMs(restante);
      if (restante <= 0) clearInterval(intervalo);
    }, 1000);
    return () => clearInterval(intervalo);
  }, [registro.creadoEn, registro.revertido, registro.paquetesNoDisponibles]);

  if (registro.revertido) {
    return <span className="text-sm text-muted-foreground">Revertido</span>;
  }
  if (registro.paquetesNoDisponibles > 0) {
    return <span className="text-sm text-muted-foreground">No disponible</span>;
  }
  if (restanteMs <= 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  function confirmar() {
    startTransition(async () => {
      const resultado = await revertirRecoleccionAction({ registroId: registro.id });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo deshacer el registro",
          description: resultado.error,
        });
        return;
      }
      router.refresh();
      toastManager.add({ type: "success", title: "Registro revertido" });
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={confirmar}>
      <Undo2 data-icon="inline-start" />
      {pending ? "Deshaciendo..." : `Deshacer (${formatearMMSS(restanteMs)})`}
    </Button>
  );
}
