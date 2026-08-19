import type { TipoSueldoMovimiento } from "@prisma/client";

import { RevertirSueldoMovimientoBoton } from "@/components/domain/personal/revertir-sueldo-movimiento-boton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { formatearFechaHora } from "@/lib/fecha";

// Forma exacta de lo que devuelve listarSueldoMovimientosPorEmpleado()
// (server/repositories/sueldo-movimiento.ts) — mismo criterio que
// MortalidadTabla/EgresosTabla.
type SueldoMovimientoConDatos = {
  id: string;
  tipo: TipoSueldoMovimiento;
  monto: number;
  fecha: Date;
  descripcion: string | null;
  revertido: boolean;
};

const TIPO_LABEL: Record<TipoSueldoMovimiento, string> = {
  SUELDO_BASE: "Sueldo base",
  ADELANTO: "Adelanto",
  BONO: "Bono",
  DESCUENTO: "Descuento",
};

const TIPO_CLASE: Record<TipoSueldoMovimiento, string> = {
  SUELDO_BASE: "badge-tipo-sueldo-base",
  ADELANTO: "badge-tipo-sueldo-adelanto",
  BONO: "badge-tipo-sueldo-bono",
  DESCUENTO: "badge-tipo-sueldo-descuento",
};

// SUELDO_BASE/BONO suman al neto, ADELANTO/DESCUENTO restan (mismo
// signo que calcularNetoMensual, server/services/sueldo-movimiento.ts) —
// el signo visual en el monto refuerza esa lectura de un vistazo.
const SUMA_AL_NETO: Record<TipoSueldoMovimiento, boolean> = {
  SUELDO_BASE: true,
  BONO: true,
  ADELANTO: false,
  DESCUENTO: false,
};

export function SueldoMovimientosTabla({
  movimientos,
}: {
  movimientos: SueldoMovimientoConDatos[];
}) {
  if (movimientos.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Este empleado no tiene movimientos registrados todavía.
      </p>
    );
  }

  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movimientos.map((movimiento) => (
            <TableRow key={movimiento.id} className={movimiento.revertido ? "opacity-60" : undefined}>
              <TableCell>{formatearFechaHora(movimiento.fecha)}</TableCell>
              <TableCell>
                <Badge variant="outline" className={TIPO_CLASE[movimiento.tipo]}>
                  {TIPO_LABEL[movimiento.tipo]}
                </Badge>
              </TableCell>
              <TableCell className={movimiento.revertido ? "line-through" : undefined}>
                {SUMA_AL_NETO[movimiento.tipo] ? "+" : "−"} S/ {movimiento.monto.toFixed(2)}
              </TableCell>
              <TableCell>{movimiento.descripcion ?? "—"}</TableCell>
              <TableCell className="text-right">
                {movimiento.revertido ? (
                  <Badge variant="outline" className="badge-estado-inactivo">
                    Revertido
                  </Badge>
                ) : (
                  <RevertirSueldoMovimientoBoton movimiento={movimiento} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
