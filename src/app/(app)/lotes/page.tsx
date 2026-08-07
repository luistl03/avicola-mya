import { notFound } from "next/navigation";

import { LoteFormDialog } from "@/components/domain/lotes/lote-form-dialog";
import { LotesTabla } from "@/components/domain/lotes/lotes-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { auth } from "@/server/auth";
import { listarGalponesActivos } from "@/server/repositories/galpon";
import { contarLotes, listarLotesConUbicacion } from "@/server/repositories/lote";
import { calcularEdadEnSemanas } from "@/server/services/lote";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  // src/proxy.ts ya bloquea /lotes a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que usuarios/page.tsx y galpones/page.tsx.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [lotesCrudos, total, galponesActivos] = await Promise.all([
    listarLotesConUbicacion({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    contarLotes(),
    listarGalponesActivos(),
  ]);

  const ahora = new Date();
  // La edad se calcula acá (Server Component), no en el cliente: un lote
  // ACTIVO envejece contra "ahora"; uno INACTIVO queda congelado en la
  // fechaSalida de su última ubicación (el momento exacto en que
  // finalizarLote() la cerró) — ver calcularEdadEnSemanas en
  // server/services/lote.ts para el detalle completo de esta decisión.
  const lotes = lotesCrudos.map((lote) => {
    const ultimaUbicacion = lote.historialUbicaciones[0];
    const fechaReferencia =
      lote.estado === "ACTIVO" || !ultimaUbicacion?.fechaSalida
        ? ahora
        : ultimaUbicacion.fechaSalida;
    return {
      ...lote,
      edadSemanas: calcularEdadEnSemanas({
        edadInicialSemanas: lote.edadInicialSemanas,
        fechaIngreso: lote.fechaIngreso,
        fechaReferencia,
      }),
    };
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Lotes" actions={<LoteFormDialog galponesActivos={galponesActivos} />} />
      <LotesTabla lotes={lotes} galponesActivos={galponesActivos} />
      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/lotes" />
    </div>
  );
}
