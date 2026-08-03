"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@prisma/client";

import { LogoutButton } from "@/components/domain/auth/logout-button";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import { rolPermitidoParaRuta } from "@/server/auth/rbac";

export function Sidebar({ rol }: { rol: Rol }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => rolPermitidoParaRuta(item.href, rol));

  return (
    <aside className="hidden w-56 shrink-0 flex-col justify-between border-r bg-card p-4 md:flex">
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const activo = pathname === item.href;
          const Icono = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                activo ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
            >
              <Icono className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <LogoutButton />
    </aside>
  );
}
