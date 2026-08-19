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
  { value: "ALIMENTACION", label: "Alimentación" },
  { value: "VACUNACION", label: "Vacunación" },
  { value: "OBSERVACION", label: "Observación" },
];

const LABEL_COMPACTO = "text-sm text-muted-foreground";

// Sentinela para "todas las categorías" en el <Select> — Base UI necesita
// un value real por ítem, no puede registrarse un ítem con value vacío
// para representar "sin filtro".
const CATEGORIA_TODAS = "__TODAS__";

// Mismo criterio que el <input type="date"> de LoteFormDialog: tope de
// "hoy" calculado en América/Lima (D5), no en la zona horaria del
// navegador — evita que el reloj local corra distinto del real.
function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtros dirigidos por URL (?categoria=...&desde=...&hasta=...), mismo
// criterio "server-side, vía URL" que <DataTablePagination> — así el
// filtro persiste al compartir el link o recargar la página, y
// BitacoraMuro recibe una tanda inicial ya filtrada desde el Server
// Component (app/(app)/bitacora/page.tsx). Sin `key` acá (ver page.tsx):
// este componente es el que dispara la navegación, así que remontarse a
// partir de su propio cambio de URL es un bug, no una sincronización.
export function BitacoraFiltros({
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
  // Siempre colapsado al entrar, sin importar si ya hay filtros activos en
  // la URL — pedido explícito del Product Owner: cada módulo debe verse
  // "limpio" de entrada, sin el panel de filtros ya desplegado.
  const [abierto, setAbierto] = useState(false);
  // Controlados (no defaultValue): min/max de un campo dependen del valor
  // actual del otro, así que hace falta leerlos en cada render, no solo
  // en el DOM al momento del onChange.
  const [desdeValue, setDesdeValue] = useState(desde ?? "");
  const [hastaValue, setHastaValue] = useState(hasta ?? "");

  // replace (no push): no tiene sentido apilar una entrada de historial
  // por cada tecla de un filtro — "atrás" debería volver a la pantalla
  // anterior, no deshacer el filtro paso a paso. startTransition: patrón
  // recomendado por Next.js para navegación disparada por un filtro —
  // dos cambios seguidos (por ejemplo, tipear una fecha con el teclado en
  // vez del selector) hacen que React reemplace la transición pendiente
  // en vez de dejar ambas compitiendo (causa real del bug de los tres
  // "Filtros" superpuestos, junto con el `key` que ya se sacó).
  function actualizarFiltro(clave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    startTransition(() => {
      router.replace(params.size > 0 ? `/bitacora?${params.toString()}` : "/bitacora");
    });
  }

  const hoy = hoyEnLimaComoStringDeInput();
  const hayFiltrosActivos = Boolean(categoria || desde || hasta);

  function limpiarFiltros() {
    setDesdeValue("");
    setHastaValue("");
    startTransition(() => {
      router.replace("/bitacora");
    });
  }

  return (
    // Marco chico (borde + fondo sutil), no un <Card> de sección grande.
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex w-full items-center justify-between gap-1.5">
        {/* <button>, no <p>: el rótulo "Filtros" es el control que
        colapsa/despliega el bloque — el ChevronDown que gira 180° comunica
        que hay más para desplegar, en vez de un texto suelto que parecía
        solo una etiqueta. */}
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
        // RecoleccionFiltros/ClienteFiltros/VentaFiltros: grid-cols-1 en
        // mobile (sin tocar), auto-fit a partir de sm (las columnas crecen
        // para llenar el cuadro y se achican hasta un mínimo legible antes
        // de envolver a una nueva fila).
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
                <SelectValue placeholder="Todas las categorías">
                  {categoria
                    ? CATEGORIAS.find((opcion) => opcion.value === categoria)?.label
                    : "Todas las categorías"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CATEGORIA_TODAS}>Todas las categorías</SelectItem>
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
            {/* max: no puede ser posterior a "Hasta" (si ya está elegida) ni
            a hoy — el propio calendario del navegador deja de ofrecer esas
            fechas, no hace falta un mensaje de error después. */}
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
            {/* min: no puede ser anterior a "Desde" (si ya está elegida).
            max: nunca futura — no tiene sentido filtrar notas que todavía
            no existen. */}
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
