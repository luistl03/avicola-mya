"use client";

import { startTransition, useActionState, useState } from "react";
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
import { encolar } from "@/lib/offline/cola";
import { registrarMortalidad } from "@/server/actions/mortalidad";
import type { ActionResult } from "@/server/auth/with-auth";

type LoteOpcion = { id: string; codigo: string; avesVivas: number };

type MortalidadPayload = {
  id: string;
  loteId: string;
  tipo: string;
  cantidad: number;
  creadoEnCliente: Date;
};

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
  const [cantidadInput, setCantidadInput] = useState("");
  // Generado una sola vez por apertura del diálogo — mismo fix que el bug
  // real de Recolección (S5-13), acá con más motivo: un doble clic sin
  // esto no solo duplicaba el registro, decrementaba avesVivas dos veces
  // (hallazgo real de la auditoría post-Sprint 5).
  const [id] = useState(() => crypto.randomUUID());

  // Payload como objeto plano, no FormData (Sprint 14) — mismo motivo que
  // registrar-recoleccion-dialog.tsx: la cola offline necesita persistir
  // el payload en IndexedDB, y FormData no es serializable ahí sin
  // conversión manual. Ver plan.md, "Interceptor en los 3 dialogs".
  const [state, formAction, pending] = useActionState<Estado, MortalidadPayload>(
    async (_prev, payload) => {
      let resultado: Estado;
      try {
        resultado = await registrarMortalidad(payload);
      } catch {
        // Sin red, el fetch de la Server Action rechaza antes de llegar al
        // servidor — esto SÍ es la señal real de "estoy offline" (a
        // diferencia de un {ok:false} de negocio, que withAuth ya
        // devolvió sin lanzar). Se encola en vez de solo avisar (H3,
        // spec.md Sprint 14) — mismo cierre de diálogo que un guardado
        // online exitoso, no se le pide al Operario que reintente a mano.
        await encolar("MORTALIDAD", payload);
        toastManager.add({
          type: "success",
          title: "Guardado sin conexión",
          description: "Se enviará solo cuando recuperes señal.",
        });
        onExito();
        return { ok: true, data: { id: payload.id } };
      }
      if (resultado.ok) {
        router.refresh();
        toastManager.add({
          type: "success",
          title: "Mortalidad registrada",
          description: `${payload.cantidad} aves`,
        });
        onExito();
      }
      return resultado;
    },
    undefined,
  );

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const loteSeleccionado = lotesActivos.find((lote) => lote.id === loteId);
  const tipoSeleccionado = TIPOS.find((opcion) => opcion.value === tipo);

  const cantidad = Number(cantidadInput) || 0;
  const puedeGuardar = Boolean(loteId) && Boolean(tipo) && cantidad > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!loteId || !tipo || !puedeGuardar || pending) return;
        // startTransition: useActionState() exige que su dispatch se
        // invoque dentro de una transición — mismo motivo (y mismo bug
        // real evitado, S5-13) que registrar-recoleccion-dialog.tsx.
        startTransition(() => {
          formAction({ id, loteId, tipo, cantidad, creadoEnCliente: new Date() });
        });
      }}
    >
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="loteId" className={LABEL_COMPACTO}>
          Lote
        </Label>
        <Select value={loteId} onValueChange={setLoteId}>
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
        <Select value={tipo} onValueChange={setTipo}>
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
          type="number"
          inputMode="numeric"
          min={1}
          required
          autoFocus
          value={cantidadInput}
          onChange={(evento) => setCantidadInput(evento.target.value)}
          className={INPUT_COMPACTO}
        />
        {erroresDe("cantidad")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending || !puedeGuardar}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
