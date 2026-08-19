"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoSueldoMovimiento } from "@prisma/client";
import { Check, FileText, HandCoins, Plus, Wallet } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { crearSueldoMovimientoAction } from "@/server/actions/sueldo-movimiento";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

const TIPOS: { value: TipoSueldoMovimiento; label: string }[] = [
  { value: "SUELDO_BASE", label: "Sueldo base" },
  { value: "ADELANTO", label: "Adelanto" },
  { value: "BONO", label: "Bono" },
  { value: "DESCUENTO", label: "Descuento" },
];

type Estado = ActionResult<{ id: string }> | undefined;

// Sin <Select> de empleado: recibe empleadoId fijo desde el detalle
// (/personal/[empleadoId]) — a diferencia de lo que sugería H4 en
// abstracto, el flujo real entra siempre desde ahí (plan.md, "Diseño de
// UI"). Solo se muestra para un empleado ACTIVO (page.tsx no renderiza
// este botón para uno INACTIVO) — el guard real igual vive en el
// servidor (decisión 6, spec.md).
export function SueldoMovimientoFormDialog({ empleadoId }: { empleadoId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Registrar movimiento
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <HandCoins className="size-4 text-primary" />
            Registrar movimiento
          </DialogTitle>
          <DialogDescription>Sueldo base, adelanto, bono o descuento.</DialogDescription>
        </DialogHeader>

        {open ? (
          <SueldoMovimientoForm empleadoId={empleadoId} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SueldoMovimientoForm({
  empleadoId,
  onExito,
}: {
  empleadoId: string;
  onExito: () => void;
}) {
  const router = useRouter();
  // Generado una sola vez por apertura del diálogo — mismo criterio de
  // idempotencia que RegistrarAbonoDialog/EgresoFormDialog. Reusado si un
  // reintento tras un error de negocio (ej. "empleado inactivo") corrige
  // el payload y reenvía.
  const [id] = useState(() => crypto.randomUUID());
  const [tipo, setTipo] = useState<TipoSueldoMovimiento>("SUELDO_BASE");

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await crearSueldoMovimientoAction(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Movimiento registrado",
        description: `S/ ${formData.get("monto")}`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const seleccionado = TIPOS.find((opcion) => opcion.value === tipo);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="empleadoId" value={empleadoId} />
      <input type="hidden" name="tipo" value={tipo} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="tipo" className={LABEL_COMPACTO}>
          Tipo
        </Label>
        <Select value={tipo} onValueChange={(valor) => setTipo(valor as TipoSueldoMovimiento)}>
          <SelectTrigger id="tipo" className="h-10 w-full">
            <SelectValue>{seleccionado?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="monto" className={LABEL_COMPACTO}>
          <Wallet className="size-4 text-muted-foreground" />
          Monto (S/)
        </Label>
        <Input
          id="monto"
          name="monto"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          autoFocus
          className={INPUT_COMPACTO}
        />
        {erroresDe("monto")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="descripcion" className={LABEL_COMPACTO}>
          <FileText className="size-4 text-muted-foreground" />
          Descripción (opcional)
        </Label>
        <Input id="descripcion" name="descripcion" className={INPUT_COMPACTO} />
        {erroresDe("descripcion")?.map((error) => (
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
