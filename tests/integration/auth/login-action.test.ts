import { beforeEach, describe, expect, it, vi } from "vitest";

// Clase local que hace las veces de next-auth's AuthError: src/server/actions/auth.ts
// la importa a través de @/server/auth, que acá mockeamos entero — así el test
// nunca carga el paquete real de next-auth (que internamente requiere next/server,
// solo resoluble dentro del runtime de Next, no en Vitest/Node plano).
// vi.hoisted es necesario porque las factories de vi.mock se izan por
// encima de cualquier declaración normal del archivo.
const { AuthError, signInMock } = vi.hoisted(() => {
  class AuthError extends Error {}
  return { AuthError, signInMock: vi.fn() };
});

vi.mock("@/server/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  auth: vi.fn(),
  signOut: vi.fn(),
  AuthError,
}));

vi.mock("@/server/repositories/sesion", () => ({
  revocarSesion: vi.fn(),
}));

import { login } from "@/server/actions/auth";

function formDataDe(usuario: string, password: string): FormData {
  const formData = new FormData();
  formData.set("usuario", usuario);
  formData.set("password", password);
  return formData;
}

describe("login (Server Action)", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("no llama a signIn si el input no pasa el schema Zod", async () => {
    const resultado = await login("/", undefined, formDataDe("", ""));

    expect(resultado).toEqual({ error: "Usuario o contraseña incorrectos." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("devuelve el mismo mensaje genérico si signIn lanza un AuthError", async () => {
    signInMock.mockRejectedValue(new AuthError("CredentialsSignin"));

    const resultado = await login("/", undefined, formDataDe("gerente", "mala-clave"));

    expect(resultado).toEqual({ error: "Usuario o contraseña incorrectos." });
  });

  it("re-lanza cualquier error que no sea AuthError (p.ej. el redirect interno de Next)", async () => {
    class OtroError extends Error {}
    signInMock.mockRejectedValue(new OtroError("NEXT_REDIRECT"));

    await expect(login("/", undefined, formDataDe("gerente", "Cambiar123!"))).rejects.toThrow(
      "NEXT_REDIRECT"
    );
  });

  it("llama a signIn con las credenciales parseadas y el callbackUrl", async () => {
    signInMock.mockResolvedValue(undefined);

    await login("/dashboard", undefined, formDataDe("gerente", "Cambiar123!"));

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      usuario: "gerente",
      password: "Cambiar123!",
      redirectTo: "/dashboard",
    });
  });
});
