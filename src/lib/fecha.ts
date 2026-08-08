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
