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

const CATEGORIAS: { value: string; label: string }[] = [
  { value: "ALIMENTOS", label: "Alimentos" },
  { value: "INSUMOS_VACUNAS", label: "Insumos y vacunas" },
  { value: "SERVICIOS", label: "Servicios" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "VARIOS", label: "Varios" },
];

const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Sentinela para "sin filtro" — mismo motivo que TIPO_TODOS en
// MortalidadFiltros: Base UI necesita un value real por ítem.
const CATEGORIA_TODAS = "__TODAS__";

function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtros dirigidos por URL (?categoria=...&desde=...&hasta=...) — mismo
// patrón exacto que MortalidadFiltros/VentaFiltros. Cambiar cualquier
// filtro también borra `page` de la URL.
export function EgresoFiltros({
  categoria,
  desde,
  hasta,
}: {
  categoria?: string;
  desde?: string;
  hasta?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
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
      router.replace(params.size > 0 ? `/egresos?${params.toString()}` : "/egresos");
    });
  }

  const hoy = hoyEnLimaComoStringDeInput();
  const hayFiltrosActivos = Boolean(categoria || desde || hasta);

  function limpiarFiltros() {
    setDesdeValue("");
    setHastaValue("");
    startTransition(() => {
      router.replace("/egresos");
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
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-categoria" className={LABEL_COMPACTO}>
              Categoría
            </Label>
            <Select
              value={categoria ?? CATEGORIA_TODAS}
              onValueChange={(valor) =>
                actualizarFiltro("categoria", valor === CATEGORIA_TODAS ? null : valor)
              }
            >
              <SelectTrigger id="filtro-categoria" className="h-10 w-full">
                <SelectValue placeholder="Todas">
                  {categoria ? CATEGORIAS.find((opcion) => opcion.value === categoria)?.label : "Todas"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CATEGORIA_TODAS}>Todas</SelectItem>
                {CATEGORIAS.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
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
