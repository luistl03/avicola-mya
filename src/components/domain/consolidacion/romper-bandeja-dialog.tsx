"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Check } from "lucide-react";

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
import { romperBandejaAction } from "@/server/actions/rotura";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

type DatosRotura = { bandejaId: string; unidadesDevueltas: number; unidadesSinLote: number };
type Estado = ActionResult<DatosRotura> | undefined;

// Mismo patrón que RomperPaqueteDialog — mirror completo para
// BandejaSuelta (decisión de negocio 5, spec.md de Sprint 10). Las 30
// unidades rotas quedan como sueltos comunes en el ledger, listas para
// combinarse en un Paquete/Bandeja nuevo con los wizards ya existentes de
// esta misma pantalla (Sprint 7) — nunca para vender directo, la granja no
// vende huevo por unidad.
export function RomperBandejaDialog({ bandeja }: { bandeja: { id: string; peso: number } }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Boxes data-icon="inline-start" />
            Romper
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Boxes className="size-4 text-primary" />
            Romper bandeja
          </DialogTitle>
          <DialogDescription>
            Las 30 unidades de esta bandeja pasan a sueltos, repartidas entre sus galpones/lotes de
            origen reales. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {open ? <RomperBandejaForm bandeja={bandeja} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RomperBandejaForm({
  bandeja,
  onExito,
}: {
  bandeja: { id: string; peso: number };
  onExito: () => void;
}) {
  const router = useRouter();
  const [pesoExtraidoInput, setPesoExtraidoInput] = useState("");

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await romperBandejaAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Bandeja rota",
        description: `Se acreditaron ${resultado.data.unidadesDevueltas} de 30 unidades al inventario de sueltos.`,
      });
      if (resultado.data.unidadesSinLote > 0) {
        toastManager.add({
          type: "info",
          title: "Unidades sin lote de origen conocido",
          description: `${resultado.data.unidadesSinLote} unidades quedaron sin acreditar automáticamente — un Gerente puede acreditarlas desde "Ajustar inventario".`,
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
      <input type="hidden" name="bandejaId" value={bandeja.id} />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">Peso original: {bandeja.peso.toFixed(3)} kg</p>

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
