import type { CategoriaEgreso } from "@prisma/client";

import { RevertirEgresoBoton } from "@/components/domain/egresos/revertir-egreso-boton";
import { EgresoFormDialog } from "@/components/domain/egresos/egreso-form-dialog";
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
import { formatearFecha } from "@/lib/fecha";

// Forma exacta de lo que devuelve listarEgresos() (server/repositories/egreso.ts),
// reconstruida a mano — mismo criterio que MortalidadTabla/LotesTabla.
type EgresoConDatos = {
  id: string;
  categoria: CategoriaEgreso;
  monto: number;
  descripcion: string;
  fecha: Date;
  creadoEn: Date;
  revertido: boolean;
  usuario: { nombre: string };
};

const CATEGORIA_LABEL: Record<CategoriaEgreso, string> = {
  ALIMENTOS: "Alimentos",
  INSUMOS_VACUNAS: "Insumos y vacunas",
  SERVICIOS: "Servicios",
  MANTENIMIENTO: "Mantenimiento",
  VARIOS: "Varios",
};

const CATEGORIA_CLASE: Record<CategoriaEgreso, string> = {
  ALIMENTOS: "badge-categoria-egreso-alimentos",
  INSUMOS_VACUNAS: "badge-categoria-egreso-insumos-vacunas",
  SERVICIOS: "badge-categoria-egreso-servicios",
  MANTENIMIENTO: "badge-categoria-egreso-mantenimiento",
  VARIOS: "badge-categoria-egreso-varios",
};

export function EgresosTabla({ egresos }: { egresos: EgresoConDatos[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {egresos.map((egreso) => (
            <TableRow key={egreso.id} className={egreso.revertido ? "opacity-60" : undefined}>
              <TableCell>{formatearFecha(egreso.fecha)}</TableCell>
              <TableCell>
                <Badge variant="outline" className={CATEGORIA_CLASE[egreso.categoria]}>
                  {CATEGORIA_LABEL[egreso.categoria]}
                </Badge>
              </TableCell>
              <TableCell className={egreso.revertido ? "line-through" : undefined}>
                S/ {egreso.monto.toFixed(2)}
              </TableCell>
              <TableCell>{egreso.descripcion}</TableCell>
              <TableCell>{egreso.usuario.nombre}</TableCell>
              <TableCell className="text-right">
                {egreso.revertido ? (
                  <Badge variant="outline" className="badge-estado-inactivo">
                    Anulado
                  </Badge>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <EgresoFormDialog modo="editar" egreso={egreso} />
                    <RevertirEgresoBoton egreso={egreso} />
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}
