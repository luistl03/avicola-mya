"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Rol } from "@prisma/client";

import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import { logout } from "@/server/actions/auth";
import { rolPermitidoParaRuta } from "@/server/auth/rbac";

export function BottomNav({ rol }: { rol: Rol }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => rolPermitidoParaRuta(item.href, rol));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card md:hidden">
      {items.map((item) => {
        const activo = pathname === item.href;
        const Icono = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            // min-h-12 = 48px: target táctil mínimo (memory/stack-tecnologico.md)
            className={cn(
              "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium",
              activo ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Icono className="size-5" />
            {item.label}
          </Link>
        );
      })}
      <form action={logout} className="flex flex-1">
        <button
          type="submit"
          className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-muted-foreground"
        >
          <LogOut className="size-5" />
          Salir
        </button>
      </form>
    </nav>
  );
}
