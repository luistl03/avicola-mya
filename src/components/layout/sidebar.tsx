"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@prisma/client";

import { LogoutButton } from "@/components/domain/auth/logout-button";
import { ConnectivityIndicator } from "@/components/domain/pwa/connectivity-indicator";
import { InstallAppButton } from "@/components/domain/pwa/install-app-button";
import { IosInstallButton } from "@/components/domain/pwa/ios-install-button";
import { PANTALLAS_DE_CAMPO } from "@/components/domain/pwa/precargar-catalogos";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { rolPermitidoParaRuta } from "@/server/auth/rbac";

const ROL_LABEL: Record<Rol, string> = {
  GERENTE: "Gerente",
  OPERARIO: "Operario",
};

// Un solo componente para desktop (rail colapsable) y mobile (drawer):
// <Sidebar collapsible="icon"> decide sola qué markup usar según
// useIsMobile() — acá solo describimos el contenido una vez.
export function AppSidebar({ rol, nombre }: { rol: Rol; nombre: string }) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const items = NAV_ITEMS.filter((item) => rolPermitidoParaRuta(item.href, rol));
  // "Colapsado" es un concepto solo de desktop (rail de íconos). En mobile
  // el drawer siempre muestra el contenido completo — sin el guard de
  // isMobile acá, si el desktop quedaba colapsado, el drawer mobile heredaba
  // ese mismo `state` y mostraba el pie compacto también ahí (bug real).
  const colapsado = !isMobile && state === "collapsed";

  return (
    <SidebarPrimitive collapsible="icon">
      <SidebarHeader className="items-center gap-2 border-b border-sidebar-border py-3">
        {/* Sin botón visible de despliegue a propósito: expandir/colapsar en
            desktop es implícito, vía SidebarRail (clic en el borde del
            propio Sidebar, más abajo) — no hace falta un ícono aparte. */}
        {/* Mismo lenguaje que las tarjetas de módulos (rounded-xl border
            bg-card shadow-sm): un solo card blanco para ícono + texto, para
            que el encabezado se distinga del resto del sidebar naranja. De
            paso resuelve lo del PNG sin canal alfa (fondo horneado) — ya no
            hace falta una insignia aparte solo para el ícono. */}
        <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card p-2 shadow-sm transition-all group-data-[collapsible=icon]:p-1.5">
          {/* Isotipo (solo símbolo) mientras hay texto al lado; colapsado,
              sin texto visible, se cambia al imagotipo (símbolo + nombre en
              la propia imagen) para que el cuadrito solo siga identificando
              la marca. */}
          <Image
            src="/avicolamya-isotipo.png"
            alt=""
            width={72}
            height={72}
            priority
            className="size-9 shrink-0 group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/avicolamya-imagotipo.png"
            alt="Avícola M&A"
            width={72}
            height={72}
            priority
            className="hidden size-9 shrink-0 group-data-[collapsible=icon]:block group-data-[collapsible=icon]:size-6"
          />
          <span className="truncate font-heading text-base font-semibold text-card-foreground group-data-[collapsible=icon]:hidden">
            Avícola M&A
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="gap-1 p-2">
          {items.map((item) => {
            const activo = pathname === item.href;
            const Icono = item.icon;
            // Sprint 13: Next prefetchea automáticamente cualquier <Link>
            // visible en viewport, y el Service Worker cachea esa
            // respuesta — sin acotarlo, TODAS las pantallas del Sidebar
            // (gestión incluida) quedarían precacheadas solo por estar en
            // el menú, contradiciendo la decisión de negocio 1 (hallazgo
            // real de la verificación en vivo de S13-13, ver plan.md).
            const esPantallaDeCampo = PANTALLAS_DE_CAMPO.includes(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={activo}
                  tooltip={item.label}
                  size="lg"
                  render={<Link href={item.href} prefetch={esPantallaDeCampo} />}
                >
                  <Icono />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border p-4">
        {!colapsado && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{nombre}</span>
            <span className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70">
              {ROL_LABEL[rol]}
              <ConnectivityIndicator />
            </span>
          </div>
        )}
        {!colapsado && (
          <div className="flex flex-col gap-2">
            <InstallAppButton />
            <IosInstallButton />
          </div>
        )}
        <div className={colapsado ? "flex justify-center" : undefined}>
          <LogoutButton iconOnly={colapsado} />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </SidebarPrimitive>
  );
}
