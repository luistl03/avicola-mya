import { AlertTriangle } from "lucide-react";

import { TarjetaCredito } from "@/components/domain/creditos/tarjeta-credito";
import { calcularNivelAlerta, calcularSaldoPendiente, type NivelAlertaCredito } from "@/server/services/credito";

export type CreditoPendiente = {
  id: string;
  clienteNombre: string;
  montoTotal: number;
  montoPagado: number;
  fechaLimite: Date;
};

const SECCIONES: { nivel: NivelAlertaCredito; titulo: string }[] = [
  { nivel: "VENCIDO_CRITICO", titulo: "Vencido crítico (más de 7 días)" },
  { nivel: "VENCIDO_RECIENTE", titulo: "Vencido reciente (hasta 7 días)" },
  { nivel: "POR_VENCER", titulo: "Por vencer (próximos 3 días)" },
];

// Agrupa los Credito PENDIENTE (ya traídos por app/(app)/creditos/page.tsx
// vía listarCreditosPendientesConCliente()) en las tres secciones de
// antigüedad, usando calcularNivelAlerta() — un Credito sin ningún nivel
// (más de 3 días de margen) no aparece en ningún lado (H3, spec.md).
export function PanelAlertas({ creditos, hoy }: { creditos: CreditoPendiente[]; hoy: Date }) {
  const agrupados = new Map<NivelAlertaCredito, CreditoPendiente[]>();
  for (const credito of creditos) {
    const nivel = calcularNivelAlerta(credito.fechaLimite, hoy);
    if (!nivel) continue;
    agrupados.set(nivel, [...(agrupados.get(nivel) ?? []), credito]);
  }

  const hayAlertas = SECCIONES.some((seccion) => (agrupados.get(seccion.nivel)?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Alertas por antigüedad</p>
      </div>

      {!hayAlertas ? (
        <p className="text-sm text-muted-foreground">Ningún crédito pendiente está por vencer o vencido.</p>
      ) : (
        SECCIONES.map((seccion) => {
          const items = agrupados.get(seccion.nivel);
          if (!items || items.length === 0) return null;
          return (
            <div key={seccion.nivel} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                {seccion.titulo} ({items.length})
              </p>
              <ul className="flex flex-col gap-2">
                {items.map((credito) => (
                  <TarjetaCredito
                    key={credito.id}
                    creditoId={credito.id}
                    clienteNombre={credito.clienteNombre}
                    saldoPendiente={calcularSaldoPendiente(credito.montoTotal, credito.montoPagado)}
                    fechaLimite={credito.fechaLimite}
                    nivel={seccion.nivel}
                    hoy={hoy}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
