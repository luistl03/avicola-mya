import type { Rol } from "@prisma/client";

// Compartido entre src/proxy.ts (guard por rol) y el Shell (Sidebar, desktop
// y mobile) para no mantener en dos lugares distintos qué rutas ve cada rol.
//
// Regla por ruta exacta de la pantalla, NO por un prefijo compartido tipo
// "/gestion"/"/operacion" (eso era Sprint 2 — se abandonó a propósito para
// poder tener URLs planas como /usuarios). `startsWith` sigue soportando
// subrutas futuras de una misma pantalla (p. ej. /usuarios/nuevo heredaría
// esta misma regla sin necesitar una entrada aparte).
//
// Cualquier ruta que NO aparezca acá queda abierta a cualquier rol
// autenticado — por eso solo hace falta listar las pantallas que deben
// restringirse a un subconjunto de roles, no todas.
export const RUTAS_POR_ROL: { ruta: string; roles: Rol[] }[] = [
  { ruta: "/usuarios", roles: ["GERENTE"] },
  { ruta: "/galpones", roles: ["GERENTE"] },
  { ruta: "/lotes", roles: ["GERENTE"] },
  { ruta: "/precio-kilo", roles: ["GERENTE"] }, // NUEVO Sprint 8
  { ruta: "/egresos", roles: ["GERENTE"] }, // NUEVO Sprint 12
  { ruta: "/personal", roles: ["GERENTE"] }, // NUEVO Sprint 12
];

export function rolPermitidoParaRuta(pathname: string, rol: Rol): boolean {
  const regla = RUTAS_POR_ROL.find(({ ruta }) => pathname.startsWith(ruta));
  if (!regla) return true;
  return regla.roles.includes(rol);
}
