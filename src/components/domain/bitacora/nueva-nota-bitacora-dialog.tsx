"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, NotebookPen, Plus } from "lucide-react";

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
import { encolar } from "@/lib/offline/cola";
import { crearNotaBitacora } from "@/server/actions/bitacora";
import type { ActionResult } from "@/server/auth/with-auth";

type BitacoraPayload = {
  id: string;
  categoria: string;
  contenido: string;
  creadoEnCliente: Date;
};

type Estado = ActionResult<{ id: string }> | undefined;

const CATEGORIAS: { value: string; label: string }[] = [
  { value: "ALIMENTACION", label: "Alimentación" },
  { value: "VACUNACION", label: "Vacunación" },
  { value: "OBSERVACION", label: "Observación" },
];

// Mismo <Dialog> compacto que el resto del proyecto (Usuarios, Galpones,
// Lotes) — a pedido del Product Owner, reemplaza el <Sheet side="bottom">
// probado primero: se veía mal en escritorio, y la prioridad es un solo
// patrón que se vea bien en ambos tamaños.
const LABEL_COMPACTO = "text-sm text-muted-foreground";

export function NuevaNotaBitacoraDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="md">
            <Plus data-icon="inline-start" />
            Nueva nota
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <NotebookPen className="size-4 text-primary" />
            Nueva nota
          </DialogTitle>
          <DialogDescription>
            Nota general de la granja.
          </DialogDescription>
        </DialogHeader>

        {open ? <NuevaNotaBitacoraForm onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NuevaNotaBitacoraForm({ onExito }: { onExito: () => void }) {
  const router = useRouter();
  // Controlado por el mismo motivo que los <Select> de Mortalidad/Lotes
  // (Bug 2 de Sprint 3): sin esto, Base UI puede caer en un fallback que
  // muestra el value crudo en vez de la etiqueta legible.
  const [categoria, setCategoria] = useState<string | null>(null);
  const [contenido, setContenido] = useState("");
  // Generado una sola vez por apertura del diálogo — mismo fix que el
  // bug real de Recolección (S5-13): un doble clic reusa el mismo id, así
  // que el segundo envío colisiona con P2002 en vez de crear una nota
  // duplicada.
  const [id] = useState(() => crypto.randomUUID());

  // Payload como objeto plano, no FormData (Sprint 14) — mismo motivo que
  // registrar-recoleccion-dialog.tsx: la cola offline necesita persistir
  // el payload en IndexedDB.
  const [state, formAction, pending] = useActionState<Estado, BitacoraPayload>(
    async (_prev, payload) => {
      let resultado: Estado;
      try {
        resultado = await crearNotaBitacora(payload);
      } catch {
        // Sin red, la llamada a la Server Action ni siquiera llega al
        // servidor — esto SÍ es la señal real de "estoy offline" (a
        // diferencia de un {ok:false} de negocio, que withAuth ya
        // devolvió sin lanzar). Se encola en vez de solo avisar (H3,
        // spec.md Sprint 14).
        await encolar("BITACORA", payload);
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
        toastManager.add({ type: "success", title: "Nota guardada" });
        onExito();
      }
      return resultado;
    },
    undefined,
  );

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  const categoriaSeleccionada = CATEGORIAS.find((opcion) => opcion.value === categoria);
  const puedeGuardar = Boolean(categoria) && contenido.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!categoria || !puedeGuardar || pending) return;
        // startTransition: useActionState() exige que su dispatch se
        // invoque dentro de una transición — mismo motivo (y mismo bug
        // real evitado, S5-13) que registrar-recoleccion-dialog.tsx.
        startTransition(() => {
          formAction({ id, categoria, contenido, creadoEnCliente: new Date() });
        });
      }}
    >
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="categoria" className={LABEL_COMPACTO}>
          Categoría
        </Label>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger id="categoria" className="h-10 w-full">
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
        <Label htmlFor="contenido" className={LABEL_COMPACTO}>
          Nota
        </Label>
        <Textarea
          id="contenido"
          rows={4}
          required
          autoFocus
          value={contenido}
          onChange={(evento) => setContenido(evento.target.value)}
          className="text-sm"
        />
        {erroresDe("contenido")?.map((error) => (
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
