"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, IdCard, Pencil, Phone, Plus, UserRound } from "lucide-react";

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
import { crearEmpleadoAction, editarEmpleadoAction } from "@/server/actions/empleado";
import type { ActionResult } from "@/server/auth/with-auth";

const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

type EmpleadoEditable = {
  id: string;
  nombre: string;
  celular: string | null;
  cargo: string | null;
};

type Props = { modo: "crear" } | { modo: "editar"; empleado: EmpleadoEditable };

type Estado = ActionResult<{ id: string }> | undefined;

// Sin ningún campo de vínculo a Usuario (decisión 5, spec.md) — Empleado
// queda 100% desacoplado este sprint. Mismo patrón crear+editar en un
// solo componente que UsuarioFormDialog/EgresoFormDialog.
export function EmpleadoFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.modo === "crear" ? (
            <Button variant="default" size="md">
              <Plus data-icon="inline-start" />
              Nuevo empleado
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
              <IdCard className="size-4 text-primary" />
            ) : (
              <Pencil className="size-4 text-primary" />
            )}
            {props.modo === "crear" ? "Nuevo empleado" : "Editar empleado"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "crear"
              ? "Queda ACTIVO de inmediato."
              : "Celular y cargo son opcionales."}
          </DialogDescription>
        </DialogHeader>

        {open ? <EmpleadoForm {...props} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EmpleadoForm(props: Props & { onExito: () => void }) {
  const router = useRouter();
  const accion = props.modo === "crear" ? crearEmpleadoAction : editarEmpleadoAction;
  const [id] = useState(() =>
    props.modo === "editar" ? props.empleado.id : crypto.randomUUID(),
  );

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await accion(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: props.modo === "crear" ? "Empleado creado" : "Empleado actualizado",
        description: `${formData.get("nombre")}`,
      });
      props.onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre" className={LABEL_COMPACTO}>
          <UserRound className="size-4 text-muted-foreground" />
          Nombre
        </Label>
        <Input
          id="nombre"
          name="nombre"
          required
          autoFocus
          defaultValue={props.modo === "editar" ? props.empleado.nombre : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("nombre")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="celular" className={LABEL_COMPACTO}>
          <Phone className="size-4 text-muted-foreground" />
          Celular (opcional)
        </Label>
        <Input
          id="celular"
          name="celular"
          defaultValue={props.modo === "editar" ? (props.empleado.celular ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("celular")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cargo" className={LABEL_COMPACTO}>
          <Briefcase className="size-4 text-muted-foreground" />
          Cargo (opcional)
        </Label>
        <Input
          id="cargo"
          name="cargo"
          defaultValue={props.modo === "editar" ? (props.empleado.cargo ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("cargo")?.map((error) => (
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
