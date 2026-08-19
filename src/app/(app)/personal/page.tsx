import Link from "next/link";
import type { EstadoEmpleado } from "@prisma/client";

import { EmpleadoFormDialog } from "@/components/domain/personal/empleado-form-dialog";
import { EmpleadosTabla } from "@/components/domain/personal/empleados-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { cn } from "@/lib/utils";
import { contarEmpleados, listarEmpleados } from "@/server/repositories/empleado";

const PAGE_SIZE = 10;

const ESTADOS_VALIDOS: EstadoEmpleado[] = ["ACTIVO", "INACTIVO"];

function estadoValido(valor: string | undefined): EstadoEmpleado | undefined {
  return ESTADOS_VALIDOS.find((estado) => estado === valor);
}

// Filtro simple de estado (plan.md: "filtro simple de estado", sin el
// panel colapsable de MortalidadFiltros/EgresoFiltros — solo 2 valores,
// no amerita esa infraestructura) — tres links planos, Server Component
// puro, mismo espíritu que PaginaLink de DataTablePagination.
function FiltroEstado({ estado }: { estado?: EstadoEmpleado }) {
  const opciones: { valor: EstadoEmpleado | undefined; label: string }[] = [
    { valor: undefined, label: "Todos" },
    { valor: "ACTIVO", label: "Activos" },
    { valor: "INACTIVO", label: "Inactivos" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {opciones.map((opcion) => (
        <Link
          key={opcion.label}
          href={opcion.valor ? `/personal?estado=${opcion.valor}` : "/personal"}
          className={cn(
            buttonVariants({ variant: estado === opcion.valor ? "default" : "outline", size: "sm" }),
          )}
        >
          {opcion.label}
        </Link>
      ))}
    </div>
  );
}

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; estado?: string }>;
}) {
  // Sin guard de rol acá adentro: server/auth/rbac.ts restringe
  // /personal a GERENTE (S12-18), mismo criterio que /egresos.
  const { page: pageParam, estado: estadoParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const estado = estadoValido(estadoParam);

  const [empleados, total] = await Promise.all([
    listarEmpleados({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, estado }),
    contarEmpleados({ estado }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Personal" actions={<EmpleadoFormDialog modo="crear" />} />
      <FiltroEstado estado={estado} />
      <EmpleadosTabla empleados={empleados} />
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/personal"
        filtros={{ estado: estadoParam }}
      />
    </div>
  );
}
