import type { CategoriaEgreso } from "@prisma/client";

import { EgresoFiltros } from "@/components/domain/egresos/egreso-filtros";
import { EgresoFormDialog } from "@/components/domain/egresos/egreso-form-dialog";
import { EgresosTabla } from "@/components/domain/egresos/egresos-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { contarEgresos, listarEgresos } from "@/server/repositories/egreso";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

const CATEGORIAS_VALIDAS: CategoriaEgreso[] = [
  "ALIMENTOS",
  "INSUMOS_VACUNAS",
  "SERVICIOS",
  "MANTENIMIENTO",
  "VARIOS",
];

function categoriaValida(valor: string | undefined): CategoriaEgreso | undefined {
  return CATEGORIAS_VALIDAS.find((categoria) => categoria === valor);
}

// Mismo criterio que app/(app)/mortalidad/page.tsx: searchParams es un
// límite de entrada externo (viene de la URL, no de una Server Action
// validada con Zod) — un valor manipulado a mano no puede filtrar por
// fuera de las 5 categorías reales ni convertirse en una fecha inválida.
function inicioDeDiaEnLima(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const fecha = new Date(`${valor}T00:00:00.000-05:00`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

function finDeDiaEnLima(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const fecha = new Date(`${valor}T23:59:59.999-05:00`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

export default async function EgresosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; categoria?: string; desde?: string; hasta?: string }>;
}) {
  // Sin guard de rol acá adentro: server/auth/rbac.ts ya restringe
  // /egresos a GERENTE (S12-18) — el guard real vive en proxy.ts, esta
  // página no necesita repetirlo (mismo criterio que /usuarios,
  // /galpones, /lotes, /precio-kilo).
  const {
    page: pageParam,
    categoria: categoriaParam,
    desde: desdeParam,
    hasta: hastaParam,
  } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const categoria = categoriaValida(categoriaParam);
  const desde = inicioDeDiaEnLima(desdeParam);
  const hasta = finDeDiaEnLima(hastaParam);

  const filtrosPagina = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, categoria, desde, hasta };
  const filtrosConteo = { categoria, desde, hasta };

  const [egresos, total] = await Promise.all([
    listarEgresos(filtrosPagina),
    contarEgresos(filtrosConteo),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Egresos" actions={<EgresoFormDialog modo="crear" />} />
      <EgresoFiltros categoria={categoriaParam} desde={desdeParam} hasta={hastaParam} />
      <EgresosTabla
        egresos={egresos.map((egreso) => ({ ...egreso, monto: Number(egreso.monto) }))}
      />
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/egresos"
        filtros={{ categoria: categoriaParam, desde: desdeParam, hasta: hastaParam }}
      />
    </div>
  );
}
