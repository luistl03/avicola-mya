import { beforeEach, describe, expect, it, vi } from "vitest";

const { registrarMortalidadMock, crearNotaBitacoraMock, registrarRecoleccionMock } = vi.hoisted(() => ({
  registrarMortalidadMock: vi.fn(),
  crearNotaBitacoraMock: vi.fn(),
  registrarRecoleccionMock: vi.fn(),
}));

// Mockea las 3 Server Actions completas, no sus repositories — /api/sync
// es un adaptador de transporte sobre esas actions (plan.md), así que sus
// propios tests no re-verifican Zod/idempotencia/AuditLog (eso ya lo
// cubren tests/integration/actions/mortalidad.test.ts, bitacora.test.ts,
// recoleccion.test.ts) — solo el despacho, la independencia entre ítems
// y la forma de la respuesta del batch.
vi.mock("@/server/actions/mortalidad", () => ({ registrarMortalidad: registrarMortalidadMock }));
vi.mock("@/server/actions/bitacora", () => ({ crearNotaBitacora: crearNotaBitacoraMock }));
vi.mock("@/server/actions/recoleccion", () => ({ registrarRecoleccion: registrarRecoleccionMock }));

import { POST } from "@/app/api/sync/route";

function request(body: unknown) {
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("despacha cada ítem al handler correcto según `tipo`", async () => {
    registrarMortalidadMock.mockResolvedValue({ ok: true, data: { id: "a" } });
    crearNotaBitacoraMock.mockResolvedValue({ ok: true, data: { id: "b" } });
    registrarRecoleccionMock.mockResolvedValue({ ok: true, data: { id: "c" } });

    const res = await POST(
      request({
        items: [
          { idLocal: "a", tipo: "MORTALIDAD", payload: { id: "a" } },
          { idLocal: "b", tipo: "BITACORA", payload: { id: "b" } },
          { idLocal: "c", tipo: "RECOLECCION", payload: { id: "c" } },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toEqual([
      { idLocal: "a", ok: true, data: { id: "a" } },
      { idLocal: "b", ok: true, data: { id: "b" } },
      { idLocal: "c", ok: true, data: { id: "c" } },
    ]);
    expect(registrarMortalidadMock).toHaveBeenCalledWith({ id: "a" });
    expect(crearNotaBitacoraMock).toHaveBeenCalledWith({ id: "b" });
    expect(registrarRecoleccionMock).toHaveBeenCalledWith({ id: "c" });
  });

  it("un ítem que falla no impide que los demás se procesen (independencia)", async () => {
    registrarMortalidadMock.mockResolvedValue({ ok: false, error: "El lote no existe." });
    crearNotaBitacoraMock.mockResolvedValue({ ok: true, data: { id: "b" } });

    const res = await POST(
      request({
        items: [
          { idLocal: "a", tipo: "MORTALIDAD", payload: { id: "a" } },
          { idLocal: "b", tipo: "BITACORA", payload: { id: "b" } },
        ],
      }),
    );

    const body = await res.json();
    expect(body.resultados[0]).toEqual({ idLocal: "a", ok: false, error: "El lote no existe." });
    expect(body.resultados[1]).toEqual({ idLocal: "b", ok: true, data: { id: "b" } });
  });

  it("reenviar el mismo lote una segunda vez no duplica nada — delega la idempotencia a la Server Action, no la reimplementa", async () => {
    // El mock simula lo que la action real ya garantiza (P2002 + comparación
    // de campos, ver server/actions/mortalidad.ts): un reintento del mismo
    // id con los mismos datos responde éxito sin crear una segunda fila.
    registrarMortalidadMock.mockResolvedValue({ ok: true, data: { id: "a" } });

    const payload = { items: [{ idLocal: "a", tipo: "MORTALIDAD", payload: { id: "a" } }] };
    await POST(request(payload));
    await POST(request(payload));

    expect(registrarMortalidadMock).toHaveBeenCalledTimes(2);
    expect(registrarMortalidadMock).toHaveBeenNthCalledWith(1, { id: "a" });
    expect(registrarMortalidadMock).toHaveBeenNthCalledWith(2, { id: "a" });
  });

  it("rechaza un body inválido con 400 sin llamar a ningún handler", async () => {
    const res = await POST(request({ items: [{ idLocal: "a", tipo: "NO_EXISTE", payload: {} }] }));

    expect(res.status).toBe(400);
    expect(registrarMortalidadMock).not.toHaveBeenCalled();
  });

  it("rechaza un lote de más de 25 ítems con 400", async () => {
    const items = Array.from({ length: 26 }, (_, i) => ({
      idLocal: `id-${i}`,
      tipo: "MORTALIDAD",
      payload: {},
    }));

    const res = await POST(request({ items }));

    expect(res.status).toBe(400);
  });

  it("rechaza un body que no es JSON con 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/sync", { method: "POST", body: "no es json" }),
    );

    expect(res.status).toBe(400);
  });
});
