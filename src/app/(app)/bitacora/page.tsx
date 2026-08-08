import type { CategoriaBitacora } from "@prisma/client";

import { BitacoraFiltros } from "@/components/domain/bitacora/bitacora-filtros";
import { BitacoraMuro } from "@/components/domain/bitacora/bitacora-muro";
import { NuevaNotaBitacoraDialog } from "@/components/domain/bitacora/nueva-nota-bitacora-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { PAGE_SIZE_MURO } from "@/lib/constants";
import { listarBitacoraPagina } from "@/server/repositories/bitacora";

const CATEGORIAS_VALIDAS: CategoriaBitacora[] = ["ALIMENTACION", "VACUNACION", "OBSERVACION"];

function categoriaValida(valor: string | undefined): CategoriaBitacora | undefined {
  return CATEGORIAS_VALIDAS.find((categoria) => categoria === valor);
}

// searchParams es un límite de entrada externo (viene de la URL, no de
// una Server Action validada con Zod) — un valor manipulado a mano no
// puede filtrar por fuera de las tres categorías reales ni convertirse en
// una fecha inválida que rompa la query de Prisma.
//
// El offset fijo "-05:00" (no Intl/timeZone) alcanza porque D5 ya fija
// América/Lima sin horario de verano — inicio/fin de día en Lima es
// siempre la medianoche/23:59:59.999 con ese mismo offset todo el año.
function inicioDeDiaEnLima(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const fecha = new Date(`${valor}T00:00:00.000-05:00`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

function finDeDiaEnLima(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const fecha = new Date(`${valor}T23:59:59.999-05:00`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; desde?: string; hasta?: string }>;
}) {
  // Sin guard de rol: mismo criterio que /mortalidad — abierta a GERENTE
  // y OPERARIO por igual, sin entrada en server/auth/rbac.ts.
  const { categoria: categoriaParam, desde: desdeParam, hasta: hastaParam } = await searchParams;
  const categoria = categoriaValida(categoriaParam);
  const desde = inicioDeDiaEnLima(desdeParam);
  const hasta = finDeDiaEnLima(hastaParam);

  const itemsIniciales = await listarBitacoraPagina({
    take: PAGE_SIZE_MURO,
    categoria,
    desde,
    hasta,
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader title="Bitácora" actions={<NuevaNotaBitacoraDialog />} />
      {/* BitacoraFiltros NO lleva key: es el propio componente el que
      dispara la navegación que cambiaría ese key (bug real encontrado —
      un key derivado de los mismos parámetros que su propio
      actualizarFiltro() actualiza lo remonta a mitad de su propia
      transición, dejando instancias viejas visibles a la vez que la
      nueva). Su estado local (desdeValue/hastaValue/abierto) alcanza con
      sincronizarse solo por sus propios handlers, sin necesitar re-sync
      externo. BitacoraMuro sí lleva key porque es un consumidor pasivo —
      nunca navega por su cuenta, así que remontarlo cuando cambia la URL
      es seguro. */}
      <BitacoraFiltros categoria={categoriaParam} desde={desdeParam} hasta={hastaParam} />
      <BitacoraMuro
        key={`${categoriaParam ?? ""}|${desdeParam ?? ""}|${hastaParam ?? ""}`}
        itemsIniciales={itemsIniciales}
        categoria={categoria}
        desde={desde}
        hasta={hasta}
      />
    </div>
  );
}
