import { Badge } from "@/components/ui/badge";
import { RegistrarAbonoDialog } from "@/components/domain/creditos/registrar-abono-dialog";
import type { NivelAlertaCredito } from "@/server/services/credito";

const CLASE_POR_NIVEL: Record<NivelAlertaCredito, string> = {
  POR_VENCER: "badge-alerta-por-vencer",
  VENCIDO_RECIENTE: "badge-alerta-vencido-reciente",
  VENCIDO_CRITICO: "badge-alerta-vencido-critico",
};

const ETIQUETA_POR_NIVEL: Record<NivelAlertaCredito, string> = {
  POR_VENCER: "Por vencer",
  VENCIDO_RECIENTE: "Vencido",
  VENCIDO_CRITICO: "Vencido crítico",
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Solo texto ("vence en N días"/"vencido hace N días") — no es una regla
// de negocio que necesite su propia función pura en server/services/
// (a diferencia de calcularNivelAlerta, que sí decide un umbral real), es
// puramente descriptivo.
function textoAntiguedad(fechaLimite: Date, hoy: Date): string {
  const dias = Math.floor((hoy.getTime() - fechaLimite.getTime()) / MS_POR_DIA);
  if (dias < 0) return `Vence en ${-dias} día${-dias === 1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoy";
  return `Vencido hace ${dias} día${dias === 1 ? "" : "s"}`;
}

// Una tarjeta de Credito PENDIENTE dentro del panel de alertas
// (PanelAlertas) — cliente, saldo pendiente, fecha límite, nivel de
// antigüedad, y el botón real para registrar un abono.
export function TarjetaCredito({
  clienteNombre,
  saldoPendiente,
  fechaLimite,
  nivel,
  hoy,
  creditoId,
}: {
  clienteNombre: string;
  saldoPendiente: number;
  fechaLimite: Date;
  nivel: NivelAlertaCredito;
  hoy: Date;
  creditoId: string;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{clienteNombre}</span>
        <Badge variant="outline" className={CLASE_POR_NIVEL[nivel]}>
          {ETIQUETA_POR_NIVEL[nivel]}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>Saldo: S/ {saldoPendiente.toFixed(2)}</span>
        <span>{textoAntiguedad(fechaLimite, hoy)}</span>
      </div>
      <div>
        <RegistrarAbonoDialog creditoId={creditoId} saldoPendiente={saldoPendiente} />
      </div>
    </li>
  );
}
