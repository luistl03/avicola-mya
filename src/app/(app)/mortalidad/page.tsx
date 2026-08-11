import type { TipoMortalidad } from "@prisma/client";

import { MortalidadFiltros } from "@/components/domain/mortalidad/mortalidad-filtros";
import { MortalidadTabla } from "@/components/domain/mortalidad/mortalidad-tabla";
import { RegistrarMortalidadDialog } from "@/components/domain/mortalidad/registrar-mortalidad-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { listarLotesActivos, listarLotesParaFiltro } from "@/server/repositories/lote";
import { contarRegistrosMortalidad, listarRegistrosMortalidad } from "@/server/repositories/mortalidad";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

const TIPOS_VALIDOS: TipoMortalidad[] = ["MUERTE", "DESCARTE"];

function tipoValido(valor: string | undefined): TipoMortalidad | undefined {
  return TIPOS_VALIDOS.find((tipo) => tipo === valor);
}

// Mismo criterio que app/(app)/bitacora/page.tsx: searchParams es un
// límite de entrada externo (viene de la URL, no de una Server Action
// validada con Zod) — un valor manipulado a mano no puede filtrar por
// fuera de MUERTE/DESCARTE ni convertirse en una fecha inválida.
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

export default async function MortalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tipo?: string; loteId?: string; desde?: string; hasta?: string }>;
}) {
  // Sin guard de rol: a diferencia de usuarios/galpones/lotes/page.tsx
  // (que rechazan con notFound() si el rol no es GERENTE), esta pantalla
  // queda abierta a GERENTE y OPERARIO por igual — decisión de diseño
  // confirmada en spec.md. No hay entrada para /mortalidad en
  // server/auth/rbac.ts tampoco.
  const {
    page: pageParam,
    tipo: tipoParam,
    loteId: loteIdParam,
    desde: desdeParam,
    hasta: hastaParam,
  } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const tipo = tipoValido(tipoParam);
  // loteId no se valida contra idUuid() acá — es un filtro de lectura, no
  // una Server Action de mutación (mismo criterio que categoria/fecha en
  // Bitácora): un valor manipulado simplemente no matchea ningún registro
  // real, Prisma lo trata como cualquier otro string sin romper nada.
  const loteId = loteIdParam || undefined;
  const desde = inicioDeDiaEnLima(desdeParam);
  const hasta = finDeDiaEnLima(hastaParam);

  const filtrosPagina = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, tipo, loteId, desde, hasta };
  const filtrosConteo = { tipo, loteId, desde, hasta };

  const [registros, total, lotesActivos, lotesParaFiltro] = await Promise.all([
    listarRegistrosMortalidad(filtrosPagina),
    contarRegistrosMortalidad(filtrosConteo),
    listarLotesActivos(),
    listarLotesParaFiltro(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Mortalidad"
        actions={<RegistrarMortalidadDialog lotesActivos={lotesActivos} />}
      />
      <MortalidadFiltros
        tipo={tipoParam}
        loteId={loteIdParam}
        desde={desdeParam}
        hasta={hastaParam}
        lotes={lotesParaFiltro}
      />
      <MortalidadTabla registros={registros} />
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/mortalidad"
        filtros={{ tipo: tipoParam, loteId: loteIdParam, desde: desdeParam, hasta: hastaParam }}
      />
    </div>
  );
}
