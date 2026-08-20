"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReporteMortalidadPorLote({
  datos,
  desde,
  hasta,
}: {
  datos: { loteCodigo: string; galponNombre: string; total: number }[];
  desde: string;
  hasta: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Mortalidad por lote/galpón</h2>
          <p className="text-sm text-muted-foreground">
            {datos.length} lote{datos.length === 1 ? "" : "s"} con mortalidad en el rango filtrado
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=mortalidad-lote&desde=${desde}&hasta=${hasta}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Exportar Excel
        </a>
      </header>
      {datos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin mortalidad registrada en el rango filtrado.</p>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={datos}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="loteCodigo"
                width={90}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <Tooltip
                formatter={(valor) => [Number(valor).toLocaleString("es-PE"), "Mortalidad"]}
                labelFormatter={(valor, payload) =>
                  `${valor} - ${payload?.[0]?.payload?.galponNombre ?? ""}`
                }
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" name="Mortalidad" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
