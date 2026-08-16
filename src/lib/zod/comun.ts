import { z } from "zod";

// Valida la FORMA de un UUID (8-4-4-4-12 en hex) sin exigir que cumpla
// estrictamente el nibble de versión/variante de RFC4122, a diferencia de
// z.string().uuid() (Zod v4, estricto). Hace falta esto porque algunos
// ids sembrados en prisma/seed.ts (Galpon, Cliente "Público General") son
// constantes fijas legibles tipo "00000000-0000-0000-0000-000000000101"
// — elegidas así para poder reconocerlas a simple vista durante
// desarrollo, no generadas con crypto.randomUUID() — y no tienen ese
// nibble en rango válido (1-8), así que z.string().uuid() las rechazaba
// con un error de validación pese a ser ids reales y existentes en la
// base (bug real encontrado en Sprint 3: "Seleccioná un galpón" nunca
// desaparecía al elegir un galpón sembrado). El propósito real de esta
// validación es rechazar basura/inyección antes de tocar Prisma, no
// auditar el formato RFC4122 exacto de cada id.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idUuid(mensaje = "Id inválido") {
  return z.string().regex(UUID_REGEX, mensaje);
}

// "Hoy" se calcula en América/Lima (D5), no en la zona horaria del
// servidor — comparar Date crudos (UTC) haría que, por ejemplo, las
// primeras horas de un día en UTC (todavía "ayer" en Lima, UTC-5) rechacen
// como futura una fecha que en Lima sigue siendo hoy.
// toLocaleDateString("en-CA", ...) da directo el formato YYYY-MM-DD; el
// constructor de Date interpreta ese string como medianoche UTC, que es
// exactamente lo mismo que hace z.coerce.date() con el valor que manda un
// <input type="date">, así que la comparación queda pareja. Extraída acá
// desde lib/zod/lote.ts (Sprint 3) porque Sprint 11 (lib/zod/venta.ts)
// también la necesita.
export function hoyEnLima(): Date {
  return new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
}
