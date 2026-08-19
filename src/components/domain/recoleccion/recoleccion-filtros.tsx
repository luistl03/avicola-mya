"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ListFilter, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type LoteOpcion = { id: string; codigo: string };

const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Mismo sentinela que MortalidadFiltros/BitacoraFiltros.
const LOTE_TODOS = "__TODOS__";

function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtros dirigidos por URL (?loteId=...&desde=...&hasta=...) — mismo
// patrón que MortalidadFiltros/BitacoraFiltros, sin `tipo` (Recolección no
// tiene una clasificación categórica como Mortalidad/Bitácora). Borra
// `page` de la URL en cada cambio de filtro, mismo motivo que Mortalidad.
export function RecoleccionFiltros({
  loteId,
  desde,
  hasta,
  lotes,
}: {
  loteId?: string;
  desde?: string;
  hasta?: string;
  lotes: LoteOpcion[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // Siempre colapsado al entrar, sin importar si ya hay filtros activos en
  // la URL — pedido explícito del Product Owner: cada módulo debe verse
  // "limpio" de entrada, sin el panel de filtros ya desplegado.
  const [abierto, setAbierto] = useState(false);
  const [desdeValue, setDesdeValue] = useState(desde ?? "");
  const [hastaValue, setHastaValue] = useState(hasta ?? "");

  function actualizarFiltro(clave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(params.size > 0 ? `/recoleccion?${params.toString()}` : "/recoleccion");
    });
  }

  const hoy = hoyEnLimaComoStringDeInput();
  const loteSeleccionado = lotes.find((lote) => lote.id === loteId);
  const hayFiltrosActivos = Boolean(loteId || desde || hasta);

  function limpiarFiltros() {
    setDesdeValue("");
    setHastaValue("");
    startTransition(() => {
      router.replace("/recoleccion");
    });
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex w-full items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          className="flex items-center gap-1.5 rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ListFilter className="size-4 text-muted-foreground" />
          Filtros
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              abierto && "rotate-180",
            )}
          />
        </button>
        {hayFiltrosActivos ? (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {abierto ? (
        // Mismo patrón de grid responsive que MortalidadFiltros/
        // ClienteFiltros/BitacoraFiltros/VentaFiltros: grid-cols-1 en
        // mobile, auto-fit a partir de sm (las columnas crecen para llenar
        // el cuadro y se achican hasta un mínimo legible antes de envolver).
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-lote" className={LABEL_COMPACTO}>
              Lote
            </Label>
            <Select
              value={loteId ?? LOTE_TODOS}
              onValueChange={(valor) => actualizarFiltro("loteId", valor === LOTE_TODOS ? null : valor)}
            >
              <SelectTrigger id="filtro-lote" className="h-10 w-full">
                <SelectValue placeholder="Todos los lotes">
                  {loteId ? loteSeleccionado?.codigo : "Todos los lotes"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LOTE_TODOS}>Todos los lotes</SelectItem>
                {lotes.map((lote) => (
                  <SelectItem key={lote.id} value={lote.id}>
                    {lote.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-desde" className={LABEL_COMPACTO}>
              Desde
            </Label>
            <Input
              id="filtro-desde"
              type="date"
              value={desdeValue}
              max={hastaValue || hoy}
              onChange={(evento) => {
                setDesdeValue(evento.target.value);
                actualizarFiltro("desde", evento.target.value || null);
              }}
              className="h-10 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-hasta" className={LABEL_COMPACTO}>
              Hasta
            </Label>
            <Input
              id="filtro-hasta"
              type="date"
              value={hastaValue}
              min={desdeValue || undefined}
              max={hoy}
              onChange={(evento) => {
                setHastaValue(evento.target.value);
                actualizarFiltro("hasta", evento.target.value || null);
              }}
              className="h-10 text-sm"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
