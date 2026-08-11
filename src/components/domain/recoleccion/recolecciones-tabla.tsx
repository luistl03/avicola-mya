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
import { calcularEmpaque } from "@/server/services/recoleccion";

// Forma exacta de lo que devuelve listarRecolecciones()
// (server/repositories/recoleccion.ts), reconstruida a mano — mismo
// criterio que MortalidadTabla/LotesTabla en vez de importar el tipo de
// retorno del repository.
type RegistroRecoleccionConDatos = {
  id: string;
  creadoEn: Date;
  cantidadTotal: number;
  lote: { codigo: string };
  galpon: { nombre: string };
  usuario: { nombre: string };
  paquetes: { id: string }[];
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

            return (
              <TableRow key={registro.id}>
                <TableCell>{formatearFechaHora(registro.creadoEn)}</TableCell>
                <TableCell>{registro.lote.codigo}</TableCell>
                <TableCell>{registro.galpon.nombre}</TableCell>
                <TableCell>{registro.cantidadTotal}</TableCell>
                <TableCell>{registro.paquetes.length}</TableCell>
                <TableCell>{sueltos}</TableCell>
                <TableCell>{registro.usuario.nombre}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
