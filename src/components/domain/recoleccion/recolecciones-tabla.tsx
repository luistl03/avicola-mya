import type { EstadoPaquete } from "@prisma/client";

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
import { RevertirRecoleccionBoton } from "@/components/domain/recoleccion/revertir-recoleccion-boton";
import { calcularEmpaque } from "@/server/services/recoleccion";

// Forma exacta de lo que devuelve listarRecolecciones()
// (server/repositories/recoleccion.ts), reconstruida a mano — mismo
// criterio que MortalidadTabla/LotesTabla en vez de importar el tipo de
// retorno del repository. `revertido` y `paquetes[].estado` agregados en
// Sprint 6 (ventana de gracia).
type RegistroRecoleccionConDatos = {
  id: string;
  creadoEn: Date;
  cantidadTotal: number;
  revertido: boolean;
  lote: { codigo: string };
  galpon: { nombre: string };
  usuario: { nombre: string };
  paquetes: { id: string; estado: EstadoPaquete }[];
};

export function RecoleccionesTabla({ registros }: { registros: RegistroRecoleccionConDatos[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Galpón</TableHead>
            <TableHead>Cantidad total</TableHead>
            <TableHead>Paquetes</TableHead>
            <TableHead>Sueltos</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registros.map((registro) => {
            // "Sueltos" no se guarda por fila — es un campo calculado
            // (memory/modelo-datos.md, "Campos calculados"), se deriva
            // acá mismo de cantidadTotal, igual que
            // calcularEdadEnSemanas() se invoca directo desde un Server
            // Component de página (Sprint 3). Paquetes generados sí
            // viene de una columna real (registro.paquetes.length) en vez
            // de recalcularlo, para que la tabla siga reflejando lo que
            // de verdad quedó persistido, no solo lo que la fórmula diría
            // hoy.
            const { sueltos } = calcularEmpaque(registro.cantidadTotal);
            const paquetesNoDisponibles = registro.paquetes.filter(
              (p) => p.estado !== "DISPONIBLE",
            ).length;

            return (
              <TableRow key={registro.id} className={registro.revertido ? "opacity-60" : undefined}>
                <TableCell>{formatearFechaHora(registro.creadoEn)}</TableCell>
                <TableCell>{registro.lote.codigo}</TableCell>
                <TableCell>{registro.galpon.nombre}</TableCell>
                <TableCell>{registro.cantidadTotal}</TableCell>
                <TableCell>{registro.paquetes.length}</TableCell>
                <TableCell>{sueltos}</TableCell>
                <TableCell>{registro.usuario.nombre}</TableCell>
                <TableCell className="text-right">
                  <RevertirRecoleccionBoton
                    registro={{
                      id: registro.id,
                      creadoEn: registro.creadoEn,
                      revertido: registro.revertido,
                      paquetesNoDisponibles,
                    }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
