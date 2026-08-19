import { describe, expect, it } from "vitest";

import {
  cambiarEstadoEmpleadoSchema,
  crearEmpleadoSchema,
  editarEmpleadoSchema,
} from "@/lib/zod/empleado";

describe("crearEmpleadoSchema", () => {
  it("acepta un payload válido con celular y cargo", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "Juana Pérez",
      celular: "987654321",
      cargo: "Operaria de campo",
    });

    expect(resultado.success).toBe(true);
  });

  it("acepta un payload válido sin celular ni cargo", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "Juana Pérez",
    });

    expect(resultado.success).toBe(true);
  });

  it("normaliza celular/cargo con string vacío a undefined, sin error", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "Juana Pérez",
      celular: "",
      cargo: "",
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.celular).toBeUndefined();
      expect(resultado.data.cargo).toBeUndefined();
    }
  });

  it("rechaza un nombre vacío", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "  ",
    });

    expect(resultado.success).toBe(false);
  });

  it("rechaza un id con formato inválido", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: "no-es-un-uuid",
      nombre: "Juana Pérez",
    });

    expect(resultado.success).toBe(false);
  });

  it("no acepta usuarioId como campo del payload (decisión 5: fuera de la UI este sprint)", () => {
    const resultado = crearEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "Juana Pérez",
      usuarioId: crypto.randomUUID(),
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect("usuarioId" in resultado.data).toBe(false);
    }
  });
});

describe("editarEmpleadoSchema", () => {
  it("acepta el mismo payload que crear", () => {
    const resultado = editarEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "Juana Pérez",
      celular: "987654321",
      cargo: "Operaria de campo",
    });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un nombre vacío", () => {
    const resultado = editarEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      nombre: "",
    });

    expect(resultado.success).toBe(false);
  });
});

describe("cambiarEstadoEmpleadoSchema", () => {
  it("acepta ACTIVO e INACTIVO", () => {
    const id = crypto.randomUUID();

    expect(cambiarEstadoEmpleadoSchema.safeParse({ id, estado: "ACTIVO" }).success).toBe(true);
    expect(cambiarEstadoEmpleadoSchema.safeParse({ id, estado: "INACTIVO" }).success).toBe(true);
  });

  it("rechaza un estado fuera de los 2 valores reales", () => {
    const resultado = cambiarEstadoEmpleadoSchema.safeParse({
      id: crypto.randomUUID(),
      estado: "SUSPENDIDO",
    });

    expect(resultado.success).toBe(false);
  });
});
