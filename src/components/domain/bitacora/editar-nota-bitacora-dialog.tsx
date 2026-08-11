"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoriaBitacora } from "@prisma/client";
import { Check, Pencil } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { editarNotaBitacora } from "@/server/actions/bitacora";
import type { ActionResult } from "@/server/auth/with-auth";

type NotaEditable = { id: string; categoria: CategoriaBitacora; contenido: string };

type Estado = ActionResult<NotaEditable> | undefined;

const CATEGORIAS: { value: string; label: string }[] = [
  { value: "ALIMENTACION", label: "Alimentación" },
  { value: "VACUNACION", label: "Vacunación" },
  { value: "OBSERVACION", label: "Observación" },
];

const LABEL_COMPACTO = "text-sm text-muted-foreground";

type Props = { nota: NotaEditable; onExito: (nota: NotaEditable) => void };

// Sin restricción de rol ni de autoría, sin ventana de tiempo (decisión
// de negocio confirmada): cualquier usuario autenticado puede corregir
// cualquier nota, en cualquier momento — a diferencia de Mortalidad, acá
// no hay ningún dato en cascada que una edición pueda descuadrar.
export function EditarNotaBitacoraDialog({ nota, onExito }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Editar nota">
            <Pencil />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Pencil className="size-4 text-primary" />
            Editar nota
          </DialogTitle>
          <DialogDescription>Corregí la categoría o el contenido.</DialogDescription>
        </DialogHeader>

        {open ? (
          <EditarNotaBitacoraForm
            nota={nota}
            onExito={(notaActualizada) => {
              setOpen(false);
              onExito(notaActualizada);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditarNotaBitacoraForm({ nota, onExito }: Props) {
  const router = useRouter();
  const [categoria, setCategoria] = useState<string | null>(nota.categoria);

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await editarNotaBitacora(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({ type: "success", title: "Nota actualizada" });
      onExito(resultado.data);
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const categoriaSeleccionada = CATEGORIAS.find((opcion) => opcion.value === categoria);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="notaId" value={nota.id} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria-editar" className={LABEL_COMPACTO}>
          Categoría
        </Label>
        <Select name="categoria" value={categoria} onValueChange={setCategoria}>
          <SelectTrigger id="categoria-editar" className="h-10 w-full">
            <SelectValue placeholder="Selecciona una categoría">
              {categoriaSeleccionada?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("categoria")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contenido-editar" className={LABEL_COMPACTO}>
          Nota
        </Label>
        <Textarea
          id="contenido-editar"
          name="contenido"
          rows={4}
          required
          defaultValue={nota.contenido}
          className="text-sm"
        />
        {erroresDe("contenido")?.map((error) => (
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
