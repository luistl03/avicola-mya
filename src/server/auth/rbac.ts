import type { Rol } from "@prisma/client";

// Compartido entre src/proxy.ts (guard por rol) y el Shell (Sidebar, desktop
// y mobile) para no mantener en dos lugares distintos qué rutas ve cada rol.
export const RUTAS_POR_ROL: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: "/gestion", roles: ["GERENTE"] },
  { prefijo: "/operacion", roles: ["GERENTE", "OPERARIO"] },
];

export function rolPermitidoParaRuta(pathname: string, rol: Rol): boolean {
  const regla = RUTAS_POR_ROL.find(({ prefijo }) => pathname.startsWith(prefijo));
  if (!regla) return true;
  return regla.roles.includes(rol);
}
