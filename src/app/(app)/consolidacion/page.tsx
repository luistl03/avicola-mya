import { ConsolidarSueltosDialog } from "@/components/domain/consolidacion/consolidar-sueltos-dialog";
import { SaldosTabla } from "@/components/domain/consolidacion/saldos-tabla";
import { PageHeader } from "@/components/layout/page-header";
import { UNIDADES_POR_BANDEJA, UNIDADES_POR_PAQUETE } from "@/lib/constants";
import { listarInventarioSueltosConSaldo } from "@/server/repositories/inventario";

// Sin guard de rol: igual que /recoleccion/mortalidad/bitacora, esta
// pantalla queda abierta a GERENTE y OPERARIO por igual (decisión de
// diseño confirmada en spec.md). Sin entrada en server/auth/rbac.ts.
export default async function ConsolidacionPage() {
  const saldos = await listarInventarioSueltosConSaldo();

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
    </div>
  );
}
