import { z } from "zod";

import { hoyEnLima, idUuid } from "@/lib/zod/comun";

// A propósito, un ítem del carrito NO lleva peso ni precio — esos valores
// nunca se confían del payload del cliente (H2, spec.md): la Server Action
// relee el peso real de Paquete/BandejaSuelta y el precio de
// obtenerPrecioKiloVigente() del lado del servidor. La granja no vende
// huevo por unidad (confirmado con el Product Owner durante la
// planificación de Sprint 10) — el carrito solo admite PAQUETE/BANDEJA,
// nunca un tipo SUELTO.
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

// Sprint 11 — venta a crédito (total o parcial). A propósito, este schema
// sigue sin incluir montoTotal/montoCredito calculados: se resuelven
// server-side a partir de totalCobrado (ya resuelto con precio real) y
// montoContado, mismo criterio que precioKiloAplicado/subtotal nunca se
// confían del cliente (H2, Sprint 9). El guard "montoContado no supera el
// total cobrado" tampoco vive acá (Zod no conoce totalCobrado, depende de
// ítems reales resueltos server-side) — vive en
// validarMontoContado (server/services/venta.ts).
const esCredito = z.coerce.boolean().default(false);
const montoContado = z.coerce.number().min(0, "No puede ser negativo").optional();
const fechaLimiteCredito = z.coerce.date({ message: "Fecha inválida" }).optional();

export const cerrarVentaSchema = z
  .object({ id, clienteId, items, descuento, metodoPago, esCredito, montoContado, fechaLimiteCredito })
  .refine((data) => !data.esCredito || data.montoContado !== undefined, {
    message: "Indicá el monto al contado (puede ser 0).",
    path: ["montoContado"],
  })
  .refine((data) => !data.esCredito || data.fechaLimiteCredito !== undefined, {
    message: "Indicá la fecha límite del crédito.",
    path: ["fechaLimiteCredito"],
  })
  .refine(
    (data) =>
      !data.esCredito || !data.fechaLimiteCredito || data.fechaLimiteCredito.getTime() > hoyEnLima().getTime(),
    { message: "La fecha límite debe ser posterior a hoy.", path: ["fechaLimiteCredito"] },
  );

export type CerrarVentaInput = z.infer<typeof cerrarVentaSchema>;
