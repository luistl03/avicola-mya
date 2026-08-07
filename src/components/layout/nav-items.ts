import { Home, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Sprints futuros van a ampliar esta lista a medida que existan pantallas
// reales (mortalidad, bitácora, recolección, galpones, clientes, etc.) —
// hoy solo existe /usuarios (S2-9). URLs planas a propósito (sin prefijo
// tipo /gestion o /operacion) — ver rbac.ts para el porqué. La visibilidad
// por rol no se repite acá con un campo `roles`: el Sidebar (un solo
// componente para desktop y mobile, ver components/layout/sidebar.tsx)
// filtra cada item contra rolPermitidoParaRuta() de server/auth/rbac.ts, el
// mismo mapeo que ya usa el guard de proxy.ts — así no hay dos listas de
// "qué rol ve qué ruta" que puedan desincronizarse.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/usuarios", label: "Usuarios", icon: Users },
];
