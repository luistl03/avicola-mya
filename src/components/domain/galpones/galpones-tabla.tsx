"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoGalpon, Galpon, HistorialUbicacionLote, Lote } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScrollArea } from "@/components/ui/table-scroll-area";
import { toastManager } from "@/components/ui/toast";
import { GalponFormDialog } from "@/components/domain/galpones/galpon-form-dialog";
import { cambiarEstadoGalponAction } from "@/server/actions/galpon";

// Forma exacta de lo que devuelve listarGalponesConOcupacion()
// (server/repositories/galpon.ts) — no se importa el tipo de retorno del
// repository acá (componente cliente) para no acoplarse a un módulo que
// además importa el singleton de Prisma; se reconstruye a mano con los
// tipos de @prisma/client, mismo criterio que UsuariosTabla usa el tipo
// Usuario tal cual.
type GalponConOcupacion = Galpon & {
  historialUbicaciones: (HistorialUbicacionLote & {
    lote: Pick<Lote, "id" | "codigo" | "avesVivas">;
  })[];
};

export function GalponesTabla({ galpones }: { galpones: GalponConOcupacion[] }) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Capacidad máxima</TableHead>
            <TableHead>Ocupación actual</TableHead>
            <TableHead>Lotes alojados</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {galpones.map((galpon) => (
            <GalponFila key={galpon.id} galpon={galpon} />
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}

function GalponFila({ galpon }: { galpon: GalponConOcupacion }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const avesAlojadas = galpon.historialUbicaciones.reduce(
    (suma, fila) => suma + fila.lote.avesVivas,
    0,
  );

  const proximoEstado: EstadoGalpon = galpon.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";

  function alternarEstado() {
    startTransition(async () => {
      const resultado = await cambiarEstadoGalponAction({
        galponId: galpon.id,
        estado: proximoEstado,
      });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo cambiar el estado",
          description: resultado.error,
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: proximoEstado === "ACTIVO" ? "Galpón activado" : "Galpón desactivado",
        description: `${galpon.nombre} ahora está ${proximoEstado === "ACTIVO" ? "activo" : "inactivo"}.`,
      });
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell>{galpon.nombre}</TableCell>
      <TableCell>{galpon.capacidadMaxima}</TableCell>
      <TableCell>
        {avesAlojadas} / {galpon.capacidadMaxima} aves
      </TableCell>
      <TableCell>
        {galpon.historialUbicaciones.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {galpon.historialUbicaciones.map((fila) => (
              <Badge key={fila.id} variant="outline">
                {fila.lote.codigo}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={galpon.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
        >
          {galpon.estado === "ACTIVO" ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <GalponFormDialog
            modo="editar"
            galpon={{
              id: galpon.id,
              nombre: galpon.nombre,
              capacidadMaxima: galpon.capacidadMaxima,
            }}
          />
          <Button
            type="button"
            variant={galpon.estado === "ACTIVO" ? "destructive" : "outline"}
            size="sm"
            disabled={pending}
            onClick={alternarEstado}
          >
            {galpon.estado === "ACTIVO" ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
