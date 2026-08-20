import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  descartar,
  encolar,
  listarParaEnviar,
  listarPendientes,
  marcarEnviando,
  marcarError,
  marcarOk,
  marcarPendiente,
} from "@/lib/offline/cola";
import { dbOffline } from "@/lib/offline/db";

// fake-indexeddb/auto: única suite del proyecto que necesita indexedDB
// global (vitest.config.mts corre en environment: "node", sin jsdom) —
// ver plan.md, "Tests unitarios".

const payloadBase = { id: "11111111-1111-4111-8111-111111111111", creadoEnCliente: new Date() };

beforeEach(async () => {
  await dbOffline.pendientes.clear();
});

afterEach(async () => {
  await dbOffline.pendientes.clear();
});

describe("encolar", () => {
  it("crea un ítem PENDIENTE con 0 intentos, usando el id del payload como clave", async () => {
    await encolar("MORTALIDAD", payloadBase);

    const item = await dbOffline.pendientes.get(payloadBase.id);
    expect(item).toMatchObject({
      id: payloadBase.id,
      tipo: "MORTALIDAD",
      estado: "PENDIENTE",
      intentos: 0,
    });
  });

  it("reencolar el mismo id sobrescribe el ítem (put, no add) sin duplicar filas", async () => {
    await encolar("BITACORA", payloadBase);
    await encolar("BITACORA", { ...payloadBase, contenido: "cambiado" });

    const total = await dbOffline.pendientes.count();
    expect(total).toBe(1);
  });
});

describe("listarPendientes / listarParaEnviar", () => {
  it("listarPendientes trae todo lo que no está OK; listarParaEnviar solo PENDIENTE", async () => {
    await encolar("MORTALIDAD", { ...payloadBase, id: "a" });
    await encolar("BITACORA", { ...payloadBase, id: "b" });
    await encolar("RECOLECCION", { ...payloadBase, id: "c" });
    await marcarOk("a");
    await marcarError("b", "El lote ya no existe.");
    // "c" queda PENDIENTE

    const pendientes = await listarPendientes();
    const paraEnviar = await listarParaEnviar();

    expect(pendientes.map((item) => item.id).sort()).toEqual(["b", "c"]);
    expect(paraEnviar.map((item) => item.id)).toEqual(["c"]);
  });
});

describe("transiciones de estado", () => {
  it("marcarEnviando → marcarOk deja el ítem en OK sin error", async () => {
    await encolar("MORTALIDAD", payloadBase);
    await marcarEnviando(payloadBase.id);
    await marcarOk(payloadBase.id);

    const item = await dbOffline.pendientes.get(payloadBase.id);
    expect(item?.estado).toBe("OK");
    expect(item?.ultimoError).toBeUndefined();
  });

  it("marcarError deja el motivo visible y el ítem en ERROR", async () => {
    await encolar("MORTALIDAD", payloadBase);
    await marcarError(payloadBase.id, "Ya existe un registro con este id pero con datos diferentes.");

    const item = await dbOffline.pendientes.get(payloadBase.id);
    expect(item?.estado).toBe("ERROR");
    expect(item?.ultimoError).toBe(
      "Ya existe un registro con este id pero con datos diferentes.",
    );
  });

  it("marcarPendiente sobre un id que ya no está en la tabla (caso defensivo) no revienta — Dexie.update() sobre una clave inexistente es un no-op, no crea la fila", async () => {
    await expect(marcarPendiente("no-existe")).resolves.toBeUndefined();

    const item = await dbOffline.pendientes.get("no-existe");
    expect(item).toBeUndefined();
  });

  it("marcarPendiente (fallo de red) incrementa intentos y vuelve a PENDIENTE, nunca a ERROR", async () => {
    await encolar("MORTALIDAD", payloadBase);
    await marcarEnviando(payloadBase.id);
    await marcarPendiente(payloadBase.id);

    const item = await dbOffline.pendientes.get(payloadBase.id);
    expect(item?.estado).toBe("PENDIENTE");
    expect(item?.intentos).toBe(1);

    await marcarEnviando(payloadBase.id);
    await marcarPendiente(payloadBase.id);
    const segundoIntento = await dbOffline.pendientes.get(payloadBase.id);
    expect(segundoIntento?.intentos).toBe(2);
  });
});

describe("descartar", () => {
  it("borra la fila físicamente — único DELETE real de la tabla, nunca automático", async () => {
    await encolar("MORTALIDAD", payloadBase);
    await descartar(payloadBase.id);

    const item = await dbOffline.pendientes.get(payloadBase.id);
    expect(item).toBeUndefined();
  });
});
