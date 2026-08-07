"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Ruler, Warehouse } from "lucide-react";

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
import { crearGalpon, editarGalpon } from "@/server/actions/galpon";
import type { ActionResult } from "@/server/auth/with-auth";

type GalponEditable = { id: string; nombre: string; capacidadMaxima: number };

type Props = { modo: "crear" } | { modo: "editar"; galpon: GalponEditable };

type Estado = ActionResult<{ id: string }> | undefined;

// Mismo criterio que UsuarioFormDialog (Sprint 2): inputs/labels
// compactos porque este formulario lo llena el Gerente desde un dialog
// de gestión de escritorio, no un Operario leyendo al sol en campo.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

export function GalponFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.modo === "crear" ? (
            <Button variant="default" size="md">
              <Plus data-icon="inline-start" />
              Nuevo galpón
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
              <Warehouse className="size-4 text-primary" />
            ) : (
              <Pencil className="size-4 text-primary" />
            )}
            {props.modo === "crear" ? "Nuevo galpón" : "Editar galpón"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "crear"
              ? "El galpón queda ACTIVO de inmediato, disponible para alojar lotes."
              : "La capacidad no puede bajar de la cantidad de aves que aloja hoy."}
          </DialogDescription>
        </DialogHeader>

        {/* El formulario vive en un componente aparte, montado solo
        mientras `open` es true — así useActionState() arranca limpio en
        cada apertura del modal, en vez de arrastrar el error de una
        tanda anterior (bug real: el mensaje "Datos inválidos." quedaba
        pegado al reabrir el modal sin haber tocado nada, porque el
        `state` de useActionState vivía en este componente de afuera, que
        nunca se desmonta al cerrar el Dialog — solo el <form> de adentro
        lo hacía). También evita la advertencia de Base UI de Sprint 2
        (inputs no controlados recibiendo props nuevas mientras el modal
        todavía está cerrando): al desmontarse todo el subcomponente, no
        solo el <form>, no queda nada que pueda recibir esas props tarde. */}
        {open ? (
          <GalponForm key={props.modo} {...props} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GalponForm(props: Props & { onExito: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const accion = props.modo === "crear" ? crearGalpon : editarGalpon;

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await accion(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: props.modo === "crear" ? "Galpón creado" : "Galpón actualizado",
        description: `${formData.get("nombre")}`,
      });
      props.onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {props.modo === "editar" ? (
        <input type="hidden" name="galponId" value={props.galpon.id} />
      ) : null}

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre" className={LABEL_COMPACTO}>
          <Warehouse className="size-4 text-muted-foreground" />
          Nombre
        </Label>
        <Input
          id="nombre"
          name="nombre"
          required
          autoFocus
          defaultValue={props.modo === "editar" ? props.galpon.nombre : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("nombre")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="capacidadMaxima" className={LABEL_COMPACTO}>
          <Ruler className="size-4 text-muted-foreground" />
          Capacidad máxima (aves)
        </Label>
        <Input
          id="capacidadMaxima"
          name="capacidadMaxima"
          type="number"
          min={1}
          required
          defaultValue={props.modo === "editar" ? props.galpon.capacidadMaxima : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("capacidadMaxima")?.map((error) => (
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
