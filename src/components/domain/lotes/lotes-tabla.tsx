import type { Galpon, HistorialUbicacionLote, Lote } from "@prisma/client";

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
import { FinalizarLoteDialog } from "@/components/domain/lotes/finalizar-lote-dialog";
import { MudanzaDialog } from "@/components/domain/lotes/mudanza-dialog";

// Forma exacta de lo que devuelve listarLotesConUbicacion()
// (server/repositories/lote.ts) — mismo criterio que GalponesTabla,
// reconstruido a mano con tipos de @prisma/client en vez de importar el
// repository desde un componente cliente. `historialUbicaciones` trae
// siempre la ÚLTIMA fila (abierta o cerrada, no solo la abierta como
// antes) — hay que chequear `fechaSalida === null` para saber si el
// lote sigue alojado ahí. `edadSemanas` no es un campo de Prisma: se
// calcula en el Server Component (page.tsx) con
// calcularEdadEnSemanas() y se pasa ya resuelto, para no repetir
// lógica de fechas en un componente cliente.
type LoteConUbicacion = Lote & {
  historialUbicaciones: (HistorialUbicacionLote & {
    galpon: Pick<Galpon, "id" | "nombre">;
  })[];
  edadSemanas: number;
};

type GalponOpcion = { id: string; nombre: string };

export function LotesTabla({
  lotes,
  galponesActivos,
}: {
  lotes: LoteConUbicacion[];
  galponesActivos: GalponOpcion[];
}) {
  return (
    <TableScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Fecha ingreso</TableHead>
            <TableHead>Aves iniciales</TableHead>
            <TableHead>Aves vivas</TableHead>
            <TableHead>Edad</TableHead>
            <TableHead>Ubicación actual</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotes.map((lote) => (
            <LoteFila key={lote.id} lote={lote} galponesActivos={galponesActivos} />
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  );
}

function LoteFila({
  lote,
  galponesActivos,
}: {
  lote: LoteConUbicacion;
  galponesActivos: GalponOpcion[];
}) {
  // Última fila de historial (abierta o cerrada, ver comentario del tipo
  // arriba) — a lo sumo una, nunca dos (índice único parcial de S0-5
  // garantiza que la abierta sea única; take:1 en el repository trae
  // solo la más reciente entre las cerradas si no hay ninguna abierta).
  const ultimaUbicacion = lote.historialUbicaciones[0];
  const ubicacionAbierta = ultimaUbicacion?.fechaSalida === null ? ultimaUbicacion : undefined;

  return (
    <TableRow>
      <TableCell>{lote.codigo}</TableCell>
      <TableCell>
        {lote.fechaIngreso.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}
      </TableCell>
      <TableCell>{lote.avesIniciales}</TableCell>
      <TableCell>{lote.avesVivas}</TableCell>
      <TableCell>{lote.edadSemanas} semanas</TableCell>
      <TableCell>
        {ubicacionAbierta ? (
          ubicacionAbierta.galpon.nombre
        ) : (
          <span className="text-muted-foreground">— finalizado —</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="secondary"
          className={lote.estado === "ACTIVO" ? "badge-estado-activo" : "badge-estado-inactivo"}
        >
          {lote.estado === "ACTIVO" ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell>
        {lote.estado === "ACTIVO" ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MudanzaDialog
              lote={{ id: lote.id, codigo: lote.codigo }}
              galponActualId={ubicacionAbierta?.galpon.id ?? null}
              galponesActivos={galponesActivos}
            />
            <FinalizarLoteDialog lote={{ id: lote.id, codigo: lote.codigo }} />
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
