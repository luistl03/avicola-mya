import { describe, expect, it } from "vitest";

import { puedeDesactivarUsuario } from "@/server/services/usuario";

describe("puedeDesactivarUsuario", () => {
  it("bloquea la autodesactivación", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-1",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "OPERARIO",
      totalGerentesActivos: 2,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "No podés desactivar tu propio usuario.",
    });
  });

  it("bloquea desactivar al último Gerente activo", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-2",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "GERENTE",
      totalGerentesActivos: 1,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Debe quedar al menos un Gerente activo.",
    });
  });

  it("permite desactivar a un Gerente si quedan otros Gerentes activos", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-2",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "GERENTE",
      totalGerentesActivos: 2,
    });

    expect(resultado).toEqual({ permitido: true });
  });

  it("al autodesactivarse siendo el único Gerente activo, prioriza el motivo 'último Gerente' sobre el de autodesactivación", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-1",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "GERENTE",
      totalGerentesActivos: 1,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "Debe quedar al menos un Gerente activo.",
    });
  });

  it("al autodesactivarse habiendo otros Gerentes activos, muestra el motivo genérico de autodesactivación", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-1",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "GERENTE",
      totalGerentesActivos: 2,
    });

    expect(resultado).toEqual({
      permitido: false,
      motivo: "No podés desactivar tu propio usuario.",
    });
  });

  it("permite desactivar a un Operario distinto de quien ejecuta la acción", () => {
    const resultado = puedeDesactivarUsuario({
      usuarioObjetivoId: "usuario-2",
      usuarioActualId: "usuario-1",
      usuarioObjetivoRol: "OPERARIO",
      totalGerentesActivos: 1,
    });

    expect(resultado).toEqual({ permitido: true });
  });
});
