"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Warehouse } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { mudarLoteAction } from "@/server/actions/lote";
import type { ActionResult } from "@/server/auth/with-auth";

type GalponOpcion = { id: string; nombre: string };

type Props = {
  lote: { id: string; codigo: string };
  galponActualId: string | null;
  galponesActivos: GalponOpcion[];
};

type Estado = ActionResult<{ id: string }> | undefined;

const LABEL_COMPACTO = "text-sm text-muted-foreground";

export function MudanzaDialog({ lote, galponActualId, galponesActivos }: Props) {
  const [open, setOpen] = useState(false);

  // El galpón donde el lote ya está no aparece como destino posible — la
  // guard puedeMudarLote (server/services/lote.ts) igual lo rechazaría,
  // pero no tiene sentido ofrecerlo en el <Select> para empezar.
  const destinosDisponibles = galponesActivos.filter((galpon) => galpon.id !== galponActualId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowRightLeft data-icon="inline-start" />
            Mudar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <ArrowRightLeft className="size-4 text-primary" />
            Mudar {lote.codigo}
          </DialogTitle>
          <DialogDescription>
            Cierra la ubicación actual y abre una nueva en el galpón que
            elijas, sin perder el historial.
          </DialogDescription>
        </DialogHeader>

        {/* Formulario en un componente aparte, montado solo mientras
        `open` es true — mismo motivo que LoteFormDialog: así
        useActionState() arranca limpio en cada apertura, en vez de
        arrastrar el error de una tanda anterior (bug real corregido en
        esta sesión). */}
        {open ? (
          <MudanzaForm
            lote={lote}
            destinosDisponibles={destinosDisponibles}
            onExito={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MudanzaForm({
  lote,
  destinosDisponibles,
  onExito,
}: {
  lote: { id: string; codigo: string };
  destinosDisponibles: GalponOpcion[];
  onExito: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Controlado por el mismo motivo que LoteFormDialog: Base UI puede caer
  // en un fallback que muestra el id crudo en vez del nombre del galpón
  // si su lista interna de ítems no lo tiene registrado en ese momento.
  const [galponDestinoId, setGalponDestinoId] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await mudarLoteAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Lote mudado",
        description: `${lote.codigo} tiene una nueva ubicación.`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const destinoSeleccionado = destinosDisponibles.find((galpon) => galpon.id === galponDestinoId);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="loteId" value={lote.id} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="galponDestinoId" className={LABEL_COMPACTO}>
          <Warehouse className="size-4 text-muted-foreground" />
          Galpón destino
        </Label>
        <Select name="galponDestinoId" value={galponDestinoId} onValueChange={setGalponDestinoId}>
          <SelectTrigger id="galponDestinoId" className="h-10 w-full">
            <SelectValue placeholder="Selecciona un galpón">
              {destinoSeleccionado?.nombre}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {destinosDisponibles.map((galpon) => (
              <SelectItem key={galpon.id} value={galpon.id}>
                {galpon.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("galponDestinoId")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending}>
          <Check data-icon="inline-start" />
          {pending ? "Mudando..." : "Confirmar mudanza"}
        </Button>
      </DialogFooter>
    </form>
  );
}
