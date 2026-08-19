"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ListFilter, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LABEL_COMPACTO = "text-sm text-muted-foreground";
const DEBOUNCE_MS = 300;

const METODO_TODOS = "__TODOS__";
const METODOS: { value: string; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "YAPE", label: "Yape" },
  { value: "PLIN", label: "Plin" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const TIPO_TODOS = "__TODOS__";
const TIPOS: { value: string; label: string }[] = [
  { value: "CONTADO", label: "Contado" },
  { value: "CREDITO", label: "Crédito" },
];

function hoyEnLimaComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Filtros dirigidos por URL (?busqueda=...&metodoPago=...&tipo=...&desde=...&hasta=...&fecha=todas)
// — mismo patrón que MortalidadFiltros/RecoleccionFiltros. `busqueda` es un
// único campo que matchea por nombre de cliente O por N° de comprobante a
// la vez (server/repositories/venta.ts, whereVentas) — antes eran dos
// campos separados (un selector de cliente vía autocomplete + un buscador
// de comprobante), unificados porque con 7 controles la fila de filtros no
// entraba en una sola línea sin romperse en pantallas comunes (hallazgo
// real del Product Owner). El "listado normal por hoy" que pide el Product
// Owner vive en la lógica de la página (bare /ventas sin ningún filtro =
// hoy) — este componente solo agrega el botón "Todo" (?fecha=todas) para
// escapar de ese default sin tener que adivinar una fecha vacía.
export function VentaFiltros({
  metodoPago,
  tipo,
  desde,
  hasta,
  busqueda,
}: {
  metodoPago?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  busqueda?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // Siempre colapsado al entrar, sin importar si ya hay filtros activos en
  // la URL — pedido explícito del Product Owner: /ventas debe verse
  // "limpio" de entrada, sin el panel de filtros ya desplegado.
  const [abierto, setAbierto] = useState(false);
  const [desdeValue, setDesdeValue] = useState(desde ?? "");
  const [hastaValue, setHastaValue] = useState(hasta ?? "");

  const [busquedaValue, setBusquedaValue] = useState(busqueda ?? "");
  const busquedaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function actualizarBusqueda(valor: string) {
    setBusquedaValue(valor);
    if (busquedaTimeoutRef.current) clearTimeout(busquedaTimeoutRef.current);
    busquedaTimeoutRef.current = setTimeout(() => {
      actualizarFiltros({ busqueda: valor.trim() || null });
    }, DEBOUNCE_MS);
  }

  const hoy = hoyEnLimaComoStringDeInput();

  function actualizarFiltros(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) {
        params.set(clave, valor);
      } else {
        params.delete(clave);
      }
    }
    params.delete("page");
    startTransition(() => {
      router.replace(params.size > 0 ? `/ventas?${params.toString()}` : "/ventas");
    });
  }

  // Escapa el default "hoy" de la página (bare /ventas) sin tener que
  // adivinar una fecha vacía — ver comentario arriba.
  const viendoTodasLasFechas = searchParams.get("fecha") === "todas";

  // OJO: NO se puede usar el prop `desde`/`hasta` acá — page.tsx los
  // rellena con "hoy" por defecto (para precargar el input de fecha) aun
  // cuando el usuario no tocó ningún filtro, lo que hacía que este botón
  // apareciera SIEMPRE (bug real reportado por el Product Owner). Se lee
  // directo de la URL real (searchParams) para saber si el desde/hasta
  // vino de un filtro explícito o es solo el default de la página.
  const hayFiltrosActivos = Boolean(
    metodoPago || tipo || busqueda || searchParams.get("desde") || searchParams.get("hasta") || viendoTodasLasFechas,
  );

  function limpiarFiltros() {
    if (busquedaTimeoutRef.current) clearTimeout(busquedaTimeoutRef.current);
    setDesdeValue("");
    setHastaValue("");
    setBusquedaValue("");
    startTransition(() => {
      router.replace("/ventas");
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
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", abierto && "rotate-180")} />
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
        // grid-cols-1 en mobile (cada campo en su propia fila, a ancho
        // completo — sin tocar, se ve bien) y a partir de sm,
        // grid-cols-[repeat(auto-fit,minmax(...))]: mismo patrón responsive
        // en los 5 componentes de filtros del proyecto (Mortalidad/
        // Recolección/Clientes/Bitácora). auto-fit reparte el ancho
        // disponible del cuadro en columnas iguales que CRECEN para llenar
        // el espacio sobrante (ej. sidebar colapsado) y se ACHICAN hasta el
        // mínimo legible antes de envolver a una nueva fila — a diferencia
        // de flex-wrap con anchos fijos, que ni crecía para ocupar el
        // espacio libre ni encogía de forma pareja (hallazgo real del
        // Product Owner: con el sidebar colapsado sobraba una franja vacía
        // enorme a la derecha del cuadro).
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] sm:items-end">
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
                actualizarFiltros({ desde: evento.target.value || null, fecha: null });
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
                actualizarFiltros({ hasta: evento.target.value || null, fecha: null });
              }}
              className="h-10 text-sm"
            />
          </div>

          {!viendoTodasLasFechas ? (
            // Mismo border/bg/alto que Input/SelectTrigger (border-input,
            // rounded-lg, h-10) — sin esto pesa visualmente menos que el
            // resto de la fila aunque mida lo mismo en píxeles (hallazgo
            // real reportado por el Product Owner).
            <button
              type="button"
              onClick={() => {
                setDesdeValue("");
                setHastaValue("");
                actualizarFiltros({ desde: null, hasta: null, fecha: "todas" });
              }}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-transparent px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <CalendarDays className="size-4" />
              Todo
            </button>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-metodoPago" className={LABEL_COMPACTO}>
              Método de pago
            </Label>
            <Select
              value={metodoPago ?? METODO_TODOS}
              onValueChange={(valor) => actualizarFiltros({ metodoPago: valor === METODO_TODOS ? null : valor })}
            >
              <SelectTrigger id="filtro-metodoPago" className="h-10 w-full">
                <SelectValue placeholder="Todos">
                  {metodoPago ? METODOS.find((opcion) => opcion.value === metodoPago)?.label : "Todos"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={METODO_TODOS}>Todos</SelectItem>
                {METODOS.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-tipo" className={LABEL_COMPACTO}>
              Tipo
            </Label>
            <Select
              value={tipo ?? TIPO_TODOS}
              onValueChange={(valor) => actualizarFiltros({ tipo: valor === TIPO_TODOS ? null : valor })}
            >
              <SelectTrigger id="filtro-tipo" className="h-10 w-full">
                <SelectValue placeholder="Todas">
                  {tipo ? TIPOS.find((opcion) => opcion.value === tipo)?.label : "Todas"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TIPO_TODOS}>Todas</SelectItem>
                {TIPOS.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filtro-busqueda" className={LABEL_COMPACTO}>
              Cliente o N.° comprobante
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="filtro-busqueda"
                value={busquedaValue}
                onChange={(evento) => actualizarBusqueda(evento.target.value)}
                placeholder="Nombre o N.° comprobante..."
                className="h-10 w-full pl-9"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
