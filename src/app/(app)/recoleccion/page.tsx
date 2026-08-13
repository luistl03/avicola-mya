import { AjustarInventarioSueltosDialog } from "@/components/domain/inventario/ajustar-inventario-sueltos-dialog";
import { RecoleccionFiltros } from "@/components/domain/recoleccion/recoleccion-filtros";
import { RecoleccionesTabla } from "@/components/domain/recoleccion/recolecciones-tabla";
import { RegistrarRecoleccionDialog } from "@/components/domain/recoleccion/registrar-recoleccion-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { auth } from "@/server/auth";
import { listarLotesActivos, listarLotesParaFiltro } from "@/server/repositories/lote";
import { contarRecolecciones, listarRecolecciones } from "@/server/repositories/recoleccion";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

// Mismo criterio que app/(app)/mortalidad/page.tsx: searchParams es un
// límite de entrada externo, un valor manipulado a mano no puede
// convertirse en una fecha inválida que rompa la query de Prisma.
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

export default async function RecoleccionPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; loteId?: string; desde?: string; hasta?: string }>;
}) {
  // Sin guard de rol: igual que /mortalidad y /bitacora, esta pantalla
  // queda abierta a GERENTE y OPERARIO por igual (decisión de diseño
  // confirmada en spec.md). Sin entrada en server/auth/rbac.ts.
  const { page: pageParam, loteId: loteIdParam, desde: desdeParam, hasta: hastaParam } =
    await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const loteId = loteIdParam || undefined;
  const desde = inicioDeDiaEnLima(desdeParam);
  const hasta = finDeDiaEnLima(hastaParam);

  const filtrosPagina = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, loteId, desde, hasta };
  const filtrosConteo = { loteId, desde, hasta };

  const [registros, total, lotesActivos, lotesParaFiltro, session] = await Promise.all([
    listarRecolecciones(filtrosPagina),
    contarRecolecciones(filtrosConteo),
    listarLotesActivos(),
    listarLotesParaFiltro(),
    auth(),
  ]);

  // Ajuste manual del Gerente (Sprint 6): visible solo cuando
  // session.user.rol === "GERENTE" — chequeo hecho acá, en el Server
  // Component, no con un hook de sesión en cliente (auth() solo se llama
  // en servidor en todo el proyecto). withAuth (rol: "GERENTE" en
  // server/actions/inventario.ts) es la defensa real; esto es solo para
  // no mostrarle a un Operario un botón que el servidor siempre rechaza.
  const esGerente = session?.user?.rol === "GERENTE";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Recolección"
        actions={
          <>
            {esGerente ? <AjustarInventarioSueltosDialog lotesActivos={lotesActivos} /> : null}
            <RegistrarRecoleccionDialog lotesActivos={lotesActivos} />
          </>
        }
      />
      <RecoleccionFiltros
        loteId={loteIdParam}
        desde={desdeParam}
        hasta={hastaParam}
        lotes={lotesParaFiltro}
      />
      <RecoleccionesTabla registros={registros} />
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/recoleccion"
        filtros={{ loteId: loteIdParam, desde: desdeParam, hasta: hastaParam }}
      />
    </div>
  );
}
