"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PackageOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastManager } from "@/components/ui/toast";
import { romperPaqueteAction } from "@/server/actions/rotura";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

type DatosRotura = { paqueteId: string; unidadesDevueltas: number; unidadesSinLote: number };
type Estado = ActionResult<DatosRotura> | undefined;

// Botón "Romper" por fila del listado de Paquetes disponibles en
// /consolidacion (RomperInventarioSection) — vive acá, no en /pos: la
// granja no vende huevo por unidad (confirmado con el Product Owner
// durante Sprint 10), así que romper un paquete siempre es para
// reshapear inventario vía los wizards "Armar Bandeja"/"Armar Paquete
// Mixto" de esta misma pantalla (Sprint 7), nunca para completar una
// venta directa. Al confirmar, router.refresh() trae de nuevo la lista de
// DISPONIBLE y los saldos de sueltos actualizados desde el servidor —
// mismo patrón que ComprobanteDialog al cerrar (Sprint 9).
export function RomperPaqueteDialog({ paquete }: { paquete: { id: string; peso: number } }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <PackageOpen data-icon="inline-start" />
            Romper
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <PackageOpen className="size-4 text-primary" />
            Romper paquete
          </DialogTitle>
          <DialogDescription>
            Las 180 unidades de este paquete pasan a sueltos, repartidas entre sus galpones/lotes de
            origen reales. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {open ? <RomperPaqueteForm paquete={paquete} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RomperPaqueteForm({
  paquete,
  onExito,
}: {
  paquete: { id: string; peso: number };
  onExito: () => void;
}) {
  const router = useRouter();
  const [pesoExtraidoInput, setPesoExtraidoInput] = useState("");

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await romperPaqueteAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Paquete roto",
        description: `Se acreditaron ${resultado.data.unidadesDevueltas} de 180 unidades al inventario de sueltos.`,
      });
      if (resultado.data.unidadesSinLote > 0) {
        toastManager.add({
          type: "info",
          title: "Unidades sin lote de origen conocido",
          description: `${resultado.data.unidadesSinLote} unidades quedaron sin acreditar automáticamente - un Gerente puede acreditarlas desde "Ajustar inventario".`,
        });
      }
      onExito();
    }
    return resultado;
  }, undefined);

  const pesoExtraido = Number(pesoExtraidoInput);
  const pesoValido = pesoExtraidoInput.trim() !== "" && pesoExtraido > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="paqueteId" value={paquete.id} />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">Peso original: {paquete.peso.toFixed(3)} kg</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pesoExtraido" className={LABEL_COMPACTO}>
          Peso leído en la báscula ahora (kg)
        </Label>
        <Input
          id="pesoExtraido"
          name="pesoExtraido"
          type="number"
          inputMode="decimal"
          step="0.001"
          required
          value={pesoExtraidoInput}
          onChange={(evento) => setPesoExtraidoInput(evento.target.value)}
          className={INPUT_COMPACTO}
        />
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !pesoValido}>
          <Check data-icon="inline-start" />
          {pending ? "Rompiendo..." : "Confirmar rotura"}
        </Button>
      </DialogFooter>
    </form>
  );
}
