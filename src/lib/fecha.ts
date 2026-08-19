// Fecha + hora legible, sin segundos (a pedido del Product Owner: no
// aportan nada para saber cuándo se registró una mortalidad o una nota).
// Zona fija América/Lima (D5), no la del navegador.
export function formatearFechaHora(fecha: Date): string {
  return fecha.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Fecha-calendario SIN hora (Egreso.fecha, Lote.fechaIngreso, Credito.fechaLimite,
// etc.) — SIEMPRE con timeZone: "UTC", nunca "America/Lima". Estos campos
// se guardan como medianoche UTC (mismo criterio que hoyEnLima(), D5);
// formatearlos en Lima les resta un día durante la ventana 00:00-05:00 UTC
// (bug real documentado en memory/estado-proyecto.md, cierre de
// Sprint 11, sobre Credito.fechaLimite). No usar para un instante real
// con hora (creadoEn, Venta.fecha, HistorialAbonos.fecha) — para eso está
// formatearFechaHora() arriba.
export function formatearFecha(fecha: Date): string {
  return fecha.toLocaleDateString("es-PE", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
