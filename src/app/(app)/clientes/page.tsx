import type { TipoCliente } from "@prisma/client";

import { ClienteFiltros } from "@/components/domain/clientes/cliente-filtros";
import { ClienteFormDialog } from "@/components/domain/clientes/cliente-form-dialog";
import { ClientesTabla } from "@/components/domain/clientes/clientes-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { contarClientes, listarClientes } from "@/server/repositories/cliente";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

const TIPOS_VALIDOS: TipoCliente[] = ["MAYORISTA", "MINORISTA", "EVENTUAL"];

// Mismo criterio que tipoValido() en app/(app)/mortalidad/page.tsx:
// searchParams es un límite de entrada externo (viene de la URL, no de una
// Server Action validada con Zod) — un valor manipulado a mano no puede
// filtrar por fuera de los 3 valores reales de TipoCliente.
function tipoValido(valor: string | undefined): TipoCliente | undefined {
  return TIPOS_VALIDOS.find((tipo) => tipo === valor);
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; busqueda?: string; tipo?: string }>;
}) {
  // Sin guard de rol: /clientes queda abierta a GERENTE y OPERARIO por
  // igual (decisión de negocio 1, spec.md) — no hay entrada para
  // /clientes en server/auth/rbac.ts.
  const { page: pageParam, busqueda: busquedaParam, tipo: tipoParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const busqueda = busquedaParam?.trim() || undefined;
  const tipo = tipoValido(tipoParam);

  const [clientes, total] = await Promise.all([
    listarClientes({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, busqueda, tipo }),
    contarClientes({ busqueda, tipo }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Clientes" actions={<ClienteFormDialog modo="crear" />} />
      <ClienteFiltros busqueda={busquedaParam} tipo={tipoParam} />
      <ClientesTabla clientes={clientes} />
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/clientes"
        filtros={{ busqueda: busquedaParam, tipo: tipoParam }}
      />
    </div>
  );
}
