export type NivelAlertaCredito = "POR_VENCER" | "VENCIDO_RECIENTE" | "VENCIDO_CRITICO";

const DIAS_POR_VENCER = 3;
const DIAS_LIMITE_RECIENTE = 7;
const DIAS_FECHA_LIMITE_SUGERIDA = 15;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Piso a días completos, mismo criterio que calcularEdadEnSemanas
// (server/services/lote.ts) — sin horas/minutos sueltos.
function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA);
}

// null = sin alerta (todavía falta más de DIAS_POR_VENCER para el límite).
// Solo tiene sentido llamarla con un Credito.estado === "PENDIENTE" — un
// LIQUIDADO nunca entra acá (el caller filtra antes de llamarla).
export function calcularNivelAlerta(fechaLimite: Date, hoy: Date): NivelAlertaCredito | null {
  const diasVencido = diasEntre(fechaLimite, hoy); // negativo si aún no vence
  if (diasVencido < 0) {
    return diasVencido >= -DIAS_POR_VENCER ? "POR_VENCER" : null;
  }
  return diasVencido <= DIAS_LIMITE_RECIENTE ? "VENCIDO_RECIENTE" : "VENCIDO_CRITICO";
}

export function calcularSaldoPendiente(montoTotal: number, montoPagado: number): number {
  return Math.round((montoTotal - montoPagado) * 100) / 100;
}

export function calcularFechaLimiteSugerida(hoy: Date): Date {
  return new Date(hoy.getTime() + DIAS_FECHA_LIMITE_SUGERIDA * MS_POR_DIA);
}

// Estrictamente posterior a hoy ("mínimo mañana") — comparación en
// América/Lima, mismo criterio D5 que fechaIngreso de Lote.
export function validarFechaLimite(fechaLimite: Date, hoy: Date): boolean {
  return fechaLimite.getTime() > hoy.getTime();
}

// Agrega SOLO los niveles ya vencidos (VENCIDO_RECIENTE + VENCIDO_CRITICO)
// — "Por vencer" todavía no es deuda vencida, no cuenta para el resumen
// del dashboard. Recibe la misma lista que ya trajo
// listarCreditosPendientesConCliente (repository) — sin una query aparte,
// dashboard y /creditos comparten una sola fuente de datos.
// Sprint 16 — decide, sin tocar la base, qué créditos de la lista ya
// traída por el repository (solo PENDIENTES con
// notificacionVencidoEnviada = false, ver
// listarCreditosPendientesSinNotificar) cruzan a "recién vencido" hoy.
// Reutiliza calcularNivelAlerta — no un cuarto nivel nuevo ni un cálculo
// de fecha aparte. Como el repository ya excluye los créditos ya
// notificados, un crédito solo puede aparecer acá una vez en su historia
// (la primera corrida del cron que lo ve en VENCIDO_RECIENTE) — no hace
// falta comparar contra "exactamente el día que cruzó", el propio flag
// de "ya notificado" evita el reenvío en días siguientes.
export function creditosParaNotificar(
  creditos: { id: string; fechaLimite: Date }[],
  hoy: Date,
): string[] {
  return creditos
    .filter((credito) => calcularNivelAlerta(credito.fechaLimite, hoy) === "VENCIDO_RECIENTE")
    .map((credito) => credito.id);
}

// Sprint 16 — arma el texto del push, función pura y testeable sin red.
export function construirMensajePush(credito: {
  cliente: { nombre: string };
  montoTotal: number;
  montoPagado: number;
}): { titulo: string; cuerpo: string } {
  const saldo = calcularSaldoPendiente(credito.montoTotal, credito.montoPagado);
  return {
    titulo: "Crédito vencido",
    cuerpo: `${credito.cliente.nombre} debe S/ ${saldo.toFixed(2)}`,
  };
}

export function resumirAlertasCredito(
  creditos: { montoTotal: number; montoPagado: number; fechaLimite: Date }[],
  hoy: Date,
): { cantidadVencidos: number; montoVencido: number } {
  return creditos.reduce(
    (resumen, credito) => {
      const nivel = calcularNivelAlerta(credito.fechaLimite, hoy);
      if (nivel === "VENCIDO_RECIENTE" || nivel === "VENCIDO_CRITICO") {
        resumen.cantidadVencidos += 1;
        resumen.montoVencido += calcularSaldoPendiente(credito.montoTotal, credito.montoPagado);
      }
      return resumen;
    },
    { cantidadVencidos: 0, montoVencido: 0 },
  );
}
