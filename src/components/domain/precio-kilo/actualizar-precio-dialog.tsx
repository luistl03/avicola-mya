"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Tag } from "lucide-react";

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
import { crearPrecioKilo } from "@/server/actions/precioKilo";
import type { ActionResult } from "@/server/auth/with-auth";

type Estado = ActionResult<{ id: string; precio: number }> | undefined;

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

// A diferencia de ClienteFormDialog/GalponFormDialog, no lleva `modo`: un
// PrecioKilo nunca se edita — cada envío exitoso es siempre un `create`
// nuevo (roadmap: "nueva fila, nunca UPDATE").
export function ActualizarPrecioDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Actualizar precio
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Tag className="size-4 text-primary" />
            Actualizar precio por kilo
          </DialogTitle>
          <DialogDescription>
            El precio vigente actual queda intacto en el histórico. Esto
            agrega una fila nueva, nunca reemplaza la anterior.
          </DialogDescription>
        </DialogHeader>

        {/* Montado solo mientras `open` — mismo fix ya aplicado en el
        resto de dialogs del proyecto desde Sprint 3. */}
        {open ? <ActualizarPrecioForm onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ActualizarPrecioForm({ onExito }: { onExito: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Generado una sola vez por apertura del diálogo — mismo motivo que el
  // resto de formularios de creación del proyecto desde el fix de S5-13:
  // reusar el mismo id ante un doble clic hace que el segundo envío
  // colisione con P2002 en vez de insertar una segunda fila de precio.
  const [id] = useState(() => crypto.randomUUID());

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await crearPrecioKilo(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Precio actualizado",
        description: `S/ ${formData.get("precio")}`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="precio" className={LABEL_COMPACTO}>
          <Tag className="size-4 text-muted-foreground" />
          Precio por kilo (S/)
        </Label>
        <Input
          id="precio"
          name="precio"
          type="number"
          step="0.01"
          min={0.01}
          required
          autoFocus
          className={INPUT_COMPACTO}
        />
        {erroresDe("precio")?.map((error) => (
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
