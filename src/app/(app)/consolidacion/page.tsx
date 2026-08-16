import { ConsolidarSueltosDialog } from "@/components/domain/consolidacion/consolidar-sueltos-dialog";
import { RomperInventarioSection } from "@/components/domain/consolidacion/romper-inventario-section";
import { SaldosTabla } from "@/components/domain/consolidacion/saldos-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { listarInventarioSueltosConSaldo } from "@/server/repositories/inventario";
import { listarBandejasDisponibles, listarPaquetesDisponibles } from "@/server/repositories/venta";

// Sin guard de rol: igual que /recoleccion/mortalidad/bitacora, esta
// pantalla queda abierta a GERENTE y OPERARIO por igual (decisión de
// diseño confirmada en spec.md). Sin entrada en server/auth/rbac.ts.
export default async function ConsolidacionPage() {
  const [saldos, paquetesDisponibles, bandejasDisponibles] = await Promise.all([
    listarInventarioSueltosConSaldo(),
    // NUEVO Sprint 10 — "Romper Paquete/Bandeja" vive acá, no en /pos: la
    // granja no vende huevo por unidad (decisión corregida con el Product
    // Owner), así que romper siempre alimenta los wizards de esta misma
    // pantalla. listarPaquetesDisponibles()/listarBandejasDisponibles()
    // reusadas tal cual de server/repositories/venta.ts (Sprint 9) — mismo
    // dataset que ya usa /pos para vender, sin ninguna función nueva.
    listarPaquetesDisponibles(),
    listarBandejasDisponibles(),
  ]);

  // Forma que pide ConsolidarSueltosDialog (galpón/lote "aplanados", sin el
  // include anidado de Prisma) — se deriva acá una sola vez y se pasa a
  // los dos wizards.
  const saldosParaWizard = saldos.map((s) => ({
    galponId: s.galponId,
    loteId: s.loteId,
    galponNombre: s.galpon.nombre,
    loteCodigo: s.lote.codigo,
    disponible: s.cantidad,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Consolidación"
        actions={
          <>
            <ConsolidarSueltosDialog
              tipo="BANDEJA"
              unidadDestino={UNIDADES_POR_BANDEJA}
              etiquetaUnidad="bandeja"
              titulo="Armar Bandeja"
              descripcion="Elige uno o más orígenes con sueltos disponibles. El sistema arma automáticamente todas las bandejas de 30 que el saldo permita."
              variantTrigger="outline"
              saldos={saldosParaWizard}
            />
            <ConsolidarSueltosDialog
              tipo="PAQUETE_MIXTO"
              unidadDestino={UNIDADES_POR_PAQUETE}
              etiquetaUnidad="paquete"
              titulo="Armar Paquete Mixto"
              descripcion="Elige uno o más orígenes con sueltos disponibles. El sistema arma automáticamente todos los paquetes de 180 que el saldo permita."
              variantTrigger="default"
              saldos={saldosParaWizard}
            />
          </>
        }
      />
      <SaldosTabla saldos={saldos} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Listado de inventario</h2>
        <RomperInventarioSection
          // Decimal de Prisma nunca cruza el límite Server→Client Component
          // (mismo criterio que app/(app)/pos/page.tsx, Sprint 9) — se
          // convierte a number acá antes de pasarlo.
          paquetesDisponibles={paquetesDisponibles.map((paquete) => ({ id: paquete.id, peso: Number(paquete.peso) }))}
          bandejasDisponibles={bandejasDisponibles.map((bandeja) => ({ id: bandeja.id, peso: Number(bandeja.peso) }))}
        />
      </div>
    </div>
  );
}
