"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CategoriaEgreso } from "@prisma/client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Orden fijo — mismo orden que CategoriaEgreso en schema.prisma y que
// egreso-filtros.tsx, nunca reasignado.
const CATEGORIAS: { key: CategoriaEgreso; label: string; color: string }[] = [
  { key: "ALIMENTOS", label: "Alimentos", color: "var(--chart-1)" },
  { key: "INSUMOS_VACUNAS", label: "Insumos y vacunas", color: "var(--chart-2)" },
  { key: "SERVICIOS", label: "Servicios", color: "var(--chart-3)" },
  { key: "MANTENIMIENTO", label: "Mantenimiento", color: "var(--chart-4)" },
  { key: "VARIOS", label: "Varios", color: "var(--chart-5)" },
];
const LABEL_POR_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.label])) as Record<
  CategoriaEgreso,
  string
>;
const COLOR_POR_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c.color])) as Record<
  CategoriaEgreso,
  string
>;

export function ReporteGastoCategoria({
  datos,
  desde,
  hasta,
}: {
  datos: { categoria: CategoriaEgreso; total: number }[];
  desde: string;
  hasta: string;
}) {
  const total = datos.reduce((acc, d) => acc + d.total, 0);

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Gasto por categoría</h2>
          <p className="text-sm text-muted-foreground">S/ {total.toFixed(2)} en el rango filtrado</p>
        </div>
        <a
          href={`/reportes/exportar?tipo=gastos&desde=${desde}&hasta=${hasta}`}
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
              dataKey="categoria"
              tickFormatter={(valor: CategoriaEgreso) => LABEL_POR_CATEGORIA[valor]}
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
              formatter={(valor) => [`S/ ${Number(valor).toFixed(2)}`, "Gasto"]}
              labelFormatter={(valor) => LABEL_POR_CATEGORIA[valor as CategoriaEgreso]}
              contentStyle={{
                backgroundColor: "var(--popover)",
                borderColor: "var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="total" name="Gasto" radius={[4, 4, 0, 0]}>
              {datos.map((fila) => (
                <Cell key={fila.categoria} fill={COLOR_POR_CATEGORIA[fila.categoria]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
