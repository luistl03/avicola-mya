import { describe, expect, it } from "vitest";

import { cerrarVentaSchema } from "@/lib/zod/venta";

const inputBase = {
  id: crypto.randomUUID(),
  clienteId: crypto.randomUUID(),
  items: [
    { tipo: "PAQUETE", id: crypto.randomUUID() },
    { tipo: "BANDEJA", id: crypto.randomUUID() },
  ],
  descuento: 10,
  metodoPago: "EFECTIVO",
};

describe("cerrarVentaSchema", () => {
  it("acepta un payload válido completo", () => {
    expect(cerrarVentaSchema.safeParse(inputBase).success).toBe(true);
  });

  it("rechaza un carrito vacío", () => {
    const resultado = cerrarVentaSchema.safeParse({ ...inputBase, items: [] });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El carrito no puede estar vacío");
    }
  });

  it("rechaza un tipo de ítem fuera de PAQUETE/BANDEJA (la granja no vende huevo por unidad — confirmado con el Product Owner, Sprint 10)", () => {
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      items: [{ tipo: "SUELTO", id: crypto.randomUUID() }],
    });

    expect(resultado.success).toBe(false);
  });

  it("acepta los 2 tipos reales de ítem", () => {
    for (const tipo of ["PAQUETE", "BANDEJA"]) {
      const resultado = cerrarVentaSchema.safeParse({
        ...inputBase,
        items: [{ tipo, id: crypto.randomUUID() }],
      });
      expect(resultado.success).toBe(true);
    }
  });

  it("rechaza un descuento negativo", () => {
    expect(cerrarVentaSchema.safeParse({ ...inputBase, descuento: -1 }).success).toBe(false);
  });

  it("usa el default 0 si se omite el descuento", () => {
    const { descuento: _descuento, ...resto } = inputBase;
    void _descuento;
    const resultado = cerrarVentaSchema.safeParse(resto);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.descuento).toBe(0);
    }
  });

  it("acepta los 4 valores reales de MetodoPago", () => {
    for (const metodoPago of ["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"]) {
      expect(cerrarVentaSchema.safeParse({ ...inputBase, metodoPago }).success).toBe(true);
    }
  });

  it("rechaza un método de pago fuera del enum", () => {
    expect(cerrarVentaSchema.safeParse({ ...inputBase, metodoPago: "CREDITO" }).success).toBe(false);
  });

  it("rechaza un id de venta sin forma de UUID", () => {
    expect(cerrarVentaSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(false);
  });

  it("rechaza un clienteId sin forma de UUID", () => {
    expect(cerrarVentaSchema.safeParse({ ...inputBase, clienteId: "no-es-un-uuid" }).success).toBe(false);
  });

  it("rechaza el id de un ítem del carrito sin forma de UUID", () => {
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      items: [{ tipo: "PAQUETE", id: "no-es-un-uuid" }],
    });

    expect(resultado.success).toBe(false);
  });

  it("esCredito en false (default) no exige montoContado ni fechaLimiteCredito", () => {
    const resultado = cerrarVentaSchema.safeParse(inputBase);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.esCredito).toBe(false);
    }
  });

  it("esCredito en true con montoContado y fechaLimiteCredito válidos (futuros) se acepta", () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000 * 2);
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      esCredito: true,
      montoContado: 50,
      fechaLimiteCredito: manana.toISOString(),
    });

    expect(resultado.success).toBe(true);
  });

  it("esCredito en true sin montoContado se rechaza", () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000 * 2);
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      esCredito: true,
      fechaLimiteCredito: manana.toISOString(),
    });

    expect(resultado.success).toBe(false);
  });

  it("esCredito en true sin fechaLimiteCredito se rechaza", () => {
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      esCredito: true,
      montoContado: 50,
    });

    expect(resultado.success).toBe(false);
  });

  it("esCredito en true con fechaLimiteCredito de hoy exacto se rechaza (límite estricto)", () => {
    const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      esCredito: true,
      montoContado: 50,
      fechaLimiteCredito: hoy.toISOString(),
    });

    expect(resultado.success).toBe(false);
  });

  it("esCredito en true con fechaLimiteCredito pasada se rechaza", () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000 * 2);
    const resultado = cerrarVentaSchema.safeParse({
      ...inputBase,
      esCredito: true,
      montoContado: 50,
      fechaLimiteCredito: ayer.toISOString(),
    });

    expect(resultado.success).toBe(false);
  });

  it("montoContado negativo se rechaza independientemente de esCredito", () => {
    const resultado = cerrarVentaSchema.safeParse({ ...inputBase, montoContado: -1 });

    expect(resultado.success).toBe(false);
  });
});
