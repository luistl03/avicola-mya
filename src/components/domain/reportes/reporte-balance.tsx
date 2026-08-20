"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Verde=ingresos / rojo=egresos — mismo par validado con la skill dataviz
// (ΔE 32 normal-vision, ambos modos), convención financiera estándar
// (ingreso=positivo, egreso=alerta) ya usada en el resto de la app para
// éxito/error.
export function ReporteBalance({
  datos,
  desde,
  hasta,
}: {
  datos: { fecha: string; ingresos: number; egresos: number; neto: number }[];
  desde: string;
  hasta: string;
}) {
  const totalIngresos = datos.reduce((acc, d) => acc + d.ingresos, 0);
  const totalEgresos = datos.reduce((acc, d) => acc + d.egresos, 0);
  const neto = totalIngresos - totalEgresos;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Balance financiero</h2>
          <p className="text-sm text-muted-foreground">
            S/ {totalIngresos.toFixed(2)} ingresos · S/ {totalEgresos.toFixed(2)} egresos ·{" "}
            <span className={neto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
              neto S/ {neto.toFixed(2)}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ventas vs. Egresos operativos - no incluye planilla (ver /personal)
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=balance&desde=${desde}&hasta=${hasta}`}
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
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(valor: number) => `S/ ${valor}`}
            />
            <Tooltip
              formatter={(valor, nombre) => [`S/ ${Number(valor).toFixed(2)}`, String(nombre)]}
              contentStyle={{
                backgroundColor: "var(--popover)",
                borderColor: "var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#059669" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
