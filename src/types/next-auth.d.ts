import type { Rol } from "@prisma/client";

declare module "next-auth" {
  interface User {
    usuario: string;
    nombre: string;
    rol: Rol;
  }

  interface Session {
    /**
     * Id de la fila SesionActiva correlacionada con este JWT. NO se llama
     * `jti`: Auth.js sobreescribe ese claim con un UUID propio en cada
     * encode() (ver `.setJti(crypto.randomUUID())` en @auth/core/src/jwt.ts),
     * así que cualquier valor custom asignado a `token.jti` en el callback
     * `jwt` se descarta en silencio antes de llegar a la cookie real.
     */
    sesionId?: string;
  }
}

// next-auth/jwt.d.ts solo re-exporta ("export *") la interfaz JWT declarada en
// @auth/core/jwt — un re-export no participa en el declaration merging, así
// que hay que augmentar ambos módulos o el `token` de los callbacks tipa sus
// props custom como `unknown` en vez de string/Rol.
declare module "next-auth/jwt" {
  interface JWT {
    usuarioId: string;
    usuario: string;
    nombre: string;
    rol: Rol;
    sesionId: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    usuarioId: string;
    usuario: string;
    nombre: string;
    rol: Rol;
    sesionId: string;
  }
}
