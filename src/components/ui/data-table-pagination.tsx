import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DataTablePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
};

// Componente único para la paginación de toda tabla de datos del proyecto
// (Usuarios hoy; Clientes/Ventas/Créditos/Egresos en sprints futuros) — un
// cambio de estilo o de criterio se hace acá una sola vez, no módulo por
// módulo. Server Component puro (sin "use client"): la página es un
// <Link href="?page=N">, no estado de cliente — funciona sin JS y es
// coherente con el resto del proyecto (Server Actions, forms progresivos).
export function DataTablePagination({ page, pageSize, total, basePath }: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Solo aparece si hay más datos que los que entran en una página —
  // con pocos registros (la mayoría de los módulos de esta granja, la
  // mayor parte del tiempo) no ocupa espacio en pantalla.
  if (totalPages <= 1) {
    return null;
  }

  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
    >
      <p className="text-sm text-muted-foreground">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-2">
        <PaginaLink
          href={`${basePath}?page=${page - 1}`}
          disabled={page <= 1}
          ariaLabel="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </PaginaLink>
        <span className="text-sm text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <PaginaLink
          href={`${basePath}?page=${page + 1}`}
          disabled={page >= totalPages}
          ariaLabel="Página siguiente"
        >
          <ChevronRight className="size-4" />
        </PaginaLink>
      </div>
    </nav>
  );
}

function PaginaLink({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href: string;
  disabled: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  const className = cn(buttonVariants({ variant: "outline", size: "icon-sm" }));

  if (disabled) {
    return (
      <span aria-hidden className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
