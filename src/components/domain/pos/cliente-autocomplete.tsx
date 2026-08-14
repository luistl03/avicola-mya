"use client";

import { useRef, useState } from "react";
import { Check, Search } from "lucide-react";

import { ClienteFormDialog } from "@/components/domain/clientes/cliente-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClienteSeleccionado } from "@/components/domain/pos/pos-workspace";
import { buscarClientesAutocompleteAction } from "@/server/actions/cliente";

const DEBOUNCE_MS = 300;

// "Público General" viene preseleccionado por defecto (decisión de negocio
// 4, spec.md) — clienteInicial lo trae ya resuelto desde
// app/(app)/pos/page.tsx (buscarClientePorId(CLIENTE_PUBLICO_GENERAL_ID)),
// nunca hardcodeado como texto acá: si algún día el Product Owner pidiera
// otro cliente "de mostrador" por defecto, cambia en la página, no en este
// componente.
//
// A diferencia de ClienteFiltros (Sprint 8), que dirige la búsqueda por
// URL, este autocomplete llama a buscarClientesAutocompleteAction directo
// (no es una tabla de gestión ni algo que tenga sentido compartir por
// link) — mismo debounce de 300ms guardado en un ref, sin useEffect.
export function ClienteAutocomplete({
  cliente,
  clienteInicial,
  onSeleccionar,
}: {
  cliente: ClienteSeleccionado;
  clienteInicial: ClienteSeleccionado;
  onSeleccionar: (cliente: ClienteSeleccionado) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteSeleccionado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function actualizarBusqueda(valor: string) {
    setBusqueda(valor);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const texto = valor.trim();
    if (!texto) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    timeoutRef.current = setTimeout(async () => {
      const resultado = await buscarClientesAutocompleteAction(texto);
      setSugerencias(resultado.ok ? resultado.data : []);
      setBuscando(false);
    }, DEBOUNCE_MS);
  }

  function seleccionar(seleccionado: ClienteSeleccionado) {
    onSeleccionar(seleccionado);
    setBusqueda("");
    setSugerencias([]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <Label htmlFor="cliente-busqueda" className="text-sm text-muted-foreground">
        Cliente
      </Label>

      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <Check className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{cliente.nombre}</span>
        {cliente.id === clienteInicial.id ? (
          <span className="text-xs text-muted-foreground">(por defecto)</span>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="cliente-busqueda"
          value={busqueda}
          onChange={(evento) => actualizarBusqueda(evento.target.value)}
          placeholder="Buscar otro cliente por nombre o celular..."
          className="h-10 pl-9"
        />
      </div>

      {busqueda.trim() ? (
        <ul className="flex flex-col gap-1">
          {buscando ? <li className="px-1 py-1 text-sm text-muted-foreground">Buscando...</li> : null}
          {!buscando && sugerencias.length === 0 ? (
            <li className="flex flex-col gap-2 px-1 py-1">
              <span className="text-sm text-muted-foreground">Sin coincidencias.</span>
              {/* Reusa el mismo dialog de /clientes (Sprint 8) en vez de
              duplicar el formulario — ya automatizamos ese flujo, no hace
              falta salir del POS para dar de alta un cliente nuevo.
              onCreado deja el cliente recién creado seleccionado de una,
              sin que el operario tenga que volver a buscarlo. */}
              <ClienteFormDialog modo="crear" onCreado={seleccionar} />
            </li>
          ) : null}
          {sugerencias.map((sugerencia) => (
            <li key={sugerencia.id}>
              <button
                type="button"
                onClick={() => seleccionar(sugerencia)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
              >
                {sugerencia.nombre}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
