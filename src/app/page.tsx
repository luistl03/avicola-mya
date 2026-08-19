import { AlertTriangle, Egg, ShoppingCart, Skull, Warehouse } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { hoyEnLima } from "@/lib/zod/comun";
import { auth } from "@/server/auth";
import { listarCreditosPendientesConCliente } from "@/server/repositories/credito";
import { resumirAlertasCredito } from "@/server/services/credito";

const TARJETAS_EJEMPLO = [
  {
    label: "Lotes activos",
    valor: "3",
    icono: Warehouse,
    color: "bg-blue-50 text-blue-700",
  },
  {
    label: "Huevos hoy",
    valor: "1,240",
    icono: Egg,
    color: "bg-green-50 text-green-700",
  },
  {
    label: "Mortalidad hoy",
    valor: "2",
    icono: Skull,
    color: "bg-red-50 text-red-700",
  },
  {
    label: "Ventas hoy",
    valor: "S/ 0.00",
    icono: ShoppingCart,
    color: "bg-amber-50 text-amber-700",
  },
] as const;

export default async function Home() {
  const [session, creditosPendientes] = await Promise.all([auth(), listarCreditosPendientesConCliente()]);
  const nombre = session?.user?.nombre ?? "";

  // Primera tarjeta con datos reales de todo el dashboard (Sprint 11) — las
  // 4 de TARJETAS_EJEMPLO siguen siendo de ejemplo hasta Sprint 15
  // (Dashboard y reportes), sin tocarlas.
  // hoyEnLima() (D5), no new Date() crudo — ver la misma corrección en
  // app/(app)/creditos/page.tsx (bug real encontrado en S11-20).
  const { cantidadVencidos, montoVencido } = resumirAlertasCredito(
    creditosPendientes.map((credito) => ({
      montoTotal: Number(credito.montoTotal),
      montoPagado: Number(credito.montoPagado),
      fechaLimite: credito.fechaLimite,
    })),
    hoyEnLima(),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title={`Hola${nombre ? `, ${nombre}` : ""}`}
        description="Avícola M&A — panel de inicio"
      />

      <div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Link
            href="/creditos"
            prefetch={false}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <p className="text-xl font-semibold">
                {cantidadVencidos} — S/ {montoVencido.toFixed(2)}
              </p>
              <p className="text-sm text-muted-foreground">Créditos vencidos</p>
            </div>
          </Link>
          {TARJETAS_EJEMPLO.map(({ label, valor, icono: Icono, color }) => (
            <div
              key={label}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
            >
              <span className={`flex size-9 items-center justify-center rounded-lg ${color}`}>
                <Icono className="size-5" />
              </span>
              <div>
                <p className="text-xl font-semibold">{valor}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Créditos vencidos: dato real. El resto sigue siendo de ejemplo — los módulos de producción
          y ventas llegan en próximos sprints.
        </p>
      </div>
    </div>
  );
}
