"use client";

import { useRef, useState, useTransition } from "react";
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

const DEBOUNCE_MS = 300;
const LABEL_COMPACTO = "text-sm text-muted-foreground";

const TIPOS: { value: string; label: string }[] = [
  { value: "MAYORISTA", label: "Mayorista" },
  { value: "MINORISTA", label: "Minorista" },
  { value: "EVENTUAL", label: "Eventual" },
];

// Sentinela para "sin filtro" — mismo motivo que TIPO_TODOS/LOTE_TODOS en
// MortalidadFiltros: Base UI necesita un value real por ítem, no puede
// registrarse uno con value vacío.
const TIPO_TODOS = "__TODOS__";

// Filtros dirigidos por URL (?busqueda=...&tipo=...) — mismo marco
// colapsable ("Filtros", ListFilter/ChevronDown) que MortalidadFiltros/
// RecoleccionFiltros (corrección real pedida por el Product Owner: la
// primera versión de este componente, S8-10, mostraba el <Input> siempre
// visible sin el marco ni un filtro de tipo — se revirtió a este mismo
// patrón para que /clientes se vea consistente con el resto de tablas de
// gestión con filtros del proyecto). Cambiar cualquier filtro borra `page`
// de la URL, igual que Mortalidad. A diferencia de los <Select>/<input
// type="date"> de Mortalidad (que no disparan navegación por cada tecla),
// el <Input> de búsqueda sí lo haría sin debounce — 300ms guardados en un
// ref, sin useEffect.
export function ClienteFiltros({
  busqueda,
  tipo,
}: {
  busqueda?: string;
  tipo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // Siempre colapsado al entrar, sin importar si ya hay filtros activos en
  // la URL — pedido explícito del Product Owner: cada módulo debe verse
  // "limpio" de entrada, sin el panel de filtros ya desplegado.
  const [abierto, setAbierto] = useState(false);
  const [busquedaValue, setBusquedaValue] = useState(busqueda ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function actualizarFiltro(clave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(params.size > 0 ? `/clientes?${params.toString()}` : "/clientes");
    });
  }

  function actualizarBusqueda(nuevoValor: string) {
    setBusquedaValue(nuevoValor);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      actualizarFiltro("busqueda", nuevoValor.trim() || null);
    }, DEBOUNCE_MS);
  }

  const tipoSeleccionado = TIPOS.find((opcion) => opcion.value === tipo);
  const hayFiltrosActivos = Boolean(busqueda || tipo);

  function limpiarFiltros() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setBusquedaValue("");
    startTransition(() => {
      router.replace("/clientes");
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
        // RecoleccionFiltros/BitacoraFiltros/VentaFiltros: grid-cols-1 en
        // mobile (sin tocar), auto-fit a partir de sm (las columnas crecen
        // para llenar el cuadro y se achican hasta un mínimo legible antes
        // de envolver a una nueva fila).
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] sm:items-end">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-busqueda" className={LABEL_COMPACTO}>
              Buscar
            </Label>
            <Input
              id="filtro-busqueda"
              value={busquedaValue}
              onChange={(evento) => actualizarBusqueda(evento.target.value)}
              placeholder="Nombre o celular..."
              className="h-10 w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-tipo" className={LABEL_COMPACTO}>
              Tipo
            </Label>
            <Select
              value={tipo ?? TIPO_TODOS}
              onValueChange={(valor) => actualizarFiltro("tipo", valor === TIPO_TODOS ? null : valor)}
            >
              <SelectTrigger id="filtro-tipo" className="h-10 w-full">
                <SelectValue placeholder="Todos">{tipo ? tipoSeleccionado?.label : "Todos"}</SelectValue>
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
        </div>
      ) : null}
    </div>
  );
}
