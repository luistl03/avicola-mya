"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

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
import { eliminarNotaBitacora } from "@/server/actions/bitacora";

type Props = { notaId: string; onExito: () => void };

// Confirmación con Dialog, no window.confirm (mismo motivo que
// FinalizarLoteDialog, Sprint 3: los diálogos nativos bloquean la
// pestaña). Soft-delete (campo `eliminada`, nunca DELETE físico) — la
// nota deja de listarse pero el registro y su AuditLog sobreviven.
export function EliminarNotaBitacoraDialog({ notaId, onExito }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      const resultado = await eliminarNotaBitacora({ notaId });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo eliminar la nota",
          description: resultado.error,
        });
        return;
      }
      setOpen(false);
      router.refresh();
      toastManager.add({ type: "success", title: "Nota eliminada" });
      onExito();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Eliminar nota">
            <Trash2 />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trash2 className="size-4 text-destructive" />
            Eliminar nota
          </DialogTitle>
          <DialogDescription>
            La nota deja de listarse en el muro. El registro no se borra
            físicamente.
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
            {pending ? "Eliminando..." : "Sí, eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
