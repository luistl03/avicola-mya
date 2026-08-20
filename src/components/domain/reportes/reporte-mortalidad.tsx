"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReporteMortalidad({
  datos,
  porTipo,
  desde,
  hasta,
}: {
  datos: { fecha: string; total: number }[];
  porTipo: { MUERTE: number; DESCARTE: number };
  desde: string;
  hasta: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Mortalidad</h2>
          <p className="text-sm text-muted-foreground">
            {porTipo.MUERTE.toLocaleString("es-PE")} muertes · {porTipo.DESCARTE.toLocaleString("es-PE")} descartes
            en el rango filtrado
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=mortalidad&desde=${desde}&hasta=${hasta}`}
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
              dataKey="fecha"
              tickFormatter={(valor: string) => valor.slice(5)}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(valor) => [Number(valor).toLocaleString("es-PE"), "Mortalidad"]}
              contentStyle={{
                backgroundColor: "var(--popover)",
                borderColor: "var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="total" name="Mortalidad" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
