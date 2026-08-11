"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ListFilter } from "lucide-react";

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

const TIPOS: { value: string; label: string }[] = [
  { value: "MUERTE", label: "Muerte" },
  { value: "DESCARTE", label: "Descarte" },
];

const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Sentinelas para "sin filtro" en cada <Select> — mismo motivo que
// CATEGORIA_TODAS en BitacoraFiltros: Base UI necesita un value real por
// ítem, no puede registrarse uno con value vacío.
const TIPO_TODOS = "__TODOS__";
const LOTE_TODOS = "__TODOS__";

function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtros dirigidos por URL (?tipo=...&loteId=...&desde=...&hasta=...) —
// mismo patrón que BitacoraFiltros (Sprint 4), con `tipo`/`loteId` en vez
// de `categoria` y sin `key` en este componente por el mismo motivo (es
// el que dispara la navegación, remontarse a mitad de su propia
// transición dejaría el marco de filtros viejo visible). A diferencia de
// Bitácora (paginación por cursor), acá cambiar cualquier filtro también
// borra `page` de la URL — quedarse en "página 3" de un resultado
// filtrado que capaz solo tiene una página mostraría una tabla vacía.
export function MortalidadFiltros({
  tipo,
  loteId,
  desde,
  hasta,
  lotes,
}: {
  tipo?: string;
  loteId?: string;
  desde?: string;
  hasta?: string;
  lotes: LoteOpcion[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(Boolean(tipo || loteId || desde || hasta));
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
      router.replace(params.size > 0 ? `/mortalidad?${params.toString()}` : "/mortalidad");
    });
  }

  const hoy = hoyEnLimaComoStringDeInput();
  const loteSeleccionado = lotes.find((lote) => lote.id === loteId);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-1.5 rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-1.5">
          <ListFilter className="size-4 text-muted-foreground" />
          Filtros
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            abierto && "rotate-180",
          )}
        />
      </button>

      {abierto ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-tipo" className={LABEL_COMPACTO}>
              Tipo
            </Label>
            <Select
              value={tipo ?? TIPO_TODOS}
              onValueChange={(valor) => actualizarFiltro("tipo", valor === TIPO_TODOS ? null : valor)}
            >
              <SelectTrigger id="filtro-tipo" className="h-10 w-full sm:w-44">
                <SelectValue placeholder="Todos">
                  {tipo ? TIPOS.find((opcion) => opcion.value === tipo)?.label : "Todos"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIPO_TODOS}>Todos</SelectItem>
                {TIPOS.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-lote" className={LABEL_COMPACTO}>
              Lote
            </Label>
            <Select
              value={loteId ?? LOTE_TODOS}
              onValueChange={(valor) => actualizarFiltro("loteId", valor === LOTE_TODOS ? null : valor)}
            >
              <SelectTrigger id="filtro-lote" className="h-10 w-full sm:w-48">
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
