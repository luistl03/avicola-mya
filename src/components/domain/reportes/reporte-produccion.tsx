"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Solo una serie — un color fijo (--chart-1, brand) alcanza, sin leyenda
// (regla dataviz: "un solo color necesita legend box, el título ya nombra
// la serie").
export function ReporteProduccion({
  datos,
  total,
  desde,
  hasta,
}: {
  datos: { fecha: string; total: number }[];
  total: number;
  desde: string;
  hasta: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Producción</h2>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("es-PE")} huevos en el rango filtrado
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=produccion&desde=${desde}&hasta=${hasta}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Exportar Excel
        </a>
      </header>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              formatter={(valor) => [Number(valor).toLocaleString("es-PE"), "Huevos"]}
              contentStyle={{
                backgroundColor: "var(--popover)",
                borderColor: "var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              name="Huevos"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
