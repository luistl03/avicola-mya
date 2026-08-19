"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Egg, NotebookPen, RotateCw, Skull, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { formatearFechaHora } from "@/lib/fecha";
import { descartar, listarPendientes, marcarPendiente } from "@/lib/offline/cola";
import type { EstadoColaOffline, ItemColaOffline, TipoColaOffline } from "@/lib/offline/db";
import { sincronizarCola } from "@/lib/offline/sincronizador";

const TIPO_ICONO: Record<TipoColaOffline, typeof Skull> = {
  MORTALIDAD: Skull,
  BITACORA: NotebookPen,
  RECOLECCION: Egg,
};

const TIPO_LABEL: Record<TipoColaOffline, string> = {
  MORTALIDAD: "Mortalidad",
  BITACORA: "Bitácora",
  RECOLECCION: "Recolección",
};

const ESTADO_LABEL: Record<EstadoColaOffline, string> = {
  PENDIENTE: "Pendiente",
  ENVIANDO: "Enviando…",
  OK: "Sincronizado",
  ERROR: "Error",
};

// Ver globals.css, .badge-cola-* (Sprint 14) para el porqué de cada tono
// — misma regla que el resto del proyecto: ninguna receta de color suelta
// en un .tsx (memory/convenciones.md).
const ESTADO_CLASE: Record<EstadoColaOffline, string> = {
  PENDIENTE: "badge-cola-pendiente",
  ENVIANDO: "badge-cola-enviando",
  OK: "badge-cola-ok",
  ERROR: "badge-cola-error",
};

// Cualquier usuario autenticado en este dispositivo ve la misma cola —
// es local a IndexedDB, no a un rol ni a quien capturó cada ítem
// (decisión de negocio 5, spec.md). listarPendientes() ya excluye OK
// (Contrato: un ítem sincronizado con éxito no tiene nada más que
// mostrar acá) — reactivo vía useLiveQuery, sin useEffect + setState
// manual (mismo criterio anti-patrón que ya documentó Sprint 4 para
// BitacoraMuro).
export function PantallaPendientes() {
  const items = useLiveQuery(() => listarPendientes(), [], []);

  if (items === undefined) return null;

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        No hay nada pendiente de sincronizar en este dispositivo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <FilaPendiente key={item.id} item={item} />
      ))}
    </div>
  );
}

function FilaPendiente({ item }: { item: ItemColaOffline }) {
  const Icono = TIPO_ICONO[item.tipo];
  const [reintentando, setReintentando] = useState(false);

  // "Reintentar" fuerza un intento ahora, sin esperar al evento "online"
  // automático (H6, spec.md). Un ítem en ERROR primero vuelve a
  // PENDIENTE — sincronizarCola() solo procesa PENDIENTE, nunca reintenta
  // un ERROR solo (decisión de negocio 6: un rechazo de negocio no se
  // reintenta automático, requiere esta acción explícita del usuario).
  // Sincroniza toda la cola pendiente, no solo este ítem — acotar a un
  // solo ítem agregaría una función paralela a sincronizarCola() para un
  // beneficio marginal (ver nota en plan.md, S14-14).
  async function reintentar() {
    setReintentando(true);
    try {
      if (item.estado === "ERROR") {
        await marcarPendiente(item.id);
      }
      await sincronizarCola();
    } finally {
      setReintentando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <Icono className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{TIPO_LABEL[item.tipo]}</span>
            <Badge variant="outline" className={ESTADO_CLASE[item.estado]}>
              {ESTADO_LABEL[item.estado]}
            </Badge>
          </div>
          <span className="text-sm text-muted-foreground">
            Capturado {formatearFechaHora(item.creadoEnCliente)}
          </span>
          {item.estado === "ERROR" && item.ultimoError ? (
            <p role="alert" className="text-sm text-destructive">
              {item.ultimoError}
            </p>
          ) : null}
        </div>
      </div>

      {item.estado === "ENVIANDO" ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={reintentando} onClick={reintentar}>
            <RotateCw data-icon="inline-start" />
            {reintentando ? "Reintentando..." : "Reintentar"}
          </Button>
          {item.estado === "ERROR" ? <DescartarPendienteDialog id={item.id} /> : null}
        </div>
      )}
    </div>
  );
}

// Mismo patrón que EliminarNotaBitacoraDialog (Sprint 4): <Dialog> +
// botón destructive, nunca window.confirm() (bloquea la pestaña). Sin
// Server Action detrás — descartar() solo borra la fila local de
// IndexedDB, useLiveQuery reacciona solo, no hace falta router.refresh().
function DescartarPendienteDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirmar() {
    setPending(true);
    await descartar(id);
    setPending(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Trash2 data-icon="inline-start" />
            Descartar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trash2 className="size-4 text-destructive" />
            Descartar pendiente
          </DialogTitle>
          <DialogDescription>
            Este registro nunca se va a enviar al servidor — se pierde el
            dato capturado sin señal. Esta acción no se puede deshacer.
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
            {pending ? "Descartando..." : "Sí, descartar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
