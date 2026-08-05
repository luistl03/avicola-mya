"use server";

import { loginSchema } from "@/lib/zod/auth";
import { AuthError, auth, signIn, signOut } from "@/server/auth";
import { revocarSesion } from "@/server/repositories/sesion";

export type LoginState = { error: string } | undefined;

export async function login(
  callbackUrl: string,
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    usuario: formData.get("usuario"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  try {
    await signIn("credentials", {
      usuario: parsed.data.usuario,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Usuario o contraseña incorrectos." };
    }
    throw error;
  }
}

export async function logout() {
  const session = await auth();
  if (session?.sesionId) {
    await revocarSesion(session.sesionId, new Date());
  }
  await signOut({ redirectTo: "/login" });
}
