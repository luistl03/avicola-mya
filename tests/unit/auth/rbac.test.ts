import { describe, expect, it } from "vitest";

import { rolPermitidoParaRuta } from "@/server/auth/rbac";

describe("rolPermitidoParaRuta", () => {
  it("permite a GERENTE acceder a /usuarios", () => {
    expect(rolPermitidoParaRuta("/usuarios", "GERENTE")).toBe(true);
  });

  it("bloquea a OPERARIO acceder a /usuarios", () => {
    expect(rolPermitidoParaRuta("/usuarios", "OPERARIO")).toBe(false);
  });

  it("permite a GERENTE y OPERARIO acceder a subrutas de /usuarios (misma regla por startsWith)", () => {
    expect(rolPermitidoParaRuta("/usuarios/nuevo", "GERENTE")).toBe(true);
    expect(rolPermitidoParaRuta("/usuarios/nuevo", "OPERARIO")).toBe(false);
  });

  it("no restringe rutas sin regla explícita en RUTAS_POR_ROL (p. ej. /dashboard, /operacion/recoleccion)", () => {
    expect(rolPermitidoParaRuta("/dashboard", "OPERARIO")).toBe(true);
    expect(rolPermitidoParaRuta("/operacion/recoleccion", "OPERARIO")).toBe(true);
    expect(rolPermitidoParaRuta("/", "OPERARIO")).toBe(true);
  });
});
