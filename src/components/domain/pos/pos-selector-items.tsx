"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ItemCarrito, ItemDisponible } from "@/components/domain/pos/pos-workspace";

// Cuántos ítems se muestran por defecto (sin búsqueda activa) antes de
// pedirle al operario que busque por peso — pedido real del Product Owner
// tras revisar la primera versión de esta pantalla: con muchos ítems
// DISPONIBLE, una lista sin recorte obliga a scrollear en vez de
// encontrar uno puntual.
const PREVIEW_INICIAL = 3;

// Filtra en memoria los ítems que ya están en el carrito — no hace falta
// volver a pedirle al servidor la lista de DISPONIBLE cada vez que se
// agrega/quita un ítem, el fetch inicial de app/(app)/pos/page.tsx ya trae
// todo lo que hace falta para esta sesión de venta.
export function PosSelectorItems({
  paquetesDisponibles,
  bandejasDisponibles,
  carrito,
  onAgregar,
}: {
  paquetesDisponibles: ItemDisponible[];
  bandejasDisponibles: ItemDisponible[];
  carrito: ItemCarrito[];
  onAgregar: (item: ItemCarrito) => void;
}) {
  const idsEnCarrito = new Set(carrito.map((item) => item.id));
  const paquetes = paquetesDisponibles.filter((item) => !idsEnCarrito.has(item.id));
  const bandejas = bandejasDisponibles.filter((item) => !idsEnCarrito.has(item.id));

  return (
    <div className="flex flex-col gap-4">
      <ListaDisponibles
        titulo="Paquetes disponibles"
        badge="Paquete"
        items={paquetes}
        vacio="No hay paquetes disponibles."
        onAgregar={(item) => onAgregar({ tipo: "PAQUETE", id: item.id, pesoKg: item.peso })}
      />
      <ListaDisponibles
        titulo="Bandejas disponibles"
        badge="Bandeja"
        items={bandejas}
        vacio="No hay bandejas disponibles."
        onAgregar={(item) => onAgregar({ tipo: "BANDEJA", id: item.id, pesoKg: item.peso })}
      />
    </div>
  );
}

function ListaDisponibles({
  titulo,
  badge,
  items,
  vacio,
  onAgregar,
}: {
  titulo: string;
  badge: string;
  items: ItemDisponible[];
  vacio: string;
  onAgregar: (item: ItemDisponible) => void;
}) {
  const [busquedaPeso, setBusquedaPeso] = useState("");
  const texto = busquedaPeso.trim();

  // Búsqueda 100% en memoria (no hay round-trip al servidor, a diferencia
  // de ClienteAutocomplete): la lista completa ya vive en `items`, filtrar
  // acá es gratis y evita otra Server Action solo para esto. `contains`
  // sobre el peso formateado a 3 decimales — mismo criterio "contains" que
  // ya usa la búsqueda de Cliente, adaptado a un número en vez de texto.
  const coincidencias = useMemo(
    () => (texto ? items.filter((item) => item.peso.toFixed(3).includes(texto)) : null),
    [items, texto],
  );

  // Sin búsqueda: preview de los ítems creados más recientemente (items
  // llega ordenado FIFO ascendente desde el servidor — "vender lo más
  // viejo primero", ver server/repositories/venta.ts — así que los últimos
  // N del arreglo son los más nuevos; se muestran invertidos, más reciente
  // primero). Con búsqueda activa, se listan TODAS las coincidencias, sin
  // recorte ni importar antigüedad.
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
                <Button type="button" variant="outline" size="sm" onClick={() => onAgregar(item)}>
                  <Plus data-icon="inline-start" />
                  Agregar
                </Button>
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
