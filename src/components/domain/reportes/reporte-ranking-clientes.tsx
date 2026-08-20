import type { TipoCliente } from "@prisma/client";

import { buttonVariants } from "@/components/ui/button";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<TipoCliente, string> = {
  MAYORISTA: "Mayorista",
  MINORISTA: "Minorista",
  EVENTUAL: "Eventual",
};

// Tabla, no gráfico — un Top 10 fijo no necesita paginación
// (memory/convenciones.md, "Tabla paginada vs. muro con scroll infinito":
// esto no es ninguno de los dos, es un ranking acotado a un Top N fijo).
// Sin "use client": no hay interactividad más allá del link de exportar.
export function ReporteRankingClientes({
  datos,
  desde,
  hasta,
}: {
  datos: {
    clienteId: string;
    nombre: string;
    tipo: TipoCliente;
    montoTotal: number;
    cantidadVentas: number;
  }[];
  desde: string;
  hasta: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Ranking de clientes</h2>
          <p className="text-sm text-muted-foreground">
            Top {datos.length || 0} del rango filtrado por monto comprado
          </p>
        </div>
        <a
          href={`/reportes/exportar?tipo=ranking-clientes&desde=${desde}&hasta=${hasta}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Exportar Excel
        </a>
      </header>
      {datos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ventas a clientes registrados en el rango filtrado.</p>
      ) : (
        <TableScrollArea>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Monto total</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila, indice) => (
                <tr key={fila.clienteId} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{indice + 1}</td>
                  <td className="px-3 py-2 font-medium">{fila.nombre}</td>
                  <td className="px-3 py-2 text-muted-foreground">{TIPO_LABEL[fila.tipo]}</td>
                  <td className="px-3 py-2 text-right">S/ {fila.montoTotal.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fila.cantidadVentas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScrollArea>
      )}
    </section>
  );
}
