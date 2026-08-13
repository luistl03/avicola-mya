import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Generado en el cliente (crypto.randomUUID()) — PrecioKilo no tiene ningún
// campo @unique, mismo patrón de idempotencia que crearGalponSchema/
// crearClienteSchema (server/actions/galpon.ts es la referencia real).
const id = idUuid();

// Decimal(10,2) en el schema: precisión 10, escala 2 -> 8 dígitos enteros +
// 2 decimales, máximo real 99999999.99. (Corrección real respecto al
// pseudocódigo de plan.md, que proponía 9_999_999.99 — un dígito entero de
// menos: precisión 10 - escala 2 = 8 dígitos enteros, no 7.)
const precio = z.coerce
  .number()
  .positive("El precio debe ser mayor a 0")
  .max(99_999_999.99, "Precio fuera de rango");

export const crearPrecioKiloSchema = z.object({ id, precio });

export type CrearPrecioKiloInput = z.infer<typeof crearPrecioKiloSchema>;
