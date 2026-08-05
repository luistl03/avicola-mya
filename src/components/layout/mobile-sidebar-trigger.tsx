import { SidebarTrigger } from "@/components/ui/sidebar";

// Botón flotante chico en vez de una barra superior completa — el mismo
// disparador (toggleSidebar) que el trigger de desktop, solo que acá abre
// el drawer en vez de colapsar el rail. Nada más: sin logo, sin texto, sin
// franja de fondo — solo el botón, para no repetir la marca dos veces en
// una pantalla angosta (el drawer ya trae el logo apenas se abre).
export function MobileSidebarTrigger() {
  return (
    <SidebarTrigger className="fixed top-3 left-3 z-30 rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden" />
  );
}
