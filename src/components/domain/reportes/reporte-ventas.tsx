"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetodoPago } from "@prisma/client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Orden fijo — mismo orden que MetodoPago en schema.prisma y que
// venta-filtros.tsx, nunca reasignado (color sigue a la identidad del
// método de pago, no a su posición en un rango dado).
const SERIES: { key: MetodoPago; label: string; color: string }[] = [
  { key: "EFECTIVO", label: "Efectivo", color: "var(--chart-1)" },
  { key: "YAPE", label: "Yape", color: "var(--chart-2)" },
  { key: "PLIN", label: "Plin", color: "var(--chart-3)" },
  { key: "TRANSFERENCIA", label: "Transferencia", color: "var(--chart-4)" },
];

export function ReporteVentas({
  datos,
  desde,
  hasta,
}: {
  datos: ({ fecha: string } & Record<MetodoPago, number>)[];
  desde: string;
  hasta: string;
}) {
  // Interactividad pedida por el Product Owner: clic en la leyenda
  // oculta/muestra esa serie — patrón estándar de Recharts (estado local
  // de claves ocultas, sin librería nueva).
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  function alternar(clave: string) {
    setOcultas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Ventas por método de pago</h2>
          <p className="text-sm text-muted-foreground">Tendencia diaria del rango filtrado</p>
        </div>
        <a
          href={`/reportes/exportar?tipo=ventas&desde=${desde}&hasta=${hasta}`}
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
            <Legend
              wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
              onClick={(entrada) => alternar(String(entrada.dataKey))}
              formatter={(valor, entrada) => (
                <span className={ocultas.has(String(entrada.dataKey)) ? "line-through opacity-50" : undefined}>
                  {valor}
                </span>
              )}
            />
            {SERIES.map(({ key, label, color }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId="ventas"
                fill={color}
                hide={ocultas.has(key)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
