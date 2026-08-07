import { notFound } from "next/navigation";

import { GalponFormDialog } from "@/components/domain/galpones/galpon-form-dialog";
import { GalponesTabla } from "@/components/domain/galpones/galpones-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { auth } from "@/server/auth";
import { contarGalpones, listarGalponesConOcupacion } from "@/server/repositories/galpon";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto (ver app/(app)/usuarios/page.tsx).
const PAGE_SIZE = 10;

export default async function GalponesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  // src/proxy.ts ya bloquea /galpones a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que usuarios/page.tsx.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [galpones, total] = await Promise.all([
    listarGalponesConOcupacion({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    contarGalpones(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Galpones" actions={<GalponFormDialog modo="crear" />} />
      <GalponesTabla galpones={galpones} />
      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/galpones" />
    </div>
  );
}
