import { SidebarTrigger } from "@/components/ui/sidebar";

// Vive dentro del flujo del encabezado de cada página (ver PageHeader), no
// flotando "fixed" sobre el contenido — un botón fijo en una esquina se
// terminaba superponiendo con el título de cada pantalla nueva. El mismo
// disparador (toggleSidebar) que el trigger de desktop, solo que acá abre
// el drawer en vez de colapsar el rail.
export function MobileSidebarTrigger() {
  return (
    <SidebarTrigger className="shrink-0 rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden" />
  );
}
