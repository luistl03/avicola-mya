import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: las factories de vi.mock se izan por encima de cualquier
// declaración normal del archivo (mismo patrón que
// tests/integration/rbac/with-auth.test.ts).
const { verificarRateLimitAuthMock, verificarRateLimitOperativoMock } = vi.hoisted(() => ({
  verificarRateLimitAuthMock: vi.fn(),
  verificarRateLimitOperativoMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  verificarRateLimitAuth: verificarRateLimitAuthMock,
  verificarRateLimitOperativo: verificarRateLimitOperativoMock,
}));

// `auth` de next-auth se usa acá como HOC (`auth(async (req) => {...})`),
// no como la función `auth()` sin argumentos que mockean with-auth.test.ts
// o usuario.test.ts. El mock devuelve el propio handler sin envolver nada,
// así el default export de src/proxy.ts termina siendo exactamente el
// callback que escribimos a mano — se invoca directo pasando un `req`
// simulado con `.auth` ya resuelto (lo que Auth.js habría inyectado tras
// verificar el JWT).
vi.mock("@/server/auth", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));

import proxyHandler from "@/proxy";

type SesionSimulada = { user: { id: string; rol: "GERENTE" | "OPERARIO" } } | null;

function fakeRequest(pathname: string, auth: SesionSimulada) {
  return {
    nextUrl: { pathname, origin: "http://localhost:3000" },
    auth,
    headers: new Headers(),
  } as unknown as Parameters<typeof proxyHandler>[0];
}

// El handler que auth() envuelve tiene la firma de middleware de Next
// (req, ctx) — el segundo argumento no se usa en la lógica de proxy.ts,
// pero hay que pasarlo para que el tipo cierre.
const FAKE_CTX = {} as unknown as Parameters<typeof proxyHandler>[1];

describe("guard por rol de src/proxy.ts (H1, Sprint 2)", () => {
  beforeEach(() => {
    verificarRateLimitAuthMock.mockReset().mockResolvedValue(true);
    verificarRateLimitOperativoMock.mockReset().mockResolvedValue(true);
  });

  it("responde 403 si un OPERARIO pide /usuarios", async () => {
    const req = fakeRequest("/usuarios", { user: { id: "u1", rol: "OPERARIO" } });

    const res = await proxyHandler(req, FAKE_CTX);

    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body).toEqual({ error: "No autorizado." });
  });

  it("deja pasar a un GERENTE en /usuarios", async () => {
    const req = fakeRequest("/usuarios", { user: { id: "g1", rol: "GERENTE" } });

    const res = await proxyHandler(req, FAKE_CTX);

    expect(res?.status).not.toBe(403);
  });

  it("no restringe por rol una ruta sin regla explícita en RUTAS_POR_ROL (p. ej. / u /operacion/recoleccion)", async () => {
    const req = fakeRequest("/", { user: { id: "u1", rol: "OPERARIO" } });

    const res = await proxyHandler(req, FAKE_CTX);

    expect(res?.status).not.toBe(403);
  });

  it("sin sesión, el guard binario de Sprint 1 redirige antes de llegar al chequeo de rol", async () => {
    const req = fakeRequest("/usuarios", null);

    const res = await proxyHandler(req, FAKE_CTX);

    expect(res?.status).not.toBe(403);
    expect(res?.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("respeta el rate limit de rutas operativas incluso para un GERENTE autorizado por rol", async () => {
    verificarRateLimitOperativoMock.mockResolvedValue(false);
    const req = fakeRequest("/usuarios", { user: { id: "g1", rol: "GERENTE" } });

    const res = await proxyHandler(req, FAKE_CTX);

    expect(res?.status).toBe(429);
  });
});
