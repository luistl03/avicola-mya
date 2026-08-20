import {
  AlertTriangle,
  BarChart3,
  Egg,
  Scale,
  ShoppingCart,
  Skull,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
} from "lucide-react";
import Link from "next/link";

import { PanelAlertas } from "@/components/domain/creditos/panel-alertas";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hoyEnLima } from "@/lib/zod/comun";
import { auth } from "@/server/auth";
import { listarCreditosPendientesConCliente } from "@/server/repositories/credito";
import { sumarEgresosEnRango } from "@/server/repositories/egreso";
import { contarLotesActivos } from "@/server/repositories/lote";
import { sumarMortalidadEnRango } from "@/server/repositories/mortalidad";
import { sumarProduccionEnRango } from "@/server/repositories/recoleccion";
import { sumarVentasEnRango } from "@/server/repositories/venta";
import { resumirAlertasCredito } from "@/server/services/credito";
import { rangoMesActual } from "@/server/services/reportes";

export default async function Home() {
  // hoyEnLima() (D5), no new Date() crudo — ver la misma corrección en
  // app/(app)/creditos/page.tsx (bug real encontrado en S11-20). `mañana`
  // define el límite EXCLUSIVO del día (misma convención que
  // calcularRangoMesCalendario), consumido por las 3 funciones sumar*EnRango.
  const hoy = hoyEnLima();
  const mañana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
  // Mismo rango que /reportes usa como valor por defecto (D10) — reutilizado
  // acá para "Balance del mes", sin duplicar el cálculo de mes calendario.
  const { desde: desdeMes, hasta: hastaMes } = rangoMesActual();

  const [
    session,
    creditosPendientes,
    lotesActivos,
    huevosHoy,
    mortalidadHoy,
    ventasHoy,
    egresosHoy,
    ventasMes,
    egresosMes,
  ] = await Promise.all([
    auth(),
    listarCreditosPendientesConCliente(),
    contarLotesActivos(),
    sumarProduccionEnRango(hoy, mañana),
    sumarMortalidadEnRango(hoy, mañana),
    sumarVentasEnRango(hoy, mañana),
    sumarEgresosEnRango(hoy, mañana),
    sumarVentasEnRango(desdeMes, hastaMes),
    sumarEgresosEnRango(desdeMes, hastaMes),
  ]);
  const esGerente = session?.user?.rol === "GERENTE";

  // Primera tarjeta con datos reales desde Sprint 11.
  const { cantidadVencidos, montoVencido } = resumirAlertasCredito(
    creditosPendientes.map((credito) => ({
      montoTotal: Number(credito.montoTotal),
      montoPagado: Number(credito.montoPagado),
      fechaLimite: credito.fechaLimite,
    })),
    hoy,
  );

  // 6 tarjetas por jerarquía (pedido explícito del Product Owner: "3
  // arriba y 3 abajo", pares primero por importancia) — trío financiero
  // primero (mision.md: "Gerente necesita visibilidad total: finanzas,
  // créditos vencidos" es la necesidad #1 explícita), trío operativo
  // después. Mismo tamaño/estilo horizontal que las tarjetas de "Balance
  // del mes" (pedido explícito), no el layout vertical que tenían antes.
  const tarjetas: {
    label: string;
    valor: string;
    icono: typeof AlertTriangle;
    color: string;
    href?: string;
  }[] = [
    {
      label: "Créditos vencidos",
      valor: `${cantidadVencidos} - S/ ${montoVencido.toFixed(2)}`,
      icono: AlertTriangle,
      color: "bg-amber-50 text-amber-700",
      href: "/creditos",
    },
    {
      label: "Ventas hoy",
      valor: `S/ ${Number(ventasHoy).toFixed(2)}`,
      icono: ShoppingCart,
      color: "bg-amber-50 text-amber-700",
    },
    {
      label: "Egresos hoy",
      valor: `S/ ${Number(egresosHoy).toFixed(2)}`,
      icono: Wallet,
      color: "bg-red-50 text-red-700",
    },
    {
      label: "Lotes activos",
      valor: String(lotesActivos),
      icono: Warehouse,
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Huevos hoy",
      valor: huevosHoy.toLocaleString("es-PE"),
      icono: Egg,
      color: "bg-green-50 text-green-700",
    },
    {
      label: "Mortalidad hoy",
      valor: String(mortalidadHoy),
      icono: Skull,
      color: "bg-red-50 text-red-700",
    },
  ];

  const neto = Number(ventasMes) - Number(egresosMes);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 md:p-8">
      <PageHeader
        title="Inicio"
        actions={
          esGerente ? (
            <Link href="/reportes" prefetch={false} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <BarChart3 />
              Ver reportes completos
            </Link>
          ) : undefined
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hoy</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tarjetas.map(({ label, valor, icono: Icono, color, href }) => {
            const contenido = (
              <>
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
                  <Icono className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold">{valor}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              </>
            );
            return href ? (
              <Link
                key={label}
                href={href}
                prefetch={false}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
              >
                {contenido}
              </Link>
            ) : (
              <div key={label} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                {contenido}
              </div>
            );
          })}
        </div>
      </section>

      {/* Gerente necesita "visibilidad total: finanzas, créditos vencidos,
          reportes" (mision.md) — Operario necesita "rapidez y
          simplicidad", así que estas 2 secciones quedan solo para
          Gerente: mantienen el dashboard de Operario liviano y enfocado
          en lo operativo de arriba. */}
      {esGerente ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Balance del mes</h2>
              <Link href="/reportes" prefetch={false} className="text-sm text-primary hover:underline">
                Ver balance completo →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <TrendingUp className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold">S/ {Number(ventasMes).toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Ingresos del mes</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <TrendingDown className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold">S/ {Number(egresosMes).toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Egresos del mes</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    neto >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                  )}
                >
                  <Scale className="size-5" />
                </span>
                <div>
                  <p className={cn("text-xl font-semibold", neto < 0 && "text-red-600")}>
                    S/ {neto.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">Neto del mes (sin planilla)</p>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Créditos por vencer</h2>
            <PanelAlertas
              creditos={creditosPendientes.map((credito) => ({
                id: credito.id,
                clienteNombre: credito.cliente.nombre,
                montoTotal: Number(credito.montoTotal),
                montoPagado: Number(credito.montoPagado),
                fechaLimite: credito.fechaLimite,
              }))}
              hoy={hoy}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
