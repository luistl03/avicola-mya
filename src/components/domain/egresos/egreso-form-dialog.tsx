"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoriaEgreso } from "@prisma/client";
import { Check, FileText, Pencil, Plus, Receipt, Wallet } from "lucide-react";

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
import { crearEgresoAction, editarEgresoAction } from "@/server/actions/egreso";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

const CATEGORIAS: { value: CategoriaEgreso; label: string }[] = [
  { value: "ALIMENTOS", label: "Alimentos" },
  { value: "INSUMOS_VACUNAS", label: "Insumos y vacunas" },
  { value: "SERVICIOS", label: "Servicios" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "VARIOS", label: "Varios" },
];

type EgresoEditable = {
  id: string;
  categoria: CategoriaEgreso;
  monto: number;
  descripcion: string;
  fecha: Date;
};

type Props = { modo: "crear" } | { modo: "editar"; egreso: EgresoEditable };

type Estado = ActionResult<{ id: string }> | undefined;

function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Fecha-calendario en UTC (mismo criterio que formatearFecha,
// lib/fecha.ts) — Egreso.fecha se guarda como medianoche UTC.
function fechaComoStringDeInput(fecha: Date): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: "UTC" });
}

// Editable sin límite de tiempo mientras no esté anulado (decisión 1,
// spec.md) — a diferencia de RevertirEgresoBoton, este dialog no
// desaparece con el tiempo. Mismo patrón crear+editar en un solo
// componente que UsuarioFormDialog: el formulario vive en un
// subcomponente montado solo mientras `open` es true (evita el `state`
// viejo pegado al reabrir, bug real de Sprint 3).
export function EgresoFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.modo === "crear" ? (
            <Button variant="default" size="md">
              <Plus data-icon="inline-start" />
              Nuevo egreso
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Pencil data-icon="inline-start" />
              Editar
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.modo === "crear" ? (
              <Wallet className="size-4 text-primary" />
            ) : (
              <Pencil className="size-4 text-primary" />
            )}
            {props.modo === "crear" ? "Nuevo egreso" : "Editar egreso"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "crear"
              ? "Registro contable interno."
              : "Editable en cualquier momento mientras no esté anulado."}
          </DialogDescription>
        </DialogHeader>

        {open ? <EgresoForm {...props} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EgresoForm(props: Props & { onExito: () => void }) {
  const router = useRouter();
  const accion = props.modo === "crear" ? crearEgresoAction : editarEgresoAction;
  // Generado una sola vez por apertura del diálogo, no en cada submit —
  // mismo criterio de idempotencia que RegistrarAbonoDialog/ClienteFormDialog.
  const [id] = useState(() =>
    props.modo === "editar" ? props.egreso.id : crypto.randomUUID(),
  );
  const [categoria, setCategoria] = useState<CategoriaEgreso>(
    props.modo === "editar" ? props.egreso.categoria : "ALIMENTOS",
  );

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await accion(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: props.modo === "crear" ? "Egreso registrado" : "Egreso actualizado",
        description: `S/ ${formData.get("monto")}`,
      });
      props.onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const seleccionada = CATEGORIAS.find((opcion) => opcion.value === categoria);
  const hoy = hoyEnLimaComoStringDeInput();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="categoria" value={categoria} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria" className={LABEL_COMPACTO}>
          <Receipt className="size-4 text-muted-foreground" />
          Categoría
        </Label>
        <Select value={categoria} onValueChange={(valor) => setCategoria(valor as CategoriaEgreso)}>
          <SelectTrigger id="categoria" className="h-10 w-full">
            <SelectValue>{seleccionada?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((opcion) => (
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
          defaultValue={props.modo === "editar" ? props.egreso.monto : undefined}
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
          Descripción
        </Label>
        <Input
          id="descripcion"
          name="descripcion"
          required
          defaultValue={props.modo === "editar" ? props.egreso.descripcion : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("descripcion")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fecha" className={LABEL_COMPACTO}>
          Fecha
        </Label>
        <Input
          id="fecha"
          name="fecha"
          type="date"
          required
          max={hoy}
          defaultValue={
            props.modo === "editar" ? fechaComoStringDeInput(props.egreso.fecha) : hoy
          }
          className={INPUT_COMPACTO}
        />
        {erroresDe("fecha")?.map((error) => (
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
