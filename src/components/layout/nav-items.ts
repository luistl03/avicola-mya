import {
  Combine,
  Contact,
  CreditCard,
  Egg,
  History,
  Home,
  IdCard,
  Layers3,
  NotebookPen,
  ShoppingCart,
  Skull,
  Tag,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
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
  { href: "/galpones", label: "Galpones", icon: Warehouse },
  { href: "/lotes", label: "Lotes", icon: Layers3 },
  { href: "/mortalidad", label: "Mortalidad", icon: Skull },
  { href: "/bitacora", label: "Bitácora", icon: NotebookPen },
  { href: "/recoleccion", label: "Recolección", icon: Egg },
  { href: "/consolidacion", label: "Consolidación", icon: Combine },
  { href: "/clientes", label: "Clientes", icon: Contact },
  { href: "/precio-kilo", label: "Precio por Kilo", icon: Tag },
  { href: "/pos", label: "Punto de Venta", icon: ShoppingCart },
  { href: "/ventas", label: "Ventas", icon: History },
  { href: "/creditos", label: "Créditos", icon: CreditCard },
  { href: "/egresos", label: "Egresos", icon: Wallet },
  { href: "/personal", label: "Personal", icon: IdCard },
];
