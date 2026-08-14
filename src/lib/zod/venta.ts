import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// A propósito, un ítem del carrito NO lleva peso ni precio — esos valores
// nunca se confían del payload del cliente (H2, spec.md): la Server Action
// relee el peso real de Paquete/BandejaSuelta y el precio de
// obtenerPrecioKiloVigente() del lado del servidor. SUELTO queda fuera del
// enum a propósito (decisión de negocio 5, spec.md) — Sprint 10 lo agrega
// cuando exista ese flujo real.
const itemCarrito = z.object({
  tipo: z.enum(["PAQUETE", "BANDEJA"]),
  id: idUuid(),
});

// Venta.id, generado en el cliente una sola vez por intento de checkout
// (crypto.randomUUID()) — Venta no tiene ningún campo @unique, mismo
// patrón de idempotencia que crearClienteSchema/crearGalponSchema.
const id = idUuid();

const clienteId = idUuid();

const items = z.array(itemCarrito).min(1, "El carrito no puede estar vacío");

// El guard real de "no supera el bruto de la venta" vive en
// server/services/venta.ts (validarDescuento) — Zod no conoce el bruto acá
// (depende de los ítems reales, resueltos server-side), solo valida la
// forma: un número, nunca negativo.
const descuento = z.coerce.number().min(0, "El descuento no puede ser negativo").default(0);

const metodoPago = z.enum(["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]);

export const cerrarVentaSchema = z.object({ id, clienteId, items, descuento, metodoPago });

export type CerrarVentaInput = z.infer<typeof cerrarVentaSchema>;
