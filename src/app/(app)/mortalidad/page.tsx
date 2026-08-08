import { MortalidadTabla } from "@/components/domain/mortalidad/mortalidad-tabla";
import { RegistrarMortalidadDialog } from "@/components/domain/mortalidad/registrar-mortalidad-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { listarLotesActivos } from "@/server/repositories/lote";
import { contarRegistrosMortalidad, listarRegistrosMortalidad } from "@/server/repositories/mortalidad";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

export default async function MortalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Sin guard de rol: a diferencia de usuarios/galpones/lotes/page.tsx
  // (que rechazan con notFound() si el rol no es GERENTE), esta pantalla
  // queda abierta a GERENTE y OPERARIO por igual — decisión de diseño
  // confirmada en spec.md. No hay entrada para /mortalidad en
  // server/auth/rbac.ts tampoco.
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [registros, total, lotesActivos] = await Promise.all([
    listarRegistrosMortalidad({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    contarRegistrosMortalidad(),
    listarLotesActivos(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Mortalidad"
        actions={<RegistrarMortalidadDialog lotesActivos={lotesActivos} />}
      />
      <MortalidadTabla registros={registros} />
      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/mortalidad" />
    </div>
  );
}
