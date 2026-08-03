import { Home, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Sprints futuros van a ampliar esta lista a medida que existan pantallas
// reales bajo /operacion y /gestion (mortalidad, bitácora, recolección,
// galpones, clientes, etc.) — hoy solo existe /gestion/usuarios (S2-9).
// La visibilidad por rol no se repite acá con un campo `roles`: Sidebar y
// BottomNav filtran cada item contra rolPermitidoParaRuta() de
// server/auth/rbac.ts, el mismo mapeo que ya usa el guard de proxy.ts —
// así no hay dos listas de "qué rol ve qué ruta" que puedan desincronizarse.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/gestion/usuarios", label: "Usuarios", icon: Users },
];
