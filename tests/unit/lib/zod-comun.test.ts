import { describe, expect, it } from "vitest";

import { idUuid } from "@/lib/zod/comun";

describe("idUuid", () => {
  const schema = idUuid("mensaje de prueba");

  it("acepta un UUID real generado con crypto.randomUUID()", () => {
    expect(schema.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  // Caso real que rompía z.string().uuid() (Zod v4, estricto con el
  // nibble de versión/variante de RFC4122): los ids sembrados en
  // prisma/seed.ts para Galpon y Cliente "Público General" son
  // constantes fijas legibles, no generadas con crypto.randomUUID() —
  // bug real encontrado en producción del feature de Sprint 3 ("Nuevo
  // lote"/"Mudar lote" nunca dejaban guardar con un galpón sembrado).
  it("acepta los ids de prueba sembrados en prisma/seed.ts, aunque no cumplan RFC4122 estricto", () => {
    expect(schema.safeParse("00000000-0000-0000-0000-000000000101").success).toBe(true);
    expect(schema.safeParse("00000000-0000-0000-0000-000000000102").success).toBe(true);
    expect(schema.safeParse("00000000-0000-0000-0000-000000000001").success).toBe(true);
  });

  it("rechaza strings que no tienen forma de UUID", () => {
    expect(schema.safeParse("no-es-un-uuid").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("12345").success).toBe(false);
  });

  it("usa el mensaje de error personalizado", () => {
    const resultado = schema.safeParse("invalido");
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("mensaje de prueba");
    }
  });
});
