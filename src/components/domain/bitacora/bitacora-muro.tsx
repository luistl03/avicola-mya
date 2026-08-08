"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoriaBitacora } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { EditarNotaBitacoraDialog } from "@/components/domain/bitacora/editar-nota-bitacora-dialog";
import { EliminarNotaBitacoraDialog } from "@/components/domain/bitacora/eliminar-nota-bitacora-dialog";
import { PAGE_SIZE_MURO } from "@/lib/constants";
import { formatearFechaHora } from "@/lib/fecha";
import { obtenerMasBitacora } from "@/server/actions/bitacora";

// Forma exacta de lo que devuelve listarBitacoraPagina()
// (server/repositories/bitacora.ts), reconstruida a mano en vez de
// importar el tipo de retorno del repository — mismo criterio que
// MortalidadTabla/LotesTabla.
type NotaBitacora = {
  id: string;
  fecha: Date;
  categoria: CategoriaBitacora;
  contenido: string;
  usuario: { nombre: string };
};

// Un color por categoría (a pedido del Product Owner): ayuda a ubicar de
// un vistazo una nota en un muro con muchas — ver globals.css,
// .badge-categoria-*, para el porqué de cada tono.
const CATEGORIA_LABEL: Record<CategoriaBitacora, string> = {
  ALIMENTACION: "Alimentación",
  VACUNACION: "Vacunación",
  OBSERVACION: "Observación",
};

const CATEGORIA_CLASE: Record<CategoriaBitacora, string> = {
  ALIMENTACION: "badge-categoria-alimentacion",
  VACUNACION: "badge-categoria-vacunacion",
  OBSERVACION: "badge-categoria-observacion",
};

type Props = {
  itemsIniciales: NotaBitacora[];
  categoria?: CategoriaBitacora;
  desde?: Date;
  hasta?: Date;
};

// Muro cronológico con scroll infinito (cursor), no una tabla paginada —
// ver "Tabla paginada vs. muro con scroll infinito" en
// memory/convenciones.md. Sin librería nueva: un solo IntersectionObserver
// nativo sobre una sentinela al final de la lista alcanza para un caso de
// uso tan simple (un observer, no una lista virtualizada).
//
// Cuando cambian los filtros (BitacoraFiltros actualiza la URL,
// app/(app)/bitacora/page.tsx vuelve a ejecutar con nueva
// itemsIniciales), este componente tiene que arrancar de cero — no
// arrastrar las notas cargadas con el filtro anterior. En vez de
// sincronizar props → state con un useEffect + setState (cascada de
// renders que el propio linter de React marca como anti-patrón), el
// padre (page.tsx) le pasa un `key` derivado de los filtros: React
// desmonta y vuelve a montar este componente entero en cada cambio de
// filtro, así el estado inicial siempre sale fresco de itemsIniciales sin
// código extra acá.
export function BitacoraMuro({ itemsIniciales, categoria, desde, hasta }: Props) {
  const [items, setItems] = useState(itemsIniciales);
  // Heurística estándar de paginación por cursor: si la última tanda
  // trajo menos que PAGE_SIZE_MURO, no hay más para pedir. Si trajo
  // exactamente PAGE_SIZE_MURO, puede que sí o no haya más — el próximo
  // intento lo confirma con un roundtrip extra e inofensivo (vuelve 0
  // items), no hace falta un COUNT aparte solo para saberlo de antemano.
  const [hayMas, setHayMas] = useState(itemsIniciales.length >= PAGE_SIZE_MURO);
  const [cargando, setCargando] = useState(false);
  const sentinelaRef = useRef<HTMLDivElement>(null);

  const cargarMas = useCallback(async () => {
    if (cargando || !hayMas || items.length === 0) return;
    setCargando(true);
    const ultimoId = items[items.length - 1]!.id;
    const resultado = await obtenerMasBitacora({ cursorId: ultimoId, categoria, desde, hasta });
    if (resultado.ok) {
      setItems((actuales) => [...actuales, ...resultado.data]);
      setHayMas(resultado.data.length >= PAGE_SIZE_MURO);
    } else {
      setHayMas(false);
    }
    setCargando(false);
  }, [cargando, hayMas, items, categoria, desde, hasta]);

  useEffect(() => {
    const nodo = sentinelaRef.current;
    if (!nodo || !hayMas) return;

    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          cargarMas();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(nodo);
    return () => observer.disconnect();
  }, [cargarMas, hayMas]);

  // Actualiza/quita la nota en el estado local ya cargado — no depende de
  // router.refresh() para reflejarse (BitacoraMuro ya tiene su propio
  // `items`, montado una sola vez desde itemsIniciales; un refresh del
  // Server Component no lo vuelve a sincronizar sin remontarse, ver el
  // comentario de arriba sobre por qué esto usa `key`, no un efecto).
  function actualizarNotaLocal(notaActualizada: {
    id: string;
    categoria: CategoriaBitacora;
    contenido: string;
  }) {
    setItems((actuales) =>
      actuales.map((nota) => (nota.id === notaActualizada.id ? { ...nota, ...notaActualizada } : nota)),
    );
  }

  function eliminarNotaLocal(notaId: string) {
    setItems((actuales) => actuales.filter((nota) => nota.id !== notaId));
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay notas.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((nota) => (
        <article key={nota.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline" className={CATEGORIA_CLASE[nota.categoria]}>
              {CATEGORIA_LABEL[nota.categoria]}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {formatearFechaHora(nota.fecha)}
              </span>
              <EditarNotaBitacoraDialog
                nota={{ id: nota.id, categoria: nota.categoria, contenido: nota.contenido }}
                onExito={actualizarNotaLocal}
              />
              <EliminarNotaBitacoraDialog
                notaId={nota.id}
                onExito={() => eliminarNotaLocal(nota.id)}
              />
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{nota.contenido}</p>
          <p className="mt-2 text-sm text-muted-foreground">{nota.usuario.nombre}</p>
        </article>
      ))}
      {hayMas ? (
        <div ref={sentinelaRef} aria-hidden className="h-4" />
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">No hay más notas.</p>
      )}
    </div>
  );
}
