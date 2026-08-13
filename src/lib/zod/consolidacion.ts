import { z } from "zod";

import { idUuid } from "@/lib/zod/comun";

// RegistroConsolidacion.id, generado en el cliente — es la pieza central
// del Contrato Offline-Ready/idempotencia de este sprint
// (memory/convenciones.md): permite que un reintento (doble tap, reintento
// de red) sea idempotente en vez de crear una segunda tanda de
// Paquete/BandejaSuelta. Nunca lo elige el usuario a mano, así que se
// queda con el mensaje genérico de idUuid().
const id = idUuid();

// Reloj del celular en el momento de confirmar el wizard — mismo criterio
// que crearRecoleccionSchema: el Contrato Offline-Ready exige los dos
// timestamps siempre (creadoEnCliente + creadoEn, este último lo pone el
// servidor, no viaja en el payload).
const creadoEnCliente = z.coerce.date({ message: "Fecha inválida" });

const origenSeleccionado = z.object({
  galponId: idUuid("Galpón inválido"),
  loteId: idUuid("Lote inválido"),
});

// Cada origen (galpón+lote) solo puede aparecer una vez en la selección —
// si el operario quiere usar el mismo origen "de nuevo", ya está incluido,
// no hace falta (ni tiene sentido) repetirlo como una segunda entrada.
const origenes = z
  .array(origenSeleccionado)
  .min(1, "Seleccioná al menos un origen")
  .max(200)
  .refine(
    (arr) => new Set(arr.map((o) => `${o.galponId}:${o.loteId}`)).size === arr.length,
    "No repitas el mismo galpón/lote como origen",
  );

// Un peso por cada unidad (Paquete o BandejaSuelta) que
// calcularConsolidacion() determinó en el cliente — igual que `pesos` de
// crearRecoleccionSchema, la CANTIDAD de pesos no se cruza acá contra las
// unidades esperadas (requiere recalcular calcularConsolidacion() con el
// saldo real, que vive en server/services/consolidacion.ts): ese cruce lo
// hace la Server Action. El .max(999.999) es la misma cota defensiva atada
// a Paquete.peso/BandejaSuelta.peso (Decimal(6,3)) que ya usa Recolección.
const pesos = z
  .array(z.coerce.number().positive("El peso debe ser mayor a 0").max(999.999, "Peso fuera de rango"))
  .min(1, "Debe formarse al menos una unidad")
  .max(1000);

// Un solo schema compartido por los dos wizards (Paquete Mixto y Armar
// Bandeja) — el `tipo` (PAQUETE_MIXTO/BANDEJA) NO viaja en el payload: lo
// fija cada Server Action por separado
// (consolidarPaqueteMixtoAction/consolidarBandejaAction), para que el
// cliente no pueda mandar un `tipo` que no coincide con el wizard que en
// verdad abrió.
export const consolidarSueltosSchema = z.object({ id, origenes, creadoEnCliente, pesos });

export type ConsolidarSueltosInput = z.infer<typeof consolidarSueltosSchema>;
