"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ListFilter, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buscarClientesAutocompleteAction } from "@/server/actions/cliente";

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

type ClienteOpcion = { id: string; nombre: string };

// Filtros dirigidos por URL (?clienteId=...&metodoPago=...&tipo=...&desde=...&hasta=...&fecha=todas)
// — mismo patrón que MortalidadFiltros/RecoleccionFiltros. `clienteInicial`
// llega resuelto desde el Server Component (app/(app)/ventas/page.tsx) para
// poder mostrar el nombre del cliente ya filtrado sin una query aparte acá.
// El "listado normal por hoy" que pide el Product Owner vive en la lógica
// de la página (bare /ventas sin ningún filtro = hoy) — este componente
// solo agrega el botón "Ver todas las fechas" (?fecha=todas) para escapar
// de ese default sin tener que adivinar una fecha vacía.
export function VentaFiltros({
  clienteId,
  clienteInicial,
  metodoPago,
  tipo,
  desde,
  hasta,
}: {
  clienteId?: string;
  clienteInicial: ClienteOpcion | null;
  metodoPago?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(
    Boolean(clienteId || metodoPago || tipo || desde || hasta || searchParams.get("fecha")),
  );
  const [desdeValue, setDesdeValue] = useState(desde ?? "");
  const [hastaValue, setHastaValue] = useState(hasta ?? "");

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteOpcion[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function actualizarBusquedaCliente(valor: string) {
    setBusquedaCliente(valor);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const texto = valor.trim();
    if (!texto) {
      setSugerencias([]);
      setBuscandoCliente(false);
      return;
    }
    setBuscandoCliente(true);
    timeoutRef.current = setTimeout(async () => {
      const resultado = await buscarClientesAutocompleteAction(texto);
      setSugerencias(resultado.ok ? resultado.data : []);
      setBuscandoCliente(false);
    }, DEBOUNCE_MS);
  }

  function seleccionarCliente(cliente: ClienteOpcion) {
    setBusquedaCliente("");
    setSugerencias([]);
    actualizarFiltros({ clienteId: cliente.id });
  }

  // Escapa el default "hoy" de la página (bare /ventas) sin tener que
  // adivinar una fecha vacía — ver comentario arriba.
  const viendoTodasLasFechas = searchParams.get("fecha") === "todas";

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
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>

      {abierto ? (
        // sm:flex-nowrap + overflow-x-auto (no sm:flex-wrap): con 6 campos
        // en la fila, envolver a una segunda línea partía el filtro por la
        // mitad en pantallas angostas (hallazgo real del Product Owner) —
        // mismo criterio que <TableScrollArea> para contenido más ancho
        // que el viewport: scroll horizontal contenido, no wrap. shrink-0
        // en cada campo evita que se compriman en vez de scrollear.
        <div className="mt-3 flex flex-col gap-3 overflow-x-auto pb-1 sm:flex-row sm:flex-nowrap sm:items-end sm:gap-2">
          <div className="flex shrink-0 flex-col gap-2">
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

          <div className="flex shrink-0 flex-col gap-2">
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
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <CalendarDays className="size-4" />
              Ver todas las fechas
            </button>
          ) : null}

          <div className="flex shrink-0 flex-col gap-2">
            <Label htmlFor="filtro-metodoPago" className={LABEL_COMPACTO}>
              Método de pago
            </Label>
            <Select
              value={metodoPago ?? METODO_TODOS}
              onValueChange={(valor) => actualizarFiltros({ metodoPago: valor === METODO_TODOS ? null : valor })}
            >
              <SelectTrigger id="filtro-metodoPago" className="h-10 w-full sm:w-44">
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

          <div className="flex shrink-0 flex-col gap-2">
            <Label htmlFor="filtro-tipo" className={LABEL_COMPACTO}>
              Tipo
            </Label>
            <Select
              value={tipo ?? TIPO_TODOS}
              onValueChange={(valor) => actualizarFiltros({ tipo: valor === TIPO_TODOS ? null : valor })}
            >
              <SelectTrigger id="filtro-tipo" className="h-10 w-full sm:w-44">
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

          <div className="relative flex shrink-0 flex-col gap-2">
            <Label htmlFor="filtro-cliente" className={LABEL_COMPACTO}>
              Cliente
            </Label>
            {clienteId && clienteInicial ? (
              <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm">
                <span className="truncate text-foreground">{clienteInicial.nombre}</span>
                <button
                  type="button"
                  onClick={() => actualizarFiltros({ clienteId: null })}
                  aria-label="Quitar filtro de cliente"
                  className="text-muted-foreground outline-none hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="filtro-cliente"
                  value={busquedaCliente}
                  onChange={(evento) => actualizarBusquedaCliente(evento.target.value)}
                  placeholder="Buscar cliente..."
                  className="h-10 w-full pl-9 sm:w-48"
                />
              </div>
            )}
            {!clienteId && busquedaCliente.trim() ? (
              <ul className="absolute top-full left-0 z-10 mt-1 flex w-full min-w-56 flex-col gap-1 rounded-md border border-border bg-popover p-1 shadow-md">
                {buscandoCliente ? <li className="px-2 py-1 text-sm text-muted-foreground">Buscando...</li> : null}
                {!buscandoCliente && sugerencias.length === 0 ? (
                  <li className="px-2 py-1 text-sm text-muted-foreground">Sin coincidencias.</li>
                ) : null}
                {sugerencias.map((sugerencia) => (
                  <li key={sugerencia.id}>
                    <button
                      type="button"
                      onClick={() => seleccionarCliente(sugerencia)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
                    >
                      {sugerencia.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
