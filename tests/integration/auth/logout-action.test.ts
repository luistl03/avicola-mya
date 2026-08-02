import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const signOutMock = vi.fn();
vi.mock("@/server/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
  signIn: vi.fn(),
}));

const revocarSesionMock = vi.fn();
vi.mock("@/server/repositories/sesion", () => ({
  revocarSesion: (...args: unknown[]) => revocarSesionMock(...args),
}));

import { logout } from "@/server/actions/auth";

describe("logout (Server Action)", () => {
  beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset();
    revocarSesionMock.mockReset();
  });

  it("revoca la SesionActiva cuando hay sesión con sesionId", async () => {
    authMock.mockResolvedValue({ sesionId: "sesion-id-de-prueba" });

    await logout();

    expect(revocarSesionMock).toHaveBeenCalledWith("sesion-id-de-prueba", expect.any(Date));
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("no intenta revocar nada si no hay sesión", async () => {
    authMock.mockResolvedValue(null);

    await logout();

    expect(revocarSesionMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
