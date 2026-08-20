"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NivelAlertaCredito } from "@/server/services/credito";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Colores de estado (no categóricos): mismo criterio amber/rojo que ya usa
// `tarjeta-credito.tsx`/`.badge-alerta-*` en globals.css para estos 3
// niveles — reservados para esta semántica, nunca reasignados a otra
// entidad. Con etiqueta directa en el eje X (no solo leyenda), la
// identificación no depende únicamente del color.
const NIVELES: { key: NivelAlertaCredito; label: string; color: string }[] = [
  { key: "POR_VENCER", label: "Por vencer", color: "#d97706" },
  { key: "VENCIDO_RECIENTE", label: "Vencido reciente", color: "#dc2626" },
  { key: "VENCIDO_CRITICO", label: "Vencido crítico", color: "#7f1d1d" },
];
const LABEL_POR_NIVEL = Object.fromEntries(NIVELES.map((n) => [n.key, n.label])) as Record<
  NivelAlertaCredito,
  string
>;
const COLOR_POR_NIVEL = Object.fromEntries(NIVELES.map((n) => [n.key, n.color])) as Record<
  NivelAlertaCredito,
  string
>;

export function ReporteCreditos({
  datos,
  desde,
  hasta,
}: {
  datos: { nivel: NivelAlertaCredito; cantidad: number; montoPendiente: number }[];
  desde: string;
  hasta: string;
}) {
  const totalPendiente = datos.reduce((acc, d) => acc + d.montoPendiente, 0);
  const totalCantidad = datos.reduce((acc, d) => acc + d.cantidad, 0);

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Créditos y cobranza</h2>
          <p className="text-sm text-muted-foreground">
            {totalCantidad} crédito{totalCantidad === 1 ? "" : "s"} con fecha límite en el rango filtrado · S/{" "}
            {totalPendiente.toFixed(2)} pendientes de cobro
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=creditos&desde=${desde}&hasta=${hasta}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Exportar Excel
        </a>
      </header>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="nivel"
              tickFormatter={(valor: NivelAlertaCredito) => LABEL_POR_NIVEL[valor]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(valor: number) => `S/ ${valor}`}
            />
            <Tooltip
              // Bug real encontrado por el Product Owner: comparar contra
              // "montoPendiente" (la dataKey) nunca matcheaba — Recharts
              // pasa acá el `name` VISIBLE del Bar ("Monto pendiente", con
              // espacio), no la dataKey. Con un solo Bar en este gráfico
              // no hace falta la rama condicional — siempre es moneda.
              formatter={(valor) => [`S/ ${Number(valor).toFixed(2)}`, "Monto pendiente"]}
              labelFormatter={(valor) => LABEL_POR_NIVEL[valor as NivelAlertaCredito]}
              contentStyle={{
                backgroundColor: "var(--popover)",
                borderColor: "var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="montoPendiente" name="Monto pendiente" radius={[4, 4, 0, 0]}>
              {datos.map((fila) => (
                <Cell key={fila.nivel} fill={COLOR_POR_NIVEL[fila.nivel]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
