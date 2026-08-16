import { EstadoCuentaCliente } from "@/components/domain/creditos/estado-cuenta-cliente";
import { PanelAlertas } from "@/components/domain/creditos/panel-alertas";
import { PageHeader } from "@/components/layout/page-header";
import { hoyEnLima } from "@/lib/zod/comun";
import { listarCreditosPendientesConCliente } from "@/server/repositories/credito";

// Sin guard de rol: igual que /pos/consolidacion/recoleccion, esta
// pantalla queda abierta a GERENTE y OPERARIO por igual (decisión 10,
// spec.md). Sin entrada en server/auth/rbac.ts.
export default async function CreditosPage() {
  const creditosPendientes = await listarCreditosPendientesConCliente();
  // hoyEnLima() (D5), no new Date() crudo — Credito.fechaLimite es una
  // fecha-calendario anclada a medianoche UTC (mismo criterio que
  // hoyEnLima()); comparar contra la hora real del servidor podía dar un
  // nivel de alerta desfasado un día en la ventana 00:00-05:00 UTC (donde
  // en Lima todavía es "ayer") — mismo tipo de bug que "fechaIngreso
  // aceptaba fechas futuras" (Sprint 3, Bug 4). Encontrado real en S11-20.
  const hoy = hoyEnLima();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Créditos" description="Alertas por antigüedad y estado de cuenta por cliente." />

      <PanelAlertas
        // Decimal de Prisma nunca cruza el límite Server→Client Component
        // (mismo criterio que app/(app)/pos/page.tsx, Sprint 9) — se
        // convierte a number acá antes de pasarlo. PanelAlertas/TarjetaCredito
        // no son Client Components, pero se mantiene el mismo criterio de
        // conversión temprana para no arrastrar Decimal más allá del
        // repository.
        creditos={creditosPendientes.map((credito) => ({
          id: credito.id,
          clienteNombre: credito.cliente.nombre,
          montoTotal: Number(credito.montoTotal),
          montoPagado: Number(credito.montoPagado),
          fechaLimite: credito.fechaLimite,
        }))}
        hoy={hoy}
      />

      <EstadoCuentaCliente />
    </div>
  );
}
