"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleOff } from "lucide-react";

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
import { toastManager } from "@/components/ui/toast";
import { finalizarLoteAction } from "@/server/actions/lote";

type Props = { lote: { id: string; codigo: string } };

// Confirmación con Dialog, no window.confirm/window.alert: los diálogos
// nativos del navegador bloquean toda la pestaña (ver memory/estado-
// proyecto.md, "Herramientas y configuración del entorno" — alertas
// nativas ya causaron problemas verificando con la extensión Claude in
// Chrome). Finalizar es una acción de una sola vía, sin campos que
// completar — por eso useTransition + llamada directa a la action con un
// objeto, mismo patrón que el botón Activar/Desactivar de
// UsuariosTabla/GalponesTabla, no un <form> con useActionState.
export function FinalizarLoteDialog({ lote }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      const resultado = await finalizarLoteAction({ loteId: lote.id });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo finalizar el lote",
          description: resultado.error,
        });
        return;
      }
      setOpen(false);
      router.refresh();
      toastManager.add({
        type: "success",
        title: "Lote finalizado",
        description: `${lote.codigo} pasó a INACTIVO.`,
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            <CircleOff data-icon="inline-start" />
            Finalizar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <CircleOff className="size-4 text-primary" />
            Finalizar {lote.codigo}
          </DialogTitle>
          <DialogDescription>
            El lote pasa a INACTIVO y se cierra su ubicación actual. Esta
            acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            size="md"
            disabled={pending}
            onClick={confirmar}
          >
            {pending ? "Finalizando..." : "Sí, finalizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
