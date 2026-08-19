import { notFound } from "next/navigation";

import { ActualizarPrecioDialog } from "@/components/domain/precio-kilo/actualizar-precio-dialog";
import { PrecioKiloTabla } from "@/components/domain/precio-kilo/precio-kilo-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { auth } from "@/server/auth";
import {
  contarPrecioKilo,
  listarPrecioKilo,
  obtenerPrecioKiloVigente,
} from "@/server/repositories/precioKilo";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

export default async function PrecioKiloPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  // src/proxy.ts ya bloquea /precio-kilo a quien no sea GERENTE (403, ver
  // server/auth/rbac.ts) — esto es una segunda capa de defensa, mismo
  // criterio que galpones/page.tsx, lotes/page.tsx, usuarios/page.tsx.
  if (session?.user?.rol !== "GERENTE") {
    notFound();
  }

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [vigente, precios, total] = await Promise.all([
    obtenerPrecioKiloVigente(),
    listarPrecioKilo({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    contarPrecioKilo(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Precio por Kilo" actions={<ActualizarPrecioDialog />} />
      {vigente ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">Precio vigente</p>
          <p className="text-3xl font-semibold text-foreground">S/ {Number(vigente.precio).toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">
            Fijado por {vigente.usuario.nombre} el{" "}
            {vigente.vigenteDesde.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay ningún precio fijado.</p>
      )}

      {total > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">Historial de precios</h2>
          <PrecioKiloTabla
            precios={precios.map((precio) => ({ ...precio, precio: Number(precio.precio) }))}
          />
          <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/precio-kilo" />
        </div>
      ) : null}
    </div>
  );
}
