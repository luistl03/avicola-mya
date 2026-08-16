// Funciones puras, sin Prisma — la Server Action (server/actions/venta.ts)
// resuelve pesoKg real (releído de Paquete/BandejaSuelta) y precioKiloVigente
// real (obtenerPrecioKiloVigente()) del lado del servidor, nunca del
// payload del cliente (ver H2, spec.md) — estas funciones solo hacen la
// aritmética sobre esos valores ya confiables.

// Redondeo a centavos — mismo criterio que Decimal(10,2) en el schema, para
// que el número que llega a Prisma no arrastre el ruido de punto flotante
// de sumar/restar decimales en JS (ej. 0.1 + 0.2).
function redondearCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularBrutoVenta(pesosKg: number[], precioKiloVigente: number): number {
  const bruto = pesosKg.reduce((suma, peso) => suma + peso * precioKiloVigente, 0);
  return redondearCentavos(bruto);
}

// El límite superior es inclusivo a propósito: un descuento que deja
// totalCobrado en exactamente 0 es una venta válida (ej. una cortesía
// completa), no un error — solo se rechaza si el descuento SUPERA el bruto,
// lo que dejaría totalCobrado negativo.
export function validarDescuento(bruto: number, descuento: number): boolean {
  return descuento >= 0 && descuento <= bruto;
}

export function calcularTotalCobrado(bruto: number, descuento: number): number {
  return redondearCentavos(bruto - descuento);
}

// Mismo criterio que validarDescuento: el límite superior es inclusivo
// (montoContado === totalCobrado es "todo al contado" dentro de una venta
// marcada a crédito — caso límite válido, sin caso de negocio especial).
// Sprint 11.
export function validarMontoContado(totalCobrado: number, montoContado: number): boolean {
  return montoContado >= 0 && montoContado <= totalCobrado;
}

export function calcularMontoCredito(totalCobrado: number, montoContado: number): number {
  return redondearCentavos(totalCobrado - montoContado);
}
