"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RomperBandejaDialog } from "@/components/domain/consolidacion/romper-bandeja-dialog";
import { RomperPaqueteDialog } from "@/components/domain/consolidacion/romper-paquete-dialog";

const PREVIEW_INICIAL = 3;

export type ItemDisponible = { id: string; peso: number };

// Listado de Paquete/BandejaSuelta DISPONIBLE con acción "Romper" — mismo
// dataset que ya usa /pos (listarPaquetesDisponibles/
// listarBandejasDisponibles, Sprint 9), reusado acá porque Romper vive en
// Consolidación (decisión corregida en Sprint 10: la granja no vende huevo
// por unidad, así que romper un paquete/bandeja siempre es para reshapear
// inventario vía los wizards "Armar Bandeja"/"Armar Paquete Mixto" de esta
// misma pantalla, nunca para completar una venta directa en /pos).
export function RomperInventarioSection({
  paquetesDisponibles,
  bandejasDisponibles,
}: {
  paquetesDisponibles: ItemDisponible[];
  bandejasDisponibles: ItemDisponible[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ListaRomper
        titulo="Paquetes disponibles"
        badge="Paquete"
        items={paquetesDisponibles}
        vacio="No hay paquetes disponibles."
        renderRomper={(item) => <RomperPaqueteDialog paquete={item} />}
      />
      <ListaRomper
        titulo="Bandejas disponibles"
        badge="Bandeja"
        items={bandejasDisponibles}
        vacio="No hay bandejas disponibles."
        renderRomper={(item) => <RomperBandejaDialog bandeja={item} />}
      />
    </div>
  );
}

// Mismo patrón de recorte + búsqueda por peso que PosSelectorItems
// (Sprint 9) — con muchos ítems DISPONIBLE, una lista sin recorte obliga a
// scrollear en vez de encontrar uno puntual.
function ListaRomper({
  titulo,
  badge,
  items,
  vacio,
  renderRomper,
}: {
  titulo: string;
  badge: string;
  items: ItemDisponible[];
  vacio: string;
  renderRomper: (item: ItemDisponible) => ReactNode;
}) {
  const [busquedaPeso, setBusquedaPeso] = useState("");
  const texto = busquedaPeso.trim();

  const coincidencias = useMemo(
    () => (texto ? items.filter((item) => item.peso.toFixed(3).includes(texto)) : null),
    [items, texto],
  );

  const visibles = texto ? (coincidencias ?? []) : items.slice(-PREVIEW_INICIAL).reverse();
  const ocultos = texto ? 0 : Math.max(0, items.length - PREVIEW_INICIAL);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">
        {titulo} ({items.length})
      </p>

      {items.length > PREVIEW_INICIAL ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busquedaPeso}
            onChange={(evento) => setBusquedaPeso(evento.target.value)}
            placeholder="Buscar por peso (kg)..."
            inputMode="decimal"
            className="h-10 pl-9"
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin coincidencias para &quot;{texto}&quot;.</p>
      ) : (
        <>
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {visibles.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Badge variant="outline">{badge}</Badge>
                  {item.peso.toFixed(3)} kg
                </span>
                {renderRomper(item)}
              </li>
            ))}
          </ul>
          {ocultos > 0 ? (
            <p className="text-sm text-muted-foreground">Hay {ocultos} más, busca por peso para encontrarlos.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
