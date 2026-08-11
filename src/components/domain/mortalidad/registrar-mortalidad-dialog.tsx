"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Skull } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { registrarMortalidad } from "@/server/actions/mortalidad";
import type { ActionResult } from "@/server/auth/with-auth";

type LoteOpcion = { id: string; codigo: string; avesVivas: number };

type Estado = ActionResult<{ id: string }> | undefined;

const TIPOS: { value: string; label: string }[] = [
  { value: "MUERTE", label: "Muerte" },
  { value: "DESCARTE", label: "Descarte" },
];

// Mismo <Dialog> compacto que LoteFormDialog/GalponFormDialog/
// UsuarioFormDialog — a pedido del Product Owner, no el <Sheet
// side="bottom"> que se probó primero: se ve bien en mobile pero mal en
// escritorio, y la prioridad es que ambos tamaños se vean bien con un
// solo patrón, el que ya está probado en el resto del proyecto.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

export function RegistrarMortalidadDialog({ lotesActivos }: { lotesActivos: LoteOpcion[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Registrar mortalidad
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Skull className="size-4 text-primary" />
            Registrar mortalidad
          </DialogTitle>
          <DialogDescription>
            El galpón se resuelve solo.
          </DialogDescription>
        </DialogHeader>

        {/* Mismo criterio que LoteFormDialog/MudanzaDialog (Sprint 3): el
        formulario vive en un componente aparte que solo se monta mientras
        `open` es true, para que useActionState() arranque limpio en cada
        apertura en vez de arrastrar el error de una tanda anterior. */}
        {open ? (
          <RegistrarMortalidadForm lotesActivos={lotesActivos} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RegistrarMortalidadForm({
  lotesActivos,
  onExito,
}: {
  lotesActivos: LoteOpcion[];
  onExito: () => void;
}) {
  const router = useRouter();
  // Controlados por el mismo motivo que el <Select> de galpón en
  // LoteFormDialog/MudanzaDialog (Bug 2 de Sprint 3): sin esto, Base UI
  // puede caer en un fallback que muestra el value crudo (un uuid, o el
  // literal "MUERTE") en vez de la etiqueta legible si su lista interna
  // de ítems no lo tiene registrado en ese momento.
  const [loteId, setLoteId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  // Generado una sola vez por apertura del diálogo — mismo fix que el bug
  // real de Recolección (S5-13), acá con más motivo: un doble clic sin
  // esto no solo duplicaba el registro, decrementaba avesVivas dos veces
  // (hallazgo real de la auditoría post-Sprint 5).
  const [id] = useState(() => crypto.randomUUID());

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await registrarMortalidad(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Mortalidad registrada",
        description: `${formData.get("cantidad")} aves`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const loteSeleccionado = lotesActivos.find((lote) => lote.id === loteId);
  const tipoSeleccionado = TIPOS.find((opcion) => opcion.value === tipo);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="loteId" className={LABEL_COMPACTO}>
          Lote
        </Label>
        <Select name="loteId" value={loteId} onValueChange={setLoteId}>
          <SelectTrigger id="loteId" className="h-10 w-full">
            <SelectValue placeholder="Selecciona un lote">
              {loteSeleccionado
                ? `${loteSeleccionado.codigo} — ${loteSeleccionado.avesVivas} vivas`
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {lotesActivos.map((lote) => (
              <SelectItem key={lote.id} value={lote.id}>
                {lote.codigo} — {lote.avesVivas} vivas
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("loteId")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tipo" className={LABEL_COMPACTO}>
          Tipo
        </Label>
        <Select name="tipo" value={tipo} onValueChange={setTipo}>
          <SelectTrigger id="tipo" className="h-10 w-full">
            <SelectValue placeholder="Selecciona un tipo">{tipoSeleccionado?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("tipo")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cantidad" className={LABEL_COMPACTO}>
          Cantidad
        </Label>
        <Input
          id="cantidad"
          name="cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          required
          autoFocus
          className={INPUT_COMPACTO}
        />
        {erroresDe("cantidad")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
