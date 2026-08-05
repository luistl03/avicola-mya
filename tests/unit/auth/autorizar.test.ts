import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { autorizarCredenciales } from "@/server/auth/autorizar";

import { makeUsuario } from "../../factories";

const buscarUsuarioPorUsuarioMock = vi.fn();
vi.mock("@/server/repositories/usuario", () => ({
  buscarUsuarioPorUsuario: (usuario: string) => buscarUsuarioPorUsuarioMock(usuario),
}));

// Cost factor bajo (4, no el 12 de producción) — más rápido, la lógica
// de comparación que se prueba acá es la misma.
const PASSWORD = "Cambiar123!";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

describe("autorizarCredenciales", () => {
  beforeEach(() => {
    buscarUsuarioPorUsuarioMock.mockReset();
  });

  it("devuelve null si las credenciales no pasan el schema Zod", async () => {
    const resultado = await autorizarCredenciales({ usuario: "", password: "" });
    expect(resultado).toBeNull();
    expect(buscarUsuarioPorUsuarioMock).not.toHaveBeenCalled();
  });

  it("devuelve null si el usuario no existe", async () => {
    buscarUsuarioPorUsuarioMock.mockResolvedValue(null);
    const resultado = await autorizarCredenciales({ usuario: "inexistente", password: PASSWORD });
    expect(resultado).toBeNull();
  });

  it("devuelve null si el usuario está INACTIVO, aunque la contraseña sea correcta", async () => {
    const usuario = makeUsuario({ estado: "INACTIVO", passwordHash: PASSWORD_HASH });
    buscarUsuarioPorUsuarioMock.mockResolvedValue(usuario);

    const resultado = await autorizarCredenciales({ usuario: usuario.usuario, password: PASSWORD });
    expect(resultado).toBeNull();
  });

  it("devuelve null si la contraseña no coincide", async () => {
    const usuario = makeUsuario({ passwordHash: PASSWORD_HASH });
    buscarUsuarioPorUsuarioMock.mockResolvedValue(usuario);

    const resultado = await autorizarCredenciales({
      usuario: usuario.usuario,
      password: "otra-clave",
    });
    expect(resultado).toBeNull();
  });

  it("devuelve los datos del usuario si usuario y contraseña son correctos", async () => {
    const usuario = makeUsuario({ passwordHash: PASSWORD_HASH });
    buscarUsuarioPorUsuarioMock.mockResolvedValue(usuario);

    const resultado = await autorizarCredenciales({ usuario: usuario.usuario, password: PASSWORD });
    expect(resultado).toEqual({
      id: usuario.id,
      usuario: usuario.usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
  });
});
