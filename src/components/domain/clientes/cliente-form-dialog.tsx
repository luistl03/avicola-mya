"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoCliente } from "@prisma/client";
import { Check, Contact, MapPin, Pencil, Phone, Plus, Tags } from "lucide-react";

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
import { crearCliente, editarCliente } from "@/server/actions/cliente";
import type { ActionResult } from "@/server/auth/with-auth";

type ClienteEditable = {
  id: string;
  nombre: string;
  celular: string | null;
  direccion: string | null;
  tipo: TipoCliente;
};

type Props =
  | {
      modo: "crear";
      // Sprint 9 (POS) — cuando el autocomplete de cliente no encuentra
      // coincidencias, reusa este mismo dialog en vez de duplicar el
      // formulario; onCreado deja el cliente recién creado seleccionado
      // en la venta en curso, sin que el operario tenga que buscarlo de
      // nuevo. Opcional: el resto de usos de este dialog (la pantalla
      // /clientes) no lo necesita, ya refresca la tabla con router.refresh().
      onCreado?: (cliente: { id: string; nombre: string }) => void;
    }
  | { modo: "editar"; cliente: ClienteEditable };

type Estado = ActionResult<{ id: string }> | undefined;

// Mismo criterio compacto que GalponFormDialog/LoteFormDialog: dialog de
// gestión, lo llena un Gerente o un Operario desde escritorio o celular
// para dar de alta un cliente puntual, no un formulario largo de campo.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

const TIPO_OPCIONES: { value: TipoCliente; label: string }[] = [
  { value: "MAYORISTA", label: "Mayorista" },
  { value: "MINORISTA", label: "Minorista" },
  { value: "EVENTUAL", label: "Eventual" },
];

export function ClienteFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.modo === "crear" ? (
            <Button variant="default" size="md">
              <Plus data-icon="inline-start" />
              Nuevo cliente
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
              <Contact className="size-4 text-primary" />
            ) : (
              <Pencil className="size-4 text-primary" />
            )}
            {props.modo === "crear" ? "Nuevo cliente" : "Editar cliente"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "crear"
              ? "El cliente queda ACTIVO de inmediato."
              : "Celular y dirección son opcionales."}
          </DialogDescription>
        </DialogHeader>

        {/* Montado solo mientras `open` — mismo fix del bug real de
        Sprint 3 (el error de una tanda anterior quedaba pegado al reabrir
        el modal): GalponFormDialog/LoteFormDialog/UsuarioFormDialog ya
        siguen este mismo patrón. */}
        {open ? (
          <ClienteForm key={props.modo} {...props} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ClienteForm(props: Props & { onExito: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const accion = props.modo === "crear" ? crearCliente : editarCliente;
  // Generado una sola vez por apertura del diálogo, no en cada submit —
  // mismo motivo (y mismo fix) que el bug real encontrado en Recolección
  // (S5-13): reusar el mismo id ante un doble clic hace que el segundo
  // envío colisione con P2002 en vez de crear un cliente duplicado. Solo
  // hace falta en modo "crear" — editar apunta a un id que ya existe.
  const [id] = useState(() => crypto.randomUUID());
  // Mismo motivo que el <Select> de galpón en LoteFormDialog: controlado a
  // mano para que la etiqueta visible siempre salga de TIPO_OPCIONES, sin
  // depender de la resolución interna de Base UI (bug real de Sprint 3).
  const [tipo, setTipo] = useState<TipoCliente | null>(
    props.modo === "editar" ? props.cliente.tipo : null,
  );

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await accion(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: props.modo === "crear" ? "Cliente creado" : "Cliente actualizado",
        description: `${formData.get("nombre")}`,
      });
      if (props.modo === "crear") {
        props.onCreado?.({ id: resultado.data.id, nombre: String(formData.get("nombre")) });
      }
      props.onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const tipoSeleccionado = TIPO_OPCIONES.find((opcion) => opcion.value === tipo);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {props.modo === "crear" ? (
        <input type="hidden" name="id" value={id} />
      ) : (
        <input type="hidden" name="clienteId" value={props.cliente.id} />
      )}

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre" className={LABEL_COMPACTO}>
          <Contact className="size-4 text-muted-foreground" />
          Nombre
        </Label>
        <Input
          id="nombre"
          name="nombre"
          required
          autoFocus
          defaultValue={props.modo === "editar" ? props.cliente.nombre : undefined}
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
          Celular
        </Label>
        <Input
          id="celular"
          name="celular"
          defaultValue={props.modo === "editar" ? (props.cliente.celular ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("celular")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="direccion" className={LABEL_COMPACTO}>
          <MapPin className="size-4 text-muted-foreground" />
          Dirección
        </Label>
        <Input
          id="direccion"
          name="direccion"
          defaultValue={props.modo === "editar" ? (props.cliente.direccion ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("direccion")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tipo" className={LABEL_COMPACTO}>
          <Tags className="size-4 text-muted-foreground" />
          Tipo
        </Label>
        <Select name="tipo" value={tipo} onValueChange={(valor) => setTipo(valor as TipoCliente)}>
          <SelectTrigger id="tipo" className="h-10 w-full">
            <SelectValue placeholder="Selecciona un tipo">{tipoSeleccionado?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TIPO_OPCIONES.map((opcion) => (
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

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
