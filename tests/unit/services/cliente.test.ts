import { describe, expect, it } from "vitest";

import { esClientePublicoGeneral } from "@/server/services/cliente";

describe("esClientePublicoGeneral", () => {
  it("reconoce el id fijo de Público General", () => {
    expect(esClientePublicoGeneral("00000000-0000-0000-0000-000000000001")).toBe(true);
  });

  it("rechaza un UUID real generado en el cliente", () => {
    expect(esClientePublicoGeneral(crypto.randomUUID())).toBe(false);
  });

  it("rechaza el id de otra entidad sembrada (mismo formato, distinto valor)", () => {
    expect(esClientePublicoGeneral("00000000-0000-0000-0000-000000000101")).toBe(false);
  });

  it("rechaza un string vacío", () => {
    expect(esClientePublicoGeneral("")).toBe(false);
  });
});
