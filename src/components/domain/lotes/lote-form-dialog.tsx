"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bird, Calendar, Check, Clock, Hash, Plus, Warehouse } from "lucide-react";

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
import { crearLote } from "@/server/actions/lote";
import type { ActionResult } from "@/server/auth/with-auth";

type GalponOpcion = { id: string; nombre: string };

type Estado = ActionResult<{ id: string }> | undefined;

// Mismo criterio compacto que GalponFormDialog/UsuarioFormDialog: dialog
// de gestión de escritorio del Gerente, no pantalla operativa de campo.
const INPUT_COMPACTO = "h-10 text-sm";
const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Tope del <input type="date"> — evita ni siquiera poder ELEGIR una
// fecha futura desde el date picker del navegador. Es una comodidad de
// UX, no la validación real: server/lib/zod/lote.ts (crearLoteSchema)
// rechaza igual una fecha futura del lado del servidor, calculada contra
// América/Lima (D5), sin confiar en el reloj de este navegador — este
// `max` solo evita el viaje de ida y vuelta de un error para el caso
// común.
function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function LoteFormDialog({ galponesActivos }: { galponesActivos: GalponOpcion[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Nuevo lote
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Bird className="size-4 text-primary" />
            Nuevo lote
          </DialogTitle>
          <DialogDescription>
            El lote queda ACTIVO de inmediato, alojado en el galpón que
            elijas.
          </DialogDescription>
        </DialogHeader>

        {/* El formulario vive en un componente aparte que solo existe
        mientras `open` es true: React lo desmonta al cerrar y lo vuelve a
        montar de cero al abrir. Es lo que le da un useActionState() fresco
        cada vez — si el `state` (con un error de una tanda anterior)
        viviera acá arriba, en LoteFormDialog, sobreviviría a un cierre/
        apertura del modal y el error viejo reaparecería sin que el
        usuario haya tocado nada (bug real encontrado y corregido en esta
        sesión, presente en los cuatro dialogs de formulario del
        proyecto). */}
        {open ? (
          <LoteForm galponesActivos={galponesActivos} onExito={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LoteForm({
  galponesActivos,
  onExito,
}: {
  galponesActivos: GalponOpcion[];
  onExito: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // El <Select> de galpón se controla a mano (value + onValueChange) en
  // vez de dejarlo uncontrolled: Base UI resuelve la etiqueta visible
  // buscando el id seleccionado en una lista interna de ítems que arma
  // sola, y si esa lista no tiene el ítem registrado en ese momento cae
  // en un fallback que muestra el id crudo en vez del nombre (bug real
  // encontrado en esta sesión — "aparece ese código largo" en vez de
  // "Galpón 2"). Controlándolo acá, la etiqueta siempre sale de
  // galponesActivos, que ya tenemos, sin depender de esa resolución
  // interna.
  const [galponId, setGalponId] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await crearLote(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Lote creado",
        description: `${formData.get("codigo")}`,
      });
      onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const galponSeleccionado = galponesActivos.find((galpon) => galpon.id === galponId);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="codigo" className={LABEL_COMPACTO}>
          <Hash className="size-4 text-muted-foreground" />
          Código
        </Label>
        <Input id="codigo" name="codigo" required autoFocus className={INPUT_COMPACTO} />
        {erroresDe("codigo")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fechaIngreso" className={LABEL_COMPACTO}>
          <Calendar className="size-4 text-muted-foreground" />
          Fecha de ingreso
        </Label>
        <Input
          id="fechaIngreso"
          name="fechaIngreso"
          type="date"
          required
          max={hoyEnLimaComoStringDeInput()}
          className={INPUT_COMPACTO}
        />
        {erroresDe("fechaIngreso")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="avesIniciales" className={LABEL_COMPACTO}>
          <Bird className="size-4 text-muted-foreground" />
          Aves iniciales
        </Label>
        <Input
          id="avesIniciales"
          name="avesIniciales"
          type="number"
          min={1}
          required
          className={INPUT_COMPACTO}
        />
        {erroresDe("avesIniciales")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="edadInicialSemanas" className={LABEL_COMPACTO}>
          <Clock className="size-4 text-muted-foreground" />
          Edad inicial (semanas)
        </Label>
        <Input
          id="edadInicialSemanas"
          name="edadInicialSemanas"
          type="number"
          min={0}
          required
          defaultValue={0}
          className={INPUT_COMPACTO}
        />
        {erroresDe("edadInicialSemanas")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="galponId" className={LABEL_COMPACTO}>
          <Warehouse className="size-4 text-muted-foreground" />
          Galpón
        </Label>
        <Select name="galponId" value={galponId} onValueChange={setGalponId}>
          <SelectTrigger id="galponId" className="h-10 w-full">
            <SelectValue placeholder="Seleccioná un galpón">
              {galponSeleccionado?.nombre}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {galponesActivos.map((galpon) => (
              <SelectItem key={galpon.id} value={galpon.id}>
                {galpon.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {erroresDe("galponId")?.map((error) => (
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
