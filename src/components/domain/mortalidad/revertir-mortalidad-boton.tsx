"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { MORTALIDAD_VENTANA_GRACIA_MIN } from "@/lib/constants";
import { revertirMortalidadAction } from "@/server/actions/mortalidad";

const VENTANA_MS = MORTALIDAD_VENTANA_GRACIA_MIN * 60_000;

function formatearMMSS(ms: number): string {
  const totalSeg = Math.max(0, Math.ceil(ms / 1000));
  const minutos = Math.floor(totalSeg / 60);
  const segundos = totalSeg % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

type Props = { registro: { id: string; fecha: Date; revertido: boolean } };

// Countdown real (setInterval de 1s), no un cálculo estático al cargar
// la página — mismo espíritu que pedía el roadmap para la ventana de
// gracia de Recolección ("botón con countdown, basado en creadoEn del
// servidor"). El plazo real y autoritativo lo valida igual
// puedeRevertirMortalidad() en el servidor (server/services/mortalidad.ts)
// al hacer clic — este countdown es solo para que el botón desaparezca
// solo sin tener que recargar la página, no la fuente de verdad.
export function RevertirMortalidadBoton({ registro }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [restanteMs, setRestanteMs] = useState(
    () => VENTANA_MS - (Date.now() - registro.fecha.getTime()),
  );

  useEffect(() => {
    if (registro.revertido) return;
    const intervalo = setInterval(() => {
      const restante = VENTANA_MS - (Date.now() - registro.fecha.getTime());
      setRestanteMs(restante);
      if (restante <= 0) clearInterval(intervalo);
    }, 1000);
    return () => clearInterval(intervalo);
  }, [registro.fecha, registro.revertido]);

  if (registro.revertido) {
    return <span className="text-sm text-muted-foreground">Revertido</span>;
  }
  if (restanteMs <= 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  function confirmar() {
    startTransition(async () => {
      const resultado = await revertirMortalidadAction({ registroId: registro.id });
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
