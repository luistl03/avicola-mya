import type { ReactNode } from "react";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

// Encabezado estándar de toda pantalla del Shell (Usuarios hoy; Galpones,
// Clientes, etc. en sprints futuros) — un solo componente para que el
// trigger del Sidebar mobile quede en el flujo, a la izquierda del
// título, en vez de flotar "fixed" encima de él (motivo del cambio: se
// superponía con el título en mobile). Cada página nueva lo hereda con una
// línea en vez de repetir este layout a mano.
//
// flex-col por defecto, sm:flex-row recién desde 640px: el título y las
// acciones (ej. "Nuevo usuario") compiten por una sola fila angosta en
// mobile — como el botón no puede partir su texto en dos líneas
// (whitespace-nowrap), sin este quiebre explícito termina empujando el
// layout hacia la derecha y forzando scroll horizontal de toda la
// pantalla, no solo del botón. Con flex-col, "acciones" cae a su propia
// fila completa en vez de eso — no depende de que el navegador decida
// "justo" en qué ancho envolver, es una decisión explícita por breakpoint.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <MobileSidebarTrigger />
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
