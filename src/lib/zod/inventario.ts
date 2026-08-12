import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// Ajuste manual del Gerente (Sprint 6) — a diferencia de la reversión
// (un UPDATE condicional sobre algo que ya existe), esto crea una fila
// nueva e independiente (MovimientoSueltos) sin ninguna unicidad de
// negocio posible sobre sus campos — cae en el patrón completo de
// idempotencia por id de cliente (memory/convenciones.md). Nunca lo
// elige el usuario a mano, así que se queda con el mensaje genérico de
// idUuid() en vez de uno personalizado.
const id = idUuid();

// El galpón NO lo elige el Gerente a mano — se resuelve automático vía
// buscarUbicacionActual(loteId) en la Server Action, mismo patrón que
// registrarRecoleccion/registrarMortalidad. Corrección real post-diseño
// (el Product Owner lo señaló probando en vivo, S6-16): un lote ya sabe
// su galpón actual, pedirlo aparte era fricción sin motivo de negocio
// real — el caso "ajustar un galpón histórico" que justificaba el
// <Select> independiente en el diseño original no es el caso real que
// el Gerente necesita resolver.
const loteId = idUuid("Seleccioná un lote");

// Único campo de MovimientoSueltos.cantidad que puede ser negativo en
// todo el proyecto (ver server/services/inventario.ts) — positivo
// compensa un faltante, negativo corrige un excedente. 0 se rechaza
// explícito: un ajuste de 0 no tiene sentido de negocio (no cambiaría el
// saldo ni justificaría la fila de auditoría).
const delta = z.coerce
  .number()
  .int("El ajuste debe ser un número entero")
  .refine((valor) => valor !== 0, "El ajuste no puede ser 0");

// Único freno real contra un ajuste sin explicación real ("s", "ok") —
// no es una validación de contenido, es la barrera mínima que pide el
// roadmap ("requiere un motivo/comentario obligatorio, dado que rompe la
// protección automática").
const motivo = z
  .string()
  .trim()
  .min(10, "Explicá el motivo del ajuste (mínimo 10 caracteres)")
  .max(500, "El motivo es demasiado largo");

export const ajustarInventarioSueltosSchema = z.object({
  id,
  loteId,
  delta,
  motivo,
});

export type AjustarInventarioSueltosInput = z.infer<typeof ajustarInventarioSueltosSchema>;
