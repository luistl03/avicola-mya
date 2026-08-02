import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { autorizarCredenciales } from "@/server/auth/autorizar";
import { crearSesion } from "@/server/repositories/sesion";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        usuario: {},
        password: {},
      },
      authorize: autorizarCredenciales,
    }),
  ],
  callbacks: {
    // No hay callback `authorized` acá: next-auth solo lo usa para decidir
    // el redirect automático cuando NO se provee un middleware propio en
    // src/proxy.ts. Como sí proveemos uno (para el rate limiting), la rama
    // de `authorized` queda muerta — el guard de sesión y el rate limit se
    // manejan juntos, a mano, dentro de src/proxy.ts.
    async jwt({ token, user }) {
      if (user && user.id) {
        token.usuarioId = user.id;
        token.usuario = user.usuario;
        token.nombre = user.nombre;
        token.rol = user.rol;
        // No usar `token.jti`: Auth.js sobreescribe ese claim con su propio
        // UUID en encode() (.setJti(crypto.randomUUID())), descartando en
        // silencio cualquier valor custom asignado acá — ver el comentario
        // en src/types/next-auth.d.ts. `sesionId` es un campo propio, sin
        // colisión con claims que la librería maneja internamente.
        token.sesionId = crypto.randomUUID();
        await crearSesion(user.id, token.sesionId);
      }
      return token;
    },
    async session({ session, token }) {
      session.sesionId = token.sesionId;
      if (session.user) {
        session.user.id = token.usuarioId;
        session.user.usuario = token.usuario;
        session.user.nombre = token.nombre;
        session.user.rol = token.rol;
      }
      return session;
    },
  },
};
