"use client";

import { useState } from "react";

import { ClienteAutocomplete } from "@/components/domain/pos/cliente-autocomplete";
import { ComprobanteDialog } from "@/components/domain/pos/comprobante-dialog";
import { PosCarrito } from "@/components/domain/pos/pos-carrito";
import { PosSelectorItems } from "@/components/domain/pos/pos-selector-items";

export type ItemCarrito = { tipo: "PAQUETE" | "BANDEJA"; id: string; pesoKg: number };
export type ItemDisponible = { id: string; peso: number };
export type ClienteSeleccionado = { id: string; nombre: string };

// Datos completos de una venta recién cerrada, tal cual los devuelve
// cerrarVentaAction — ver "Corrección real encontrada al empezar S9-10" en
// tasks.md: se arman con lo REALMENTE persistido (servidor), no con el
// estado del carrito en memoria, porque ese estado es solo un preview con
// el precio vigente al cargar la página.
export type VentaCerradaData = {
  id: string;
  fecha: string;
  clienteNombre: string;
  vendedorNombre: string;
  totalCobrado: number;
  descuento: number;
  metodoPago: "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";
  items: { tipo: "PAQUETE" | "BANDEJA"; pesoKg: number; precioKiloAplicado: number; subtotal: number }[];
};

// Orquestador del estado compartido entre selector, carrito y cliente
// seleccionado — no estaba en el listado original de componentes de
// plan.md (que enumeraba PosSelectorItems/PosCarrito/ClienteAutocomplete/
// DescuentoInput/MetodoPagoSelect como piezas separadas), pero hace falta
// un dueño único de ese estado: `app/(app)/pos/page.tsx` es un Server
// Component y no puede tener estado, y el selector + el carrito están
// visibles simultáneamente (no son un modal aislado como el resto de
// dialogs del proyecto), así que no pueden compartir estado sin un padre
// cliente común. Desvío real documentado en tasks.md, S9-10.
export function PosWorkspace({
  paquetesDisponibles,
  bandejasDisponibles,
  precioKiloVigente,
  clienteInicial,
}: {
  paquetesDisponibles: ItemDisponible[];
  bandejasDisponibles: ItemDisponible[];
  precioKiloVigente: number;
  clienteInicial: ClienteSeleccionado;
}) {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [cliente, setCliente] = useState<ClienteSeleccionado>(clienteInicial);
  const [ventaCerrada, setVentaCerrada] = useState<VentaCerradaData | null>(null);

  function agregarItem(item: ItemCarrito) {
    setCarrito((anterior) => [...anterior, item]);
  }

  function quitarItem(id: string) {
    setCarrito((anterior) => anterior.filter((item) => item.id !== id));
  }

  // Se llama al cerrar el diálogo del comprobante, no apenas la venta se
  // crea (mientras el diálogo sigue abierto, el operario todavía puede
  // querer volver a mirar el detalle) — resetea carrito y cliente al
  // default (Público General), listo para la próxima venta.
  function empezarVentaNueva() {
    setCarrito([]);
    setCliente(clienteInicial);
    setVentaCerrada(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ClienteAutocomplete cliente={cliente} clienteInicial={clienteInicial} onSeleccionar={setCliente} />
          <PosSelectorItems
            paquetesDisponibles={paquetesDisponibles}
            bandejasDisponibles={bandejasDisponibles}
            carrito={carrito}
            onAgregar={agregarItem}
          />
        </div>
        <PosCarrito
          items={carrito}
          clienteId={cliente.id}
          precioKiloVigente={precioKiloVigente}
          onQuitar={quitarItem}
          onVentaCerrada={setVentaCerrada}
        />
      </div>

      {ventaCerrada ? <ComprobanteDialog venta={ventaCerrada} onCerrar={empezarVentaNueva} /> : null}
    </>
  );
}
