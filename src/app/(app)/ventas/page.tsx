import type { MetodoPago } from "@prisma/client";

import { VentaFiltros } from "@/components/domain/ventas/venta-filtros";
import { VentasTabla } from "@/components/domain/ventas/ventas-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { buscarClientePorId } from "@/server/repositories/cliente";
import { contarVentas, listarVentas } from "@/server/repositories/venta";

// Mismo tamaño de página estándar que memory/convenciones.md fija para
// toda tabla de gestión del proyecto.
const PAGE_SIZE = 10;

const METODOS_VALIDOS: MetodoPago[] = ["EFECTIVO", "YAPE", "PLIN", "TRANSFERENCIA"];

function metodoPagoValido(valor: string | undefined): MetodoPago | undefined {
  return METODOS_VALIDOS.find((metodo) => metodo === valor);
}

// Mismo criterio que app/(app)/mortalidad/page.tsx: searchParams es un
// límite de entrada externo (viene de la URL, no de una Server Action
// validada con Zod) — un valor manipulado a mano simplemente no matchea
// ningún registro real, sin romper nada.
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

function hoyComoStringDeInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

// Sin guard de rol: igual que /pos/consolidacion/creditos, esta pantalla
// queda abierta a GERENTE y OPERARIO por igual. Sin entrada en
// server/auth/rbac.ts.
export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    clienteId?: string;
    metodoPago?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
    fecha?: string;
  }>;
}) {
  const {
    page: pageParam,
    clienteId: clienteIdParam,
    metodoPago: metodoPagoParam,
    tipo: tipoParam,
    desde: desdeParam,
    hasta: hastaParam,
    fecha: fechaParam,
  } = await searchParams;

  const page = Math.max(1, Number(pageParam) || 1);
  const clienteId = clienteIdParam || undefined;
  const metodoPago = metodoPagoValido(metodoPagoParam);
  const esCredito = tipoParam === "CONTADO" ? false : tipoParam === "CREDITO" ? true : undefined;

  // "Listado normal por la fecha de hoy, y luego con sus filtros
  // escoger" (pedido explícito del Product Owner): un /ventas completamente
  // bare (sin ningún filtro tocado) muestra solo las ventas de hoy. En
  // cuanto se toca CUALQUIER filtro de fecha (desde/hasta) o se pide
  // explícitamente "Ver todas las fechas" (?fecha=todas, ver VentaFiltros),
  // el default deja de aplicar.
  const viendoTodasLasFechas = fechaParam === "todas";
  const sinNingunFiltroDeFecha = !desdeParam && !hastaParam && !viendoTodasLasFechas;
  const hoy = hoyComoStringDeInput();
  const desde = viendoTodasLasFechas
    ? undefined
    : inicioDeDiaEnLima(sinNingunFiltroDeFecha ? hoy : desdeParam);
  const hasta = viendoTodasLasFechas
    ? undefined
    : finDeDiaEnLima(sinNingunFiltroDeFecha ? hoy : hastaParam);

  const filtros = { desde, hasta, clienteId, metodoPago, esCredito };

  const [ventas, total, clienteInicial] = await Promise.all([
    listarVentas({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, ...filtros }),
    contarVentas(filtros),
    clienteId ? buscarClientePorId(clienteId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Ventas" description="Historial de ventas del punto de venta." />
      <VentaFiltros
        clienteId={clienteIdParam}
        clienteInicial={clienteInicial ? { id: clienteInicial.id, nombre: clienteInicial.nombre } : null}
        metodoPago={metodoPagoParam}
        tipo={tipoParam}
        desde={sinNingunFiltroDeFecha ? hoy : desdeParam}
        hasta={sinNingunFiltroDeFecha ? hoy : hastaParam}
      />
      {sinNingunFiltroDeFecha ? (
        <p className="text-sm text-muted-foreground">Mostrando las ventas de hoy. Usa los filtros para ver otras fechas.</p>
      ) : null}
      {ventas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay ventas para los filtros aplicados.</p>
      ) : (
        <VentasTabla
          ventas={ventas.map((venta) => ({ ...venta, totalCobrado: Number(venta.totalCobrado) }))}
        />
      )}
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/ventas"
        filtros={{
          clienteId: clienteIdParam,
          metodoPago: metodoPagoParam,
          tipo: tipoParam,
          desde: desdeParam,
          hasta: hastaParam,
          fecha: fechaParam,
        }}
      />
    </div>
  );
}
