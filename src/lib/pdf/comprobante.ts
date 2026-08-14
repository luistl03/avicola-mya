import { jsPDF } from "jspdf";

// Cliente-only a propósito: este módulo nunca se importa desde `server/` ni
// desde un Server Component — jsPDF genera el documento enteramente en el
// navegador, sin backend nuevo (ver "Decisión de diseño: generación de
// PDF", specs/sprint-09-pos-carrito-cierre/plan.md). Solo
// ComprobanteDialog (Client Component) lo invoca.
//
// Formato 80mm (recibo térmico), pedido explícito del Product Owner con un
// ejemplo real de otro proyecto (Laravel Blade + HTML/CSS para un
// comprobante de hospedaje) — se toma la ESTRUCTURA visual de ese ejemplo
// (encabezado con logo, líneas punteadas/sólidas como separadores, filas
// etiqueta/valor, secciones con título, total destacado) adaptada al
// dominio de este proyecto (Venta/DetalleVenta), no una copia — este
// comprobante no tiene serie/número fiscal (D-level: sin SUNAT en la v1),
// así que en vez de eso muestra una referencia corta (primeros 8
// caracteres del id de Venta, misma referencia que usa el nombre de
// archivo del PDF).

export type ItemComprobante = {
  tipo: "PAQUETE" | "BANDEJA";
  pesoKg: number;
  precioKiloAplicado: number;
  subtotal: number;
};

export type DatosComprobante = {
  ventaId: string;
  fecha: Date;
  clienteNombre: string;
  vendedorNombre: string;
  items: ItemComprobante[];
  descuento: number;
  totalCobrado: number;
  metodoPago: "EFECTIVO" | "YAPE" | "PLIN" | "TRANSFERENCIA";
};

const ETIQUETA_TIPO: Record<ItemComprobante["tipo"], string> = {
  PAQUETE: "Paquete",
  BANDEJA: "Bandeja",
};

const ETIQUETA_METODO_PAGO: Record<DatosComprobante["metodoPago"], string> = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFERENCIA: "Transferencia",
};

function formatearSoles(valor: number): string {
  return `S/ ${valor.toFixed(2)}`;
}

// Referencia corta compartida entre el PDF (bloque "N° ...") y el nombre
// de archivo — una sola función para que nunca puedan mostrar hex
// distinto entre sí.
function referenciaCorta(ventaId: string): string {
  return ventaId.slice(0, 8).toUpperCase();
}

// Recorta un valor largo (ej. un nombre de cliente extenso) para que
// entre en una fila de 8pt Courier sin desbordar el ancho de contenido —
// mismo motivo que cualquier columna de tabla con ancho fijo del proyecto.
function truncar(texto: string, maximo: number): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

// --- Layout: recibo térmico de 80mm ---
const ANCHO_MM = 80;
const MARGEN_MM = 5;
const X_IZQ = MARGEN_MM;
const X_DER = ANCHO_MM - MARGEN_MM;
const X_CENTRO = ANCHO_MM / 2;
const ANCHO_VALOR_MAX = 26; // caracteres, a 8pt Courier entra cómodo en el espacio libre de una fila etiqueta/valor

type Bloque = { alto: number; dibujar: (doc: jsPDF, y: number) => void };

function lineaPunteada(doc: jsPDF, y: number) {
  doc.setLineDashPattern([0.6, 0.6], 0);
  doc.setDrawColor(0);
  doc.line(X_IZQ, y, X_DER, y);
  doc.setLineDashPattern([], 0);
}

function lineaSolida(doc: jsPDF, y: number) {
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(0);
  doc.line(X_IZQ, y, X_DER, y);
}

function separador(tipo: "punteada" | "solida" = "punteada"): Bloque {
  return {
    alto: 4,
    dibujar: (doc, y) => (tipo === "punteada" ? lineaPunteada(doc, y + 2) : lineaSolida(doc, y + 2)),
  };
}

function tituloSeccion(texto: string): Bloque {
  return {
    alto: 4.5,
    dibujar: (doc, y) => {
      doc.setFont("courier", "bold");
      doc.setFontSize(7.5);
      doc.text(texto.toUpperCase(), X_IZQ, y + 3);
    },
  };
}

function filaEtiquetaValor(
  etiqueta: string,
  valor: string,
  opciones: { negrita?: boolean; tamano?: number; alto?: number } = {},
): Bloque {
  const tamano = opciones.tamano ?? 8;
  const alto = opciones.alto ?? 4;
  return {
    alto,
    dibujar: (doc, y) => {
      doc.setFont("courier", opciones.negrita ? "bold" : "normal");
      doc.setFontSize(tamano);
      doc.text(etiqueta, X_IZQ, y + alto - 1.2);
      doc.text(truncar(valor, ANCHO_VALOR_MAX), X_DER, y + alto - 1.2, { align: "right" });
    },
  };
}

function bloqueItem(item: ItemComprobante): Bloque {
  return {
    alto: 7,
    dibujar: (doc, y) => {
      doc.setFont("courier", "normal");
      doc.setFontSize(8.5);
      doc.text(ETIQUETA_TIPO[item.tipo], X_IZQ, y + 3.2);
      doc.text(formatearSoles(item.subtotal), X_DER, y + 3.2, { align: "right" });

      doc.setFontSize(7);
      doc.setTextColor(90);
      doc.text(
        `  ${item.pesoKg.toFixed(3)} kg x ${formatearSoles(item.precioKiloAplicado)}/kg`,
        X_IZQ,
        y + 6.4,
      );
      doc.setTextColor(0);
    },
  };
}

// Base64 cacheado dentro del módulo — evita rehacer el fetch + FileReader
// en cada comprobante dentro de la misma sesión del navegador (no hace
// falta más que esto, no es una operación frecuente). `undefined` = todavía
// no se intentó cargar, `null` = se intentó y falló (sin logo disponible,
// camino defensivo — el comprobante se sigue generando igual).
let logoCacheado: string | null | undefined;

async function cargarLogoDataUrl(): Promise<string | null> {
  if (logoCacheado !== undefined) return logoCacheado;
  try {
    const respuesta = await fetch("/avicolamya-isotipo.png");
    const blob = await respuesta.blob();
    logoCacheado = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch {
    logoCacheado = null; // sin logo, el comprobante se genera igual
  }
  return logoCacheado;
}

function construirBloques(venta: DatosComprobante, logoDataUrl: string | null): Bloque[] {
  const bruto = venta.totalCobrado + venta.descuento;
  const referencia = referenciaCorta(venta.ventaId);
  const bloques: Bloque[] = [];

  if (logoDataUrl) {
    bloques.push({
      alto: 17,
      dibujar: (doc, y) => doc.addImage(logoDataUrl, "PNG", X_CENTRO - 8, y, 16, 16),
    });
  }

  bloques.push({
    alto: 6,
    dibujar: (doc, y) => {
      doc.setFont("courier", "bold");
      doc.setFontSize(13);
      doc.text("AVÍCOLA M&A", X_CENTRO, y + 4, { align: "center" });
    },
  });
  bloques.push(separador("solida"));

  bloques.push({
    alto: 4,
    dibujar: (doc, y) => {
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text("COMPROBANTE DE VENTA", X_CENTRO, y + 3, { align: "center" });
    },
  });
  bloques.push({
    alto: 6,
    dibujar: (doc, y) => {
      doc.setFont("courier", "bold");
      doc.setFontSize(11);
      doc.text(`N° ${referencia}`, X_CENTRO, y + 4, { align: "center" });
    },
  });

  bloques.push(separador());

  bloques.push(
    filaEtiquetaValor(
      "Fecha",
      venta.fecha.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }),
    ),
  );
  bloques.push(filaEtiquetaValor("Cliente", venta.clienteNombre));
  bloques.push(filaEtiquetaValor("Vendedor", venta.vendedorNombre));

  bloques.push(separador());
  bloques.push(tituloSeccion("Ítems"));
  for (const item of venta.items) {
    bloques.push(bloqueItem(item));
  }

  bloques.push(separador());
  bloques.push(filaEtiquetaValor("Bruto", formatearSoles(bruto)));
  bloques.push(filaEtiquetaValor("Descuento", formatearSoles(venta.descuento)));
  bloques.push(separador("solida"));
  bloques.push(filaEtiquetaValor("TOTAL COBRADO", formatearSoles(venta.totalCobrado), { negrita: true, tamano: 11, alto: 6 }));

  bloques.push(separador());
  bloques.push(filaEtiquetaValor("Método de pago", ETIQUETA_METODO_PAGO[venta.metodoPago]));

  bloques.push(separador());
  bloques.push({
    alto: 7,
    dibujar: (doc, y) => {
      doc.setFont("courier", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(90);
      doc.text("Comprobante interno de gestión.", X_CENTRO, y + 3, { align: "center" });
      doc.setTextColor(0);
    },
  });

  return bloques;
}

// bruto se recalcula acá (totalCobrado + descuento) en vez de recibirse
// como parámetro aparte — es un dato puramente derivado para mostrar en el
// PDF, no un valor que haga falta persistir ni confiar de otra fuente
// (mismo criterio que "campos calculados: nunca se guardan valores que se
// desactualizan solos", memory/modelo-datos.md — acá aplica el mismo
// espíritu aunque no sea un campo de base de datos).
//
// Async porque carga el logo (fetch + FileReader) antes de armar el
// documento — jsPDF no permite cambiar el tamaño de página después de
// crearlo, así que el alto exacto (que depende de si el logo cargó o no,
// y de cuántos ítems hay) se calcula ANTES de instanciar jsPDF, a partir
// de la misma lista de bloques que después se dibuja — una sola fuente de
// verdad para "cuánto mide" y "qué dibuja", sin que puedan desincronizarse.
export async function generarComprobantePdf(venta: DatosComprobante): Promise<jsPDF> {
  const logoDataUrl = await cargarLogoDataUrl();
  const bloques = construirBloques(venta, logoDataUrl);
  const altoTotal = MARGEN_MM * 2 + bloques.reduce((suma, bloque) => suma + bloque.alto, 0);

  const doc = new jsPDF({ unit: "mm", format: [ANCHO_MM, altoTotal] });
  doc.setFont("courier", "normal");

  let y = MARGEN_MM;
  for (const bloque of bloques) {
    bloque.dibujar(doc, y);
    y += bloque.alto;
  }

  return doc;
}

// Nombre de archivo legible (no el UUID crudo de la Venta) — pedido
// explícito del Product Owner. Fecha + hora + la MISMA referencia hex que
// aparece impresa en el propio PDF ("N° ..."), para que el archivo
// descargado y el papel/pantalla que muestra sean fáciles de emparejar a
// simple vista.
export function nombreArchivoComprobante(venta: Pick<DatosComprobante, "fecha" | "ventaId">): string {
  const { fecha, ventaId } = venta;
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  const hh = String(fecha.getHours()).padStart(2, "0");
  const min = String(fecha.getMinutes()).padStart(2, "0");
  return `Comprobante-${yyyy}${mm}${dd}-${hh}${min}-${referenciaCorta(ventaId)}.pdf`;
}
