import { describe, expect, it } from "vitest";

import { makeCliente, makeGalpon, makeLote, makeUsuario } from "./index";

describe("factories", () => {
  it("makeUsuario aplica defaults y permite overrides", () => {
    const usuario = makeUsuario();
    expect(usuario.rol).toBe("OPERARIO");
    expect(makeUsuario({ rol: "GERENTE" }).rol).toBe("GERENTE");
  });

  it("makeCliente aplica defaults y permite overrides", () => {
    const cliente = makeCliente();
    expect(cliente.tipo).toBe("MINORISTA");
    expect(makeCliente({ tipo: "EVENTUAL" }).tipo).toBe("EVENTUAL");
  });

  it("makeGalpon aplica defaults y permite overrides", () => {
    const galpon = makeGalpon();
    expect(galpon.capacidadMaxima).toBe(500);
    expect(makeGalpon({ capacidadMaxima: 800 }).capacidadMaxima).toBe(800);
  });

  it("makeLote aplica defaults y permite overrides", () => {
    const lote = makeLote();
    expect(lote.estado).toBe("ACTIVO");
    expect(makeLote({ avesVivas: 480 }).avesVivas).toBe(480);
  });
});
