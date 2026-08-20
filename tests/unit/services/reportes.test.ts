import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agruparCreditosPorNivelAlerta,
  agruparGastoPorCategoria,
  agruparMortalidadPorLote,
  agruparMortalidadPorTipo,
  agruparSumaPorDia,
  agruparVentasPorDiaYMetodo,
  combinarBalance,
  construirLibroExcel,
  finDeDiaEnLimaExclusivo,
  inicioDeDiaEnLima,
  listarDiasDelRango,
  parsearRangoFechas,
  rangoMesActual,
  rankearClientes,
  sumarTotal,
} from "@/server/services/reportes";

describe("inicioDeDiaEnLima / finDeDiaEnLimaExclusivo", () => {
  it("inicioDeDiaEnLima produce el instante real de medianoche en Lima (UTC-5)", () => {
    const resultado = inicioDeDiaEnLima("2026-08-01");
    expect(resultado).toEqual(new Date("2026-08-01T05:00:00.000Z"));
  });

  it("finDeDiaEnLimaExclusivo produce la medianoche del día SIGUIENTE en Lima", () => {
    const resultado = finDeDiaEnLimaExclusivo("2026-08-01");
    expect(resultado).toEqual(new Date("2026-08-02T05:00:00.000Z"));
  });
});

describe("rangoMesActual", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve el primer y último día del mes actual, como instantes reales de Lima", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    const resultado = rangoMesActual();

    expect(resultado.desde).toEqual(new Date("2026-08-01T05:00:00.000Z"));
    expect(resultado.hasta).toEqual(new Date("2026-09-01T05:00:00.000Z")); // 1° de septiembre, exclusivo
  });

  it("calcula correctamente el último día de febrero (28) en un año no bisiesto", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T15:00:00.000Z"));

    const resultado = rangoMesActual();

    expect(resultado.hasta).toEqual(new Date("2026-03-01T05:00:00.000Z"));
  });

  it("cruza correctamente de diciembre a enero del año siguiente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T15:00:00.000Z"));

    const resultado = rangoMesActual();

    expect(resultado.desde).toEqual(new Date("2026-12-01T05:00:00.000Z"));
    expect(resultado.hasta).toEqual(new Date("2027-01-01T05:00:00.000Z"));
  });
});

describe("parsearRangoFechas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undefined en cualquiera de los dos devuelve null", () => {
    expect(parsearRangoFechas(undefined, "2026-08-10")).toBeNull();
    expect(parsearRangoFechas("2026-08-01", undefined)).toBeNull();
  });

  it("un formato malformado devuelve null", () => {
    expect(parsearRangoFechas("01-08-2026", "2026-08-10")).toBeNull();
    expect(parsearRangoFechas("2026-08-01", "10/08/2026")).toBeNull();
  });

  it("una fecha con el formato correcto pero un calendario inválido (mes 13) devuelve null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    expect(parsearRangoFechas("2026-13-01", "2026-08-10")).toBeNull();
  });

  it("un rango válido con desde y hasta dentro de hoy se parsea correctamente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    const resultado = parsearRangoFechas("2026-08-01", "2026-08-10");

    expect(resultado).toEqual({
      desde: new Date("2026-08-01T05:00:00.000Z"),
      hasta: new Date("2026-08-11T05:00:00.000Z"), // día siguiente a "hasta", exclusivo
    });
  });

  it("desde posterior a hasta devuelve null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    expect(parsearRangoFechas("2026-08-10", "2026-08-01")).toBeNull();
  });

  it("desde igual a hasta es un rango válido de un solo día", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    const resultado = parsearRangoFechas("2026-08-05", "2026-08-05");

    expect(resultado).toEqual({
      desde: new Date("2026-08-05T05:00:00.000Z"),
      hasta: new Date("2026-08-06T05:00:00.000Z"),
    });
  });

  it("hasta en el futuro devuelve null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z")); // hoy en Lima: 15 de agosto

    expect(parsearRangoFechas("2026-08-01", "2026-08-16")).toBeNull();
  });

  it("hasta = hoy es válido (el límite es 'no futuro', hoy no es futuro)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T15:00:00.000Z"));

    const resultado = parsearRangoFechas("2026-08-01", "2026-08-15");

    expect(resultado).not.toBeNull();
  });
});

describe("agruparSumaPorDia", () => {
  it("agrupa y suma varios registros del mismo día", () => {
    const resultado = agruparSumaPorDia(
      [
        { fecha: new Date("2026-08-05T14:00:00.000Z"), cantidad: 100 },
        { fecha: new Date("2026-08-05T20:00:00.000Z"), cantidad: 50 },
        { fecha: new Date("2026-08-06T14:00:00.000Z"), cantidad: 30 },
      ],
      (r) => r.fecha,
      (r) => r.cantidad,
    );

    expect(resultado).toEqual([
      { fecha: "2026-08-05", total: 150 },
      { fecha: "2026-08-06", total: 30 },
    ]);
  });

  it("ordena los días de forma ascendente aunque los registros lleguen desordenados", () => {
    const resultado = agruparSumaPorDia(
      [
        { fecha: new Date("2026-08-10T14:00:00.000Z"), cantidad: 1 },
        { fecha: new Date("2026-08-01T14:00:00.000Z"), cantidad: 1 },
      ],
      (r) => r.fecha,
      (r) => r.cantidad,
    );

    expect(resultado.map((r) => r.fecha)).toEqual(["2026-08-01", "2026-08-10"]);
  });

  it("una fecha cerca de medianoche UTC cae en el día correcto de América/Lima (D5)", () => {
    const resultado = agruparSumaPorDia(
      [{ fecha: new Date("2026-08-06T03:00:00.000Z"), cantidad: 10 }],
      (r) => r.fecha,
      (r) => r.cantidad,
    );

    expect(resultado).toEqual([{ fecha: "2026-08-05", total: 10 }]);
  });

  it("devuelve una lista vacía sin romper con una lista vacía de entrada", () => {
    const resultado = agruparSumaPorDia<{ fecha: Date; cantidad: number }>([], (r) => r.fecha, (r) => r.cantidad);

    expect(resultado).toEqual([]);
  });
});

describe("sumarTotal", () => {
  it("suma una lista de números", () => {
    expect(sumarTotal([10, 20, 5])).toBe(35);
  });

  it("una lista vacía suma 0", () => {
    expect(sumarTotal([])).toBe(0);
  });
});

describe("agruparMortalidadPorTipo", () => {
  it("separa y suma MUERTE y DESCARTE por separado", () => {
    const resultado = agruparMortalidadPorTipo([
      { tipo: "MUERTE", cantidad: 3 },
      { tipo: "DESCARTE", cantidad: 2 },
      { tipo: "MUERTE", cantidad: 1 },
    ]);

    expect(resultado).toEqual({ MUERTE: 4, DESCARTE: 2 });
  });

  it("una lista vacía devuelve ambos en 0", () => {
    expect(agruparMortalidadPorTipo([])).toEqual({ MUERTE: 0, DESCARTE: 0 });
  });
});

describe("listarDiasDelRango", () => {
  it("lista todos los días de un mes calendario completo, sin huecos", () => {
    const resultado = listarDiasDelRango(new Date("2026-08-01T05:00:00.000Z"), new Date("2026-09-01T05:00:00.000Z"));

    expect(resultado).toHaveLength(31);
    expect(resultado[0]).toBe("2026-08-01");
    expect(resultado[30]).toBe("2026-08-31");
  });

  it("el límite `hasta` es exclusivo", () => {
    const resultado = listarDiasDelRango(new Date("2026-08-01T05:00:00.000Z"), new Date("2026-08-03T05:00:00.000Z"));

    expect(resultado).toEqual(["2026-08-01", "2026-08-02"]);
  });

  it("un rango de un solo día devuelve un solo elemento", () => {
    const resultado = listarDiasDelRango(new Date("2026-08-05T05:00:00.000Z"), new Date("2026-08-06T05:00:00.000Z"));

    expect(resultado).toEqual(["2026-08-05"]);
  });
});

describe("agruparVentasPorDiaYMetodo", () => {
  const DIAS = ["2026-08-01", "2026-08-02", "2026-08-03"];

  it("suma cada venta en el día y método correctos, sin dejar huecos en los días sin ventas", () => {
    const resultado = agruparVentasPorDiaYMetodo(
      [
        { fecha: new Date("2026-08-01T14:00:00.000Z"), totalCobrado: 50, metodoPago: "EFECTIVO" },
        { fecha: new Date("2026-08-01T15:00:00.000Z"), totalCobrado: 30, metodoPago: "YAPE" },
        { fecha: new Date("2026-08-03T14:00:00.000Z"), totalCobrado: 20, metodoPago: "PLIN" },
      ],
      DIAS,
    );

    expect(resultado).toEqual([
      { fecha: "2026-08-01", EFECTIVO: 50, YAPE: 30, PLIN: 0, TRANSFERENCIA: 0 },
      { fecha: "2026-08-02", EFECTIVO: 0, YAPE: 0, PLIN: 0, TRANSFERENCIA: 0 },
      { fecha: "2026-08-03", EFECTIVO: 0, YAPE: 0, PLIN: 20, TRANSFERENCIA: 0 },
    ]);
  });

  it("ignora una venta cuya fecha cae fuera de los días provistos (defensivo)", () => {
    const resultado = agruparVentasPorDiaYMetodo(
      [{ fecha: new Date("2026-09-15T14:00:00.000Z"), totalCobrado: 999, metodoPago: "EFECTIVO" }],
      DIAS,
    );

    expect(resultado.every((fila) => fila.EFECTIVO === 0)).toBe(true);
  });

  it("suma varias ventas del mismo día y método", () => {
    const resultado = agruparVentasPorDiaYMetodo(
      [
        { fecha: new Date("2026-08-02T10:00:00.000Z"), totalCobrado: 10, metodoPago: "TRANSFERENCIA" },
        { fecha: new Date("2026-08-02T11:00:00.000Z"), totalCobrado: 15, metodoPago: "TRANSFERENCIA" },
      ],
      DIAS,
    );

    expect(resultado[1]).toEqual({ fecha: "2026-08-02", EFECTIVO: 0, YAPE: 0, PLIN: 0, TRANSFERENCIA: 25 });
  });
});

describe("rankearClientes", () => {
  it("ordena de mayor a menor monto total y agrupa ventas del mismo cliente", () => {
    const resultado = rankearClientes(
      [
        { clienteId: "c1", nombre: "Ana", tipo: "MAYORISTA", totalCobrado: 100 },
        { clienteId: "c2", nombre: "Beto", tipo: "MINORISTA", totalCobrado: 300 },
        { clienteId: "c1", nombre: "Ana", tipo: "MAYORISTA", totalCobrado: 50 },
      ],
      10,
    );

    expect(resultado).toEqual([
      { clienteId: "c2", nombre: "Beto", tipo: "MINORISTA", montoTotal: 300, cantidadVentas: 1 },
      { clienteId: "c1", nombre: "Ana", tipo: "MAYORISTA", montoTotal: 150, cantidadVentas: 2 },
    ]);
  });

  it("corta al límite indicado", () => {
    const ventas = Array.from({ length: 15 }, (_, i) => ({
      clienteId: `c${i}`,
      nombre: `Cliente ${i}`,
      tipo: "EVENTUAL" as const,
      totalCobrado: i,
    }));

    const resultado = rankearClientes(ventas, 10);

    expect(resultado).toHaveLength(10);
    expect(resultado[0].montoTotal).toBe(14);
  });

  it("una lista vacía devuelve un ranking vacío", () => {
    expect(rankearClientes([], 10)).toEqual([]);
  });
});

describe("agruparGastoPorCategoria", () => {
  it("incluye las 5 categorías siempre, en 0 si no hubo gasto", () => {
    const resultado = agruparGastoPorCategoria([{ categoria: "ALIMENTOS", monto: 500 }]);

    expect(resultado).toEqual([
      { categoria: "ALIMENTOS", total: 500 },
      { categoria: "INSUMOS_VACUNAS", total: 0 },
      { categoria: "SERVICIOS", total: 0 },
      { categoria: "MANTENIMIENTO", total: 0 },
      { categoria: "VARIOS", total: 0 },
    ]);
  });

  it("suma varios egresos de la misma categoría", () => {
    const resultado = agruparGastoPorCategoria([
      { categoria: "SERVICIOS", monto: 100 },
      { categoria: "SERVICIOS", monto: 50 },
    ]);

    expect(resultado.find((r) => r.categoria === "SERVICIOS")?.total).toBe(150);
  });
});

describe("agruparCreditosPorNivelAlerta", () => {
  const HOY = new Date("2026-08-15T00:00:00.000Z");

  it("clasifica créditos en los 3 niveles y suma el saldo pendiente de cada uno", () => {
    const resultado = agruparCreditosPorNivelAlerta(
      [
        // POR_VENCER: vence en 2 días
        { montoTotal: 100, montoPagado: 0, fechaLimite: new Date("2026-08-17T00:00:00.000Z") },
        // VENCIDO_RECIENTE: venció hace 3 días
        { montoTotal: 200, montoPagado: 50, fechaLimite: new Date("2026-08-12T00:00:00.000Z") },
        // VENCIDO_CRITICO: venció hace 20 días
        { montoTotal: 300, montoPagado: 0, fechaLimite: new Date("2026-07-26T00:00:00.000Z") },
      ],
      HOY,
    );

    expect(resultado).toEqual([
      { nivel: "POR_VENCER", cantidad: 1, montoPendiente: 100 },
      { nivel: "VENCIDO_RECIENTE", cantidad: 1, montoPendiente: 150 },
      { nivel: "VENCIDO_CRITICO", cantidad: 1, montoPendiente: 300 },
    ]);
  });

  it("un crédito sin alerta todavía (vence en más de 3 días) no entra en ningún nivel", () => {
    const resultado = agruparCreditosPorNivelAlerta(
      [{ montoTotal: 100, montoPagado: 0, fechaLimite: new Date("2026-09-01T00:00:00.000Z") }],
      HOY,
    );

    expect(resultado.every((r) => r.cantidad === 0)).toBe(true);
  });

  it("una lista vacía devuelve los 3 niveles en 0", () => {
    expect(agruparCreditosPorNivelAlerta([], HOY)).toEqual([
      { nivel: "POR_VENCER", cantidad: 0, montoPendiente: 0 },
      { nivel: "VENCIDO_RECIENTE", cantidad: 0, montoPendiente: 0 },
      { nivel: "VENCIDO_CRITICO", cantidad: 0, montoPendiente: 0 },
    ]);
  });
});

describe("agruparMortalidadPorLote", () => {
  it("agrupa por código de lote y suma la cantidad, ordenado desc", () => {
    const resultado = agruparMortalidadPorLote([
      { cantidad: 2, loteCodigo: "L-01", galponNombre: "Galpón 1" },
      { cantidad: 5, loteCodigo: "L-02", galponNombre: "Galpón 2" },
      { cantidad: 3, loteCodigo: "L-01", galponNombre: "Galpón 1" },
    ]);

    expect(resultado).toEqual([
      { loteCodigo: "L-01", galponNombre: "Galpón 1", total: 5 },
      { loteCodigo: "L-02", galponNombre: "Galpón 2", total: 5 },
    ]);
  });

  it("desempata por orden de aparición cuando dos lotes tienen el mismo total", () => {
    // L-01 llega primero con total 5, L-02 llega después con total 5 — el
    // sort de JS es estable, así que L-01 se mantiene primero.
    const resultado = agruparMortalidadPorLote([
      { cantidad: 5, loteCodigo: "L-01", galponNombre: "Galpón 1" },
      { cantidad: 5, loteCodigo: "L-02", galponNombre: "Galpón 2" },
    ]);

    expect(resultado.map((r) => r.loteCodigo)).toEqual(["L-01", "L-02"]);
  });

  it("una lista vacía devuelve un ranking vacío", () => {
    expect(agruparMortalidadPorLote([])).toEqual([]);
  });
});

describe("combinarBalance", () => {
  const DIAS = ["2026-08-01", "2026-08-02", "2026-08-03"];

  it("combina ingresos y egresos por día, calculando el neto", () => {
    const resultado = combinarBalance(
      [
        { fecha: "2026-08-01", total: 500 },
        { fecha: "2026-08-03", total: 100 },
      ],
      [{ fecha: "2026-08-02", total: 200 }],
      DIAS,
    );

    expect(resultado).toEqual([
      { fecha: "2026-08-01", ingresos: 500, egresos: 0, neto: 500 },
      { fecha: "2026-08-02", ingresos: 0, egresos: 200, neto: -200 },
      { fecha: "2026-08-03", ingresos: 100, egresos: 0, neto: 100 },
    ]);
  });

  it("un día sin ingresos ni egresos queda en neto 0", () => {
    const resultado = combinarBalance([], [], DIAS);

    expect(resultado.every((r) => r.neto === 0)).toBe(true);
  });
});

describe("construirLibroExcel", () => {
  it("arma un .xlsx real que se puede volver a leer, con encabezado y filas correctas", async () => {
    const buffer = await construirLibroExcel({
      nombreHoja: "Producción",
      columnas: [
        { encabezado: "Fecha", clave: "fecha", formato: "texto" },
        { encabezado: "Huevos", clave: "total", formato: "entero" },
      ],
      filas: [
        { fecha: "2026-08-01", total: 300 },
        { fecha: "2026-08-02", total: 150 },
      ],
    });

    // .byteLength en vez de .length: el tipo inferido de construirLibroExcel
    // (deliberadamente sin anotar, ver el comentario en reportes.ts) no
    // expone `.length` en todas las variantes de Buffer que trae
    // @types/node 20.19.x — .byteLength sí está presente en todas.
    expect(buffer.byteLength).toBeGreaterThan(0);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    const hoja = libro.getWorksheet("Producción");
    expect(hoja).toBeDefined();
    expect(hoja?.getRow(1).getCell(1).value).toBe("Fecha");
    expect(hoja?.getRow(1).getCell(2).value).toBe("Huevos");
    expect(hoja?.getRow(2).getCell(1).value).toBe("2026-08-01");
    expect(hoja?.getRow(2).getCell(2).value).toBe(300);
    expect(hoja?.getRow(3).getCell(2).value).toBe(150);
  });

  it("aplica el formato de moneda a las columnas marcadas", async () => {
    const buffer = await construirLibroExcel({
      nombreHoja: "Gastos",
      columnas: [{ encabezado: "Monto", clave: "monto", formato: "moneda" }],
      filas: [{ monto: 1000 }],
    });

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    // No se puede reconsultar por `key` tras el round-trip — el formato
    // .xlsx no conserva la metadata "key" de ExcelJS, solo el resultado
    // ya aplicado por celda/columna real (letra). Se verifica el numFmt
    // directo sobre la celda de datos (columna A, fila 2).
    const celda = libro.getWorksheet("Gastos")?.getRow(2).getCell(1);
    expect(celda?.numFmt).toBe('"S/" #,##0.00');
  });

  it("recorta el nombre de hoja a 31 caracteres y quita caracteres inválidos de Excel", async () => {
    const buffer = await construirLibroExcel({
      nombreHoja: "Un nombre de hoja demasiado largo: con / caracteres [inválidos]",
      columnas: [{ encabezado: "X", clave: "x" }],
      filas: [{ x: 1 }],
    });

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    expect(libro.worksheets).toHaveLength(1);
    expect(libro.worksheets[0].name.length).toBeLessThanOrEqual(31);
    expect(libro.worksheets[0].name).not.toMatch(/[:\\/?*[\]]/);
  });
});
