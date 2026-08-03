import { describe, expect, it } from "vitest";

import { rolPermitidoParaRuta } from "@/server/auth/rbac";

describe("rolPermitidoParaRuta", () => {
  it("permite a GERENTE acceder a /gestion", () => {
    expect(rolPermitidoParaRuta("/gestion/usuarios", "GERENTE")).toBe(true);
  });

  it("bloquea a OPERARIO acceder a /gestion", () => {
    expect(rolPermitidoParaRuta("/gestion/usuarios", "OPERARIO")).toBe(false);
  });

  it("permite a GERENTE acceder a /operacion", () => {
    expect(rolPermitidoParaRuta("/operacion/recoleccion", "GERENTE")).toBe(true);
  });

  it("permite a OPERARIO acceder a /operacion", () => {
    expect(rolPermitidoParaRuta("/operacion/recoleccion", "OPERARIO")).toBe(true);
  });

  it("no restringe rutas sin prefijo conocido (p. ej. /dashboard)", () => {
    expect(rolPermitidoParaRuta("/dashboard", "OPERARIO")).toBe(true);
    expect(rolPermitidoParaRuta("/", "OPERARIO")).toBe(true);
  });
});
