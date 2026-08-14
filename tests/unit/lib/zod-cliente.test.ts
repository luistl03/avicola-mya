import { describe, expect, it } from "vitest";

import {
  buscarClientesAutocompleteSchema,
  cambiarEstadoClienteSchema,
  crearClienteSchema,
  editarClienteSchema,
} from "@/lib/zod/cliente";

const inputBase = {
  id: crypto.randomUUID(),
  nombre: "Distribuidora El Sol",
  celular: "987654321",
  direccion: "Av. Principal 123",
  tipo: "MAYORISTA",
};

describe("crearClienteSchema", () => {
  it("acepta un payload válido completo", () => {
    expect(crearClienteSchema.safeParse(inputBase).success).toBe(true);
  });

  it("acepta celular y dirección vacíos (campos opcionales)", () => {
    const resultado = crearClienteSchema.safeParse({ ...inputBase, celular: "", direccion: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.celular).toBeUndefined();
      expect(resultado.data.direccion).toBeUndefined();
    }
  });

  it("rechaza nombre vacío", () => {
    const resultado = crearClienteSchema.safeParse({ ...inputBase, nombre: "" });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El nombre es obligatorio");
    }
  });

  it("rechaza un nombre que excede el máximo de 120 caracteres", () => {
    expect(crearClienteSchema.safeParse({ ...inputBase, nombre: "A".repeat(121) }).success).toBe(false);
  });

  it("rechaza un tipo fuera del enum", () => {
    expect(crearClienteSchema.safeParse({ ...inputBase, tipo: "VIP" }).success).toBe(false);
  });

  it("acepta los 3 valores reales de TipoCliente", () => {
    for (const tipo of ["MAYORISTA", "MINORISTA", "EVENTUAL"]) {
      expect(crearClienteSchema.safeParse({ ...inputBase, tipo }).success).toBe(true);
    }
  });

  it("rechaza un id sin forma de UUID", () => {
    expect(crearClienteSchema.safeParse({ ...inputBase, id: "no-es-un-uuid" }).success).toBe(false);
  });
});

describe("editarClienteSchema", () => {
  it("acepta un payload válido, con clienteId en vez de id", () => {
    const { id, ...resto } = inputBase;
    void id;
    const resultado = editarClienteSchema.safeParse({ ...resto, clienteId: crypto.randomUUID() });

    expect(resultado.success).toBe(true);
  });

  it("rechaza un clienteId sin forma de UUID", () => {
    const { id, ...resto } = inputBase;
    void id;
    expect(editarClienteSchema.safeParse({ ...resto, clienteId: "no-es-un-uuid" }).success).toBe(false);
  });
});

describe("cambiarEstadoClienteSchema", () => {
  it("acepta ACTIVO y SUSPENDIDO", () => {
    for (const estado of ["ACTIVO", "SUSPENDIDO"]) {
      const resultado = cambiarEstadoClienteSchema.safeParse({
        clienteId: crypto.randomUUID(),
        estado,
      });
      expect(resultado.success).toBe(true);
    }
  });

  it("rechaza un estado fuera de ACTIVO/SUSPENDIDO (por ejemplo, el de otra entidad: INACTIVO)", () => {
    const resultado = cambiarEstadoClienteSchema.safeParse({
      clienteId: crypto.randomUUID(),
      estado: "INACTIVO",
    });

    expect(resultado.success).toBe(false);
  });
});

describe("buscarClientesAutocompleteSchema", () => {
  it("acepta una búsqueda válida", () => {
    expect(buscarClientesAutocompleteSchema.safeParse({ busqueda: "Sol" }).success).toBe(true);
  });

  it("rechaza una búsqueda vacía", () => {
    expect(buscarClientesAutocompleteSchema.safeParse({ busqueda: "" }).success).toBe(false);
  });

  it("rechaza una búsqueda que excede el máximo de 120 caracteres", () => {
    expect(buscarClientesAutocompleteSchema.safeParse({ busqueda: "A".repeat(121) }).success).toBe(false);
  });
});
