# Plan técnico — Sprint 12

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `enum CategoriaEgreso`, `model Egreso`,
  `enum EstadoEmpleado`, `model Empleado`, `enum TipoSueldoMovimiento`,
  `model SueldoMovimiento` ya existen desde Sprint 0 (bloque `MÓDULO 9 —
  Egresos y Personal (D4: sin adjuntos)`), sin ningún campo de
  anulación/reversión. `Usuario.egresosRegistrados Egreso[]` y
  `Usuario.empleadoVinculado Empleado?` ya son las relaciones inversas
  correctas — `npx prisma validate` en verde antes de cualquier cambio.
- No existe ningún archivo `lib/zod/egreso.ts`, `lib/zod/empleado.ts`,
  `lib/zod/sueldo-movimiento.ts`, `server/services/egreso.ts`,
  `server/services/sueldo-movimiento.ts`, `server/repositories/egreso.ts`,
  `server/repositories/empleado.ts`, `server/repositories/sueldo-movimiento.ts`,
  `server/actions/egreso.ts`, `server/actions/empleado.ts`,
  `server/actions/sueldo-movimiento.ts`, ni carpetas
  `components/domain/egresos/`/`components/domain/personal/`, ni rutas
  `app/(app)/egresos/`/`app/(app)/personal/` — todo nuevo este sprint.
- `VENTANA_GRACIA_MIN = 10` (`lib/constants.ts`) ya existe, compartida
  hoy por Mortalidad y Recolección — este sprint la extiende a Egreso y
  SueldoMovimiento sin tocar su valor ni su nombre.
- `RUTAS_POR_ROL` (`server/auth/rbac.ts`) tiene 4 entradas
  (`/usuarios`, `/galpones`, `/lotes`, `/precio-kilo`), todas
  `["GERENTE"]` — este sprint agrega `/egresos` y `/personal` al mismo
  patrón, sin tocar las existentes.

## Migración de schema (única de este sprint)
`Credito`/`HistorialAbonos` no necesitaron migración en Sprint 11 porque
ya traían todo lo necesario desde Sprint 0. `Egreso`/`SueldoMovimiento`
**sí** necesitan una — el schema de Sprint 0 no anticipó ni edición ni
reversión para ninguno de los dos, y las decisiones 1/2 (`spec.md`) exigen
ambas.

```prisma
model Egreso {
  id          String          @id @default(uuid())
  categoria   CategoriaEgreso
  monto       Decimal         @db.Decimal(10, 2)
  descripcion String
  fecha       DateTime        @default(now())
  creadoEn    DateTime        @default(now())   // NUEVO — inmutable, ancla la ventana de gracia de anulación (ver R3, spec.md). Nunca se edita, a diferencia de `fecha`.
  revertido   Boolean         @default(false)   // NUEVO
  revertidoEn DateTime?                          // NUEVO
  usuarioId   String

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Restrict)

  @@index([fecha])
  @@index([categoria])
  @@index([creadoEn, revertido]) // NUEVO — mismo patrón que RegistroRecoleccion(creadoEn, revertido)
}
```

```prisma
model SueldoMovimiento {
  id          String               @id @default(uuid())
  empleadoId  String
  tipo        TipoSueldoMovimiento
  monto       Decimal              @db.Decimal(10, 2)
  fecha       DateTime             @default(now())
  descripcion String?
  revertido   Boolean              @default(false)   // NUEVO
  revertidoEn DateTime?                                // NUEVO

  empleado Empleado @relation(fields: [empleadoId], references: [id], onDelete: Restrict)

  @@index([empleadoId, fecha, revertido]) // MODIFICA — reemplaza [empleadoId, fecha]: el cálculo de neto mensual (H5) siempre filtra por los tres a la vez
}
```

**Por qué `SueldoMovimiento` no necesita un `creadoEn` separado de
`fecha`:** a diferencia de `Egreso`, `SueldoMovimiento` **no es editable**
(decisión 2) — `fecha` nunca cambia después del alta, así que sigue
siendo un ancla válida para la ventana de gracia sin el riesgo que sí
existe en `Egreso` (editar `fecha` reabriendo/cerrando la ventana). Mismo
criterio que ya usa `RegistroMortalidad.fecha`/`RegistroRecoleccion.fecha`.

Ambos cambios son `ADD COLUMN ... DEFAULT ...` — no destructivos, no hay
filas existentes en ninguno de los dos modelos todavía (sin código
encima desde Sprint 0). Correr `npx prisma migrate dev --name
egreso_sueldo_ventana_gracia` (nombre sugerido, S12-1).

## Diseño de `server/services/egreso.ts` (funciones puras, nuevo)
```ts
import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Mismo criterio exacto que puedeRevertirMortalidad (server/services/mortalidad.ts)
// — única diferencia: se ancla a `creadoEn` (inmutable), no a `fecha`
// (editable, ver R3 de spec.md), para que editar la fecha de un Egreso
// nunca reabra ni cierre esta ventana.
export function puedeRevertirEgreso(params: {
  revertido: boolean;
  creadoEn: Date;
  ahora: Date;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este egreso ya fue anulado." };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.creadoEn.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para anular este egreso ya pasó. Podés corregirlo editándolo.`,
    };
  }
  return { permitido: true };
}
```
`editarEgreso` no tiene guard de tiempo — el único guard real (no editar
un ya revertido) vive en el `updateMany` condicional del repository, sin
necesidad de una función de servicio aparte (es un solo booleano, no
amerita una abstracción nueva).

## Diseño de `server/services/sueldo-movimiento.ts` (funciones puras, nuevo)
```ts
import type { TipoSueldoMovimiento } from "@prisma/client";
import { VENTANA_GRACIA_MIN } from "@/lib/constants";
import type { GuardResultado } from "@/server/services/galpon";

// Idéntica a puedeRevertirMortalidad — SueldoMovimiento.fecha es inmutable
// (no editable, decisión 2), así que sirve de ancla directa sin el
// problema que Egreso sí tiene (ver puedeRevertirEgreso arriba).
export function puedeRevertirSueldoMovimiento(params: {
  revertido: boolean;
  fecha: Date;
  ahora: Date;
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este movimiento ya fue revertido." };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.fecha.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para deshacer este movimiento ya pasó.`,
    };
  }
  return { permitido: true };
}

// Rango [desde, hasta] de un mes calendario completo en América/Lima
// (D5), igual criterio de fecha-calendario que Credito.fechaLimite —
// `desde` es el día 1 a medianoche, `hasta` es el primer instante del mes
// siguiente (límite exclusivo, evita el error de "último día a las
// 23:59:59.999" que se rompe con TIMESTAMP de mayor precisión).
export function calcularRangoMesCalendario(mes: number, anio: number): { desde: Date; hasta: Date } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(mes === 12 ? anio + 1 : anio, mes === 12 ? 0 : mes, 1));
  return { desde, hasta };
}

export type DesgloseNetoMensual = {
  sueldoBase: number;
  bonos: number;
  adelantos: number;
  descuentos: number;
  neto: number;
};

// Signo por tipo: SUELDO_BASE y BONO suman, ADELANTO y DESCUENTO restan
// — "neto" es literalmente lo que le queda al empleado por cobrar ese
// mes. Recibe movimientos ya filtrados (no revertidos, dentro del rango)
// — la función no conoce Prisma ni decide qué traer, solo suma (ADR-000).
export function calcularNetoMensual(
  movimientos: { tipo: TipoSueldoMovimiento; monto: number }[],
): DesgloseNetoMensual {
  const sumaPorTipo = (tipo: TipoSueldoMovimiento) =>
    movimientos.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + m.monto, 0);

  const sueldoBase = sumaPorTipo("SUELDO_BASE");
  const bonos = sumaPorTipo("BONO");
  const adelantos = sumaPorTipo("ADELANTO");
  const descuentos = sumaPorTipo("DESCUENTO");

  return {
    sueldoBase,
    bonos,
    adelantos,
    descuentos,
    neto: sueldoBase + bonos - adelantos - descuentos,
  };
}
```
`monto` llega como `number` (no `Decimal`) porque quien llama
(`app/(app)/personal/[empleadoId]/page.tsx`, Server Component) ya lo
convierte con `.toNumber()` antes de pasarlo a esta función pura — mismo
criterio que el resto de `server/services/` (nunca reciben un tipo de
Prisma directo, ADR-000).

## Diseño de Zod schemas

### `lib/zod/egreso.ts` (nuevo)
```ts
import { z } from "zod";
import { hoyEnLima, idUuid } from "@/lib/zod/comun";

const categoria = z.enum(["ALIMENTOS", "INSUMOS_VACUNAS", "SERVICIOS", "MANTENIMIENTO", "VARIOS"], {
  message: "Elegí una categoría.",
});
const monto = z.coerce.number().positive("El monto debe ser mayor a 0");
const descripcion = z.string().trim().min(1, "La descripción es obligatoria").max(200);
const fecha = z.coerce
  .date({ message: "Fecha inválida" })
  .refine((f) => f.getTime() <= hoyEnLima().getTime(), { message: "La fecha no puede ser futura." });

// id generado en el cliente — sin unicidad de negocio real sobre
// categoria+monto+descripcion+fecha (dos gastos idénticos el mismo día
// son legítimos), así que aplica el patrón completo de idempotencia
// (convenciones.md, "Idempotencia por id de cliente").
export const crearEgresoSchema = z.object({ id: idUuid(), categoria, monto, descripcion, fecha });
export type CrearEgresoInput = z.infer<typeof crearEgresoSchema>;

export const editarEgresoSchema = z.object({ id: idUuid(), categoria, monto, descripcion, fecha });
export type EditarEgresoInput = z.infer<typeof editarEgresoSchema>;

export const revertirEgresoSchema = z.object({ id: idUuid() });
export type RevertirEgresoInput = z.infer<typeof revertirEgresoSchema>;
```

### `lib/zod/empleado.ts` (nuevo)
```ts
import { z } from "zod";
import { idUuid } from "@/lib/zod/comun";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);
// Opcionales de verdad (el formulario puede dejarlos en blanco) — mismo
// patrón que lib/zod/usuario.ts para celular/email.
const celular = z.string().trim().max(20).optional().or(z.literal("").transform(() => undefined));
const cargo = z.string().trim().max(80).optional().or(z.literal("").transform(() => undefined));

// Empleado.nombre no tiene @unique — dos empleados con el mismo nombre
// son plausibles (mismo apellido, granja familiar) — mismo motivo que
// Egreso para exigir id de cliente (sin unicidad de negocio que proteja
// un doble envío).
export const crearEmpleadoSchema = z.object({ id: idUuid(), nombre, celular, cargo });
export type CrearEmpleadoInput = z.infer<typeof crearEmpleadoSchema>;

export const editarEmpleadoSchema = z.object({ id: idUuid(), nombre, celular, cargo });
export type EditarEmpleadoInput = z.infer<typeof editarEmpleadoSchema>;

export const cambiarEstadoEmpleadoSchema = z.object({
  id: idUuid(),
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});
export type CambiarEstadoEmpleadoInput = z.infer<typeof cambiarEstadoEmpleadoSchema>;
```

### `lib/zod/sueldo-movimiento.ts` (nuevo)
```ts
import { z } from "zod";
import { hoyEnLima, idUuid } from "@/lib/zod/comun";

const tipo = z.enum(["SUELDO_BASE", "ADELANTO", "BONO", "DESCUENTO"], { message: "Elegí un tipo." });
const monto = z.coerce.number().positive("El monto debe ser mayor a 0");
const descripcion = z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined));

export const crearSueldoMovimientoSchema = z.object({
  id: idUuid(),
  empleadoId: idUuid("Seleccioná un empleado"),
  tipo,
  monto,
  descripcion,
});
export type CrearSueldoMovimientoInput = z.infer<typeof crearSueldoMovimientoSchema>;

export const revertirSueldoMovimientoSchema = z.object({ id: idUuid() });
export type RevertirSueldoMovimientoInput = z.infer<typeof revertirSueldoMovimientoSchema>;
```
Sin `fecha` en `crearSueldoMovimientoSchema` — a diferencia de `Egreso`,
`SueldoMovimiento.fecha` siempre es "ahora" (no editable, decisión 2), el
servidor la pone con `@default(now())`, el formulario no la pide.

## Diseño de repositories

### `server/repositories/egreso.ts` (nuevo)
```ts
export function crearEgreso(data: {
  id: string; categoria: CategoriaEgreso; monto: number; descripcion: string;
  fecha: Date; usuarioId: string;
}) {
  return prisma.egreso.create({ data });
}

// Guard real: no editar un Egreso ya anulado — updateMany condicional,
// mismo espíritu que el resto del proyecto (aunque acá el riesgo de
// carrera es bajo, se usa la misma forma por consistencia y porque no
// cuesta nada extra).
export class EgresoRevertidoError extends Error {}
export function editarEgreso(data: {
  id: string; categoria: CategoriaEgreso; monto: number; descripcion: string; fecha: Date;
}) {
  return prisma.egreso.updateMany({
    where: { id: data.id, revertido: false },
    data: { categoria: data.categoria, monto: data.monto, descripcion: data.descripcion, fecha: data.fecha },
  }).then((r) => {
    if (r.count === 0) throw new EgresoRevertidoError();
  });
}

export class EgresoYaRevertidoError extends Error {}
export function revertirEgreso(params: { id: string; ahora: Date }) {
  return prisma.egreso.updateMany({
    where: { id: params.id, revertido: false },
    data: { revertido: true, revertidoEn: params.ahora },
  }).then((r) => {
    if (r.count === 0) throw new EgresoYaRevertidoError();
  });
}

export function listarEgresos(params: {
  skip: number; take: number; categoria?: CategoriaEgreso; desde?: Date; hasta?: Date;
}) {
  return prisma.egreso.findMany({
    where: { categoria: params.categoria, fecha: { gte: params.desde, lte: params.hasta } },
    orderBy: { fecha: "desc" },
    skip: params.skip, take: params.take,
    include: { usuario: { select: { nombre: true } } },
  });
}

export function contarEgresos(params: { categoria?: CategoriaEgreso; desde?: Date; hasta?: Date } = {}) {
  return prisma.egreso.count({
    where: { categoria: params.categoria, fecha: { gte: params.desde, lte: params.hasta } },
  });
}

export function buscarEgresoPorId(id: string) {
  return prisma.egreso.findUnique({ where: { id } });
}
```
Ninguna de estas funciones necesita `$transaction` — todas tocan una sola
tabla, a diferencia de `registrarMortalidadYDescontarAves` (que además
decrementa `Lote.avesVivas`). `crearEgreso`/`editarEgreso`/`revertirEgreso`
son creates/updates de una sola fila.

### `server/repositories/empleado.ts` (nuevo)
```ts
export function crearEmpleado(data: { id: string; nombre: string; celular?: string; cargo?: string }) {
  return prisma.empleado.create({ data });
}
export function editarEmpleado(data: { id: string; nombre: string; celular?: string; cargo?: string }) {
  return prisma.empleado.update({ where: { id: data.id }, data });
}
export function cambiarEstadoEmpleado(params: { id: string; estado: EstadoEmpleado }) {
  return prisma.empleado.update({ where: { id: params.id }, data: { estado: params.estado } });
}
export function listarEmpleados(params: { skip: number; take: number; estado?: EstadoEmpleado }) {
  return prisma.empleado.findMany({
    where: { estado: params.estado }, orderBy: { nombre: "asc" },
    skip: params.skip, take: params.take,
  });
}
export function contarEmpleados(params: { estado?: EstadoEmpleado } = {}) {
  return prisma.empleado.count({ where: { estado: params.estado } });
}
export function buscarEmpleadoPorId(id: string) {
  return prisma.empleado.findUnique({ where: { id } });
}
// Para el <Select> de "Registrar movimiento" (H4, decisión 6) — sin
// paginar, la lista de empleados activos de una granja familiar es chica.
export function listarEmpleadosActivos() {
  return prisma.empleado.findMany({ where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } });
}
```
`crearEmpleado`/`editarEmpleado` no usan `updateMany`/guard — a
diferencia de Egreso, no hay ningún estado "revertido" que proteja
(Empleado se desactiva, nunca se anula un alta).

### `server/repositories/sueldo-movimiento.ts` (nuevo)
```ts
export function crearSueldoMovimiento(data: {
  id: string; empleadoId: string; tipo: TipoSueldoMovimiento; monto: number; descripcion?: string;
}) {
  return prisma.sueldoMovimiento.create({ data });
}

export class SueldoMovimientoYaRevertidoError extends Error {}
export function revertirSueldoMovimiento(params: { id: string; ahora: Date }) {
  return prisma.sueldoMovimiento.updateMany({
    where: { id: params.id, revertido: false },
    data: { revertido: true, revertidoEn: params.ahora },
  }).then((r) => {
    if (r.count === 0) throw new SueldoMovimientoYaRevertidoError();
  });
}

// Ledger completo de un empleado — sin paginar (mismo criterio que
// buscarCreditosPorClienteConAbonos, Sprint 11: el volumen de
// movimientos de un solo empleado es chico, no amerita <DataTablePagination>).
export function listarSueldoMovimientosPorEmpleado(empleadoId: string) {
  return prisma.sueldoMovimiento.findMany({
    where: { empleadoId }, orderBy: { fecha: "desc" },
  });
}

// Para H5 (neto mensual) — trae solo lo que calcularNetoMensual() necesita.
export function listarSueldoMovimientosEnRango(params: { empleadoId: string; desde: Date; hasta: Date }) {
  return prisma.sueldoMovimiento.findMany({
    where: {
      empleadoId: params.empleadoId, revertido: false,
      fecha: { gte: params.desde, lt: params.hasta },
    },
  });
}

export function buscarSueldoMovimientoPorId(id: string) {
  return prisma.sueldoMovimiento.findUnique({ where: { id } });
}
```

## Diseño de Server Actions

### `server/actions/egreso.ts` (nuevo)
```ts
export const crearEgresoAction = withAuth(
  { schema: crearEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "CREAR" },
  async (input, ctx) => {
    try {
      const egreso = await crearEgreso({ ...input, usuarioId: ctx.usuarioId });
      return { data: egreso, entidadId: egreso.id, estadoDespues: serializar(egreso) };
    } catch (error) {
      if (esErrorP2002(error)) {
        const existente = await buscarEgresoPorId(input.id);
        if (existente && coincideConPayload(existente, input)) {
          return { data: existente, entidadId: existente.id };
        }
        throw new AccionError("Ya existe un egreso con este id pero con datos diferentes.");
      }
      throw error;
    }
  },
);

export const editarEgresoAction = withAuth(
  { schema: editarEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "EDITAR" },
  async (input) => {
    try {
      await editarEgreso(input);
    } catch (error) {
      if (error instanceof EgresoRevertidoError) {
        throw new AccionError("No se puede editar un egreso ya anulado.");
      }
      throw error;
    }
    const egreso = await buscarEgresoPorId(input.id);
    return { data: egreso, entidadId: input.id, estadoDespues: serializar(egreso) };
  },
);

export const revertirEgresoAction = withAuth(
  { schema: revertirEgresoSchema, rol: "GERENTE", entidad: "Egreso", accion: "ANULAR" },
  async (input) => {
    const egreso = await buscarEgresoPorId(input.id);
    if (!egreso) throw new AccionError("Egreso no encontrado.");
    const guard = puedeRevertirEgreso({ revertido: egreso.revertido, creadoEn: egreso.creadoEn, ahora: new Date() });
    if (!guard.permitido) throw new AccionError(guard.motivo);
    try {
      await revertirEgreso({ id: input.id, ahora: new Date() });
    } catch (error) {
      if (error instanceof EgresoYaRevertidoError) {
        throw new AccionError("Este egreso ya fue anulado.");
      }
      throw error;
    }
    return { data: { ok: true }, entidadId: input.id };
  },
);
```
El chequeo previo con `puedeRevertirEgreso()` en `revertirEgresoAction`
da el mensaje específico ("ya pasó la ventana" vs. "ya fue anulado") — el
`updateMany` condicional del repository es el backstop real contra una
carrera (dos clics casi simultáneos en "Anular"), mismo patrón que
`revertirMortalidadAction`.

### `server/actions/empleado.ts` (nuevo)
```ts
export const crearEmpleadoAction = withAuth(
  { schema: crearEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "CREAR" },
  async (input) => {
    try {
      const empleado = await crearEmpleado(input);
      return { data: empleado, entidadId: empleado.id, estadoDespues: serializar(empleado) };
    } catch (error) {
      if (esErrorP2002(error)) {
        const existente = await buscarEmpleadoPorId(input.id);
        if (existente && coincideConPayload(existente, input)) {
          return { data: existente, entidadId: existente.id };
        }
        throw new AccionError("Ya existe un empleado con este id pero con datos diferentes.");
      }
      throw error;
    }
  },
);

export const editarEmpleadoAction = withAuth(
  { schema: editarEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "EDITAR" },
  async (input) => {
    const empleado = await editarEmpleado(input);
    return { data: empleado, entidadId: empleado.id, estadoDespues: serializar(empleado) };
  },
);

export const cambiarEstadoEmpleadoAction = withAuth(
  { schema: cambiarEstadoEmpleadoSchema, rol: "GERENTE", entidad: "Empleado", accion: "CAMBIAR_ESTADO" },
  async (input) => {
    const empleado = await cambiarEstadoEmpleado(input);
    return { data: empleado, entidadId: empleado.id, estadoDespues: serializar(empleado) };
  },
);
```
Un solo `cambiarEstadoEmpleadoAction` para activar y desactivar (el
`estado` viaja en el payload) — no hace falta duplicar como
`desactivarUsuarioYRevocarSesiones` de Usuario, porque acá no hay
`SesionActiva` que revocar (Empleado no está vinculado a `Usuario` este
sprint, decisión 5) ni ninguna regla tipo "último Gerente activo".

### `server/actions/sueldo-movimiento.ts` (nuevo)
```ts
export const crearSueldoMovimientoAction = withAuth(
  { schema: crearSueldoMovimientoSchema, rol: "GERENTE", entidad: "SueldoMovimiento", accion: "CREAR" },
  async (input) => {
    // Chequeo previo best-effort (R2, spec.md) — no atómico, riesgo de
    // carrera aceptado explícitamente.
    const empleado = await buscarEmpleadoPorId(input.empleadoId);
    if (!empleado) throw new AccionError("Empleado no encontrado.");
    if (empleado.estado !== "ACTIVO") {
      throw new AccionError("No se puede registrar un movimiento para un empleado inactivo.");
    }
    try {
      const movimiento = await crearSueldoMovimiento(input);
      return { data: movimiento, entidadId: movimiento.id, estadoDespues: serializar(movimiento) };
    } catch (error) {
      if (esErrorP2002(error)) {
        const existente = await buscarSueldoMovimientoPorId(input.id);
        if (existente && coincideConPayload(existente, input)) {
          return { data: existente, entidadId: existente.id };
        }
        throw new AccionError("Ya existe un movimiento con este id pero con datos diferentes.");
      }
      throw error;
    }
  },
);

export const revertirSueldoMovimientoAction = withAuth(
  { schema: revertirSueldoMovimientoSchema, rol: "GERENTE", entidad: "SueldoMovimiento", accion: "REVERTIR" },
  async (input) => {
    const movimiento = await buscarSueldoMovimientoPorId(input.id);
    if (!movimiento) throw new AccionError("Movimiento no encontrado.");
    const guard = puedeRevertirSueldoMovimiento({
      revertido: movimiento.revertido, fecha: movimiento.fecha, ahora: new Date(),
    });
    if (!guard.permitido) throw new AccionError(guard.motivo);
    try {
      await revertirSueldoMovimiento({ id: input.id, ahora: new Date() });
    } catch (error) {
      if (error instanceof SueldoMovimientoYaRevertidoError) {
        throw new AccionError("Este movimiento ya fue revertido.");
      }
      throw error;
    }
    return { data: { ok: true }, entidadId: input.id };
  },
);
```

## Diseño de UI

### `components/domain/egresos/banner-caja-separada.tsx` (nuevo)
Componente mínimo (`<div>` con ícono + texto, mismo tratamiento visual
que un toast `info` de `globals.css`, pero fijo en la página, no
temporal). **Reusado tal cual desde `/personal`** (import cruzado entre
módulos, mismo criterio de reuso documentado que
`listarPaquetesDisponibles`/`listarBandejasDisponibles` entre `/pos` y
`/consolidacion`, Sprint 10) — vive en `egresos/` porque es el primer
módulo que lo necesitó, no porque le pertenezca más que a `personal/`.

### `components/domain/egresos/egreso-form-dialog.tsx` (nuevo)
Un solo componente para alta y edición (prop opcional `egreso?`, mismo
patrón que `UsuarioFormDialog`) — si viene, precarga los campos y llama
`editarEgresoAction`; si no, genera `id` una vez por apertura
(`useState(() => crypto.randomUUID())`) y llama `crearEgresoAction`.
`<Select>` controlado para `categoria` (mismo fix que el bug real de
Sprint 3 con `<SelectValue>` — children explícito, no depender del
fallback interno de Base UI).

### `components/domain/egresos/egresos-tabla.tsx` (nuevo)
Fila con: fecha, categoría (`.badge-categoria-egreso-*`), monto,
descripción, usuario, y una columna de acciones — "Editar" (deshabilitado
si `revertido`) + `<RevertirEgresoBoton>` (oculto si `revertido` o fuera
de ventana) + badge "Anulado" (reusa `.badge-estado-inactivo`) cuando
`revertido`.

### `components/domain/egresos/egreso-filtros.tsx` (nuevo)
Mismo patrón colapsable que `MortalidadFiltros` — `<Select>` de
categoría + rango de fecha (Desde/Hasta), dirigido por URL
(`?categoria=&desde=&hasta=&page=`), `page` se borra en cada cambio.

### `components/domain/egresos/revertir-egreso-boton.tsx` (nuevo)
Copia estructural exacta de `RevertirMortalidadBoton` (countdown real de
1s, mismo `formatearMMSS`), con dos diferencias: ancla el countdown a
`registro.creadoEn` (no `fecha`) y llama `revertirEgresoAction({ id })`.
Texto del botón: "Anular (MM:SS)".

### `components/domain/personal/empleado-form-dialog.tsx` (nuevo)
Mismo patrón que `egreso-form-dialog.tsx` — un componente para alta y
edición, sin ningún campo de `usuarioId` (decisión 5). Campos: nombre,
celular (opcional), cargo (opcional).

### `components/domain/personal/empleados-tabla.tsx` (nuevo)
Fila con nombre, celular, cargo, `.badge-estado-activo`/
`.badge-estado-inactivo`, acciones: "Editar", "Ver detalle" (link a
`/personal/[id]`), "Dar de baja"/"Reactivar" según estado (mismo patrón
de confirmación que Usuario/Lote/Galpon).

### `components/domain/personal/sueldo-movimiento-form-dialog.tsx` (nuevo)
Formulario para UN empleado ya elegido (recibe `empleadoId` fijo desde
`/personal/[empleadoId]`, sin selector — a diferencia de lo que sugería
H4 en abstracto, el flujo real entra desde el detalle del empleado, así
que no hace falta un `<Select>` de empleado acá; ese `<Select>` solo
sería necesario si se agregara un atajo "Registrar movimiento" fuera del
detalle, fuera de alcance de este sprint). `<Select>` de `tipo`
(controlado, mismo fix de `<SelectValue>` que categoría de Egreso).

### `components/domain/personal/sueldo-movimientos-tabla.tsx` (nuevo)
Ledger del empleado: fecha, tipo (`.badge-tipo-sueldo-*`), monto,
descripción, `<RevertirSueldoMovimientoBoton>` (oculto si `revertido` o
fuera de ventana) + badge "Revertido" (`.badge-estado-inactivo`) cuando
corresponde. Sin paginación (repository no pagina, ver arriba).

### `components/domain/personal/revertir-sueldo-movimiento-boton.tsx` (nuevo)
Copia estructural exacta de `RevertirMortalidadBoton`, ancla el countdown
a `registro.fecha` (no `creadoEn` — `SueldoMovimiento` no lo tiene, ver
"Migración de schema"), llama `revertirSueldoMovimientoAction({ id })`.
Texto: "Deshacer (MM:SS)".

### `components/domain/personal/neto-mensual-card.tsx` (nuevo)
`<Select>` de mes + `<Select>` de año (rango razonable, ej. año actual y
el anterior — sin selector de día, mes calendario completo, decisión 4),
dirigido por `searchParams` de `/personal/[empleadoId]?mes=8&anio=2026`
(Server Component, sin Server Action de lectura — mismo criterio que
cualquier fetch inicial de página). Tarjeta con el desglose de
`calcularNetoMensual()` (Sueldo base, Bonos, Adelantos, Descuentos, Neto
destacado) o el estado vacío "Sin movimientos este mes" si los cuatro
valores dan cero.

### `app/(app)/egresos/page.tsx` (nuevo)
Server Component: `<PageHeader title="Egresos" actions={<Button>Nuevo
egreso</Button>} />`, `<BannerCajaSeparada />`, `<EgresoFiltros />`,
`<EgresosTabla />`, `<DataTablePagination />` (con `filtros`, mismo
patrón que `/mortalidad`).

### `app/(app)/personal/page.tsx` (nuevo)
Server Component: `<PageHeader title="Personal" actions={<Button>Nuevo
empleado</Button>} />`, `<BannerCajaSeparada />` (importado desde
`domain/egresos/`), filtro simple de estado, `<EmpleadosTabla />`,
`<DataTablePagination />`.

### `app/(app)/personal/[empleadoId]/page.tsx` (nuevo)
Server Component: datos del empleado + acciones (Editar, Dar de
baja/Reactivar), botón "Registrar movimiento" (abre
`SueldoMovimientoFormDialog`), `<NetoMensualCard />`,
`<SueldoMovimientosTabla />`. `params.empleadoId`/`searchParams` son
`await` (Next 16, asíncronos siempre).

### `components/layout/nav-items.ts` (modifica)
```ts
{ href: "/egresos", label: "Egresos", icon: Wallet },
{ href: "/personal", label: "Personal", icon: IdCard },
```
(íconos de `lucide-react`, sin colisión con los ya importados).

### `server/auth/rbac.ts` (modifica)
```ts
{ ruta: "/egresos", roles: ["GERENTE"] },
{ ruta: "/personal", roles: ["GERENTE"] },
```

## Manejo del `id` de cliente (contrato de idempotencia)
Mismo criterio que `ventaId`/abono de Sprints 5-11: el `id` de
`Egreso`/`Empleado`/`SueldoMovimiento` se genera **una sola vez por
apertura del diálogo** (`useState(() => crypto.randomUUID())`), nunca en
cada submit. Un reintento tras un error de negocio (ej. "empleado
inactivo") debe reusar el mismo `id`; uno nuevo recién al reabrir el
diálogo para un registro distinto.

## Orden de ejecución (hay dependencias entre tareas)
1. Migración de schema (`Egreso`/`SueldoMovimiento`) — primero, todo lo
   demás depende de que estos campos existan.
2. `server/services/egreso.ts` + tests — independiente.
3. `server/services/sueldo-movimiento.ts` + tests — independiente.
4. `lib/zod/egreso.ts` + tests — independiente.
5. `lib/zod/empleado.ts` + tests — independiente.
6. `lib/zod/sueldo-movimiento.ts` + tests — independiente.
7. `server/repositories/egreso.ts` — depende de 1.
8. `server/repositories/empleado.ts` — depende de 1 (schema ya válido).
9. `server/repositories/sueldo-movimiento.ts` — depende de 1.
10. `server/actions/egreso.ts` — depende de 2, 4, 7.
11. `server/actions/empleado.ts` — depende de 5, 8.
12. `server/actions/sueldo-movimiento.ts` — depende de 3, 6, 8, 9.
13. `globals.css` — recetas `.badge-categoria-egreso-*`/`.badge-tipo-sueldo-*`
    — independiente, antes de la UI que las consume.
14. UI de Egresos (`banner-caja-separada`, `egreso-form-dialog`,
    `egresos-tabla`, `egreso-filtros`, `revertir-egreso-boton`) —
    depende de 10, 13.
15. `app/(app)/egresos/page.tsx` — depende de 14.
16. UI de Personal (`empleado-form-dialog`, `empleados-tabla`,
    `sueldo-movimiento-form-dialog`, `sueldo-movimientos-tabla`,
    `revertir-sueldo-movimiento-boton`, `neto-mensual-card`) — depende de
    11, 12, 13.
17. `app/(app)/personal/page.tsx`, `app/(app)/personal/[empleadoId]/page.tsx`
    — depende de 16.
18. `server/auth/rbac.ts` + `components/layout/nav-items.ts` — depende de
    15, 17.
19. Tests de integración de las 7 Server Actions (repositories
    mockeados) — depende de 10, 11, 12.
20. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/egreso.ts` y `server/services/sueldo-movimiento.ts`.
21. Verificación en vivo contra Neon real: alta/edición/anulación de
    Egreso dentro y fuera de la ventana de gracia, alta/baja/reactivación
    de Empleado, alta y reversión de SueldoMovimiento dentro y fuera de
    la ventana, guard de empleado inactivo forzado por payload,
    idempotencia real de Egreso y de SueldoMovimiento, cálculo de neto
    mensual con datos reales (incluyendo un movimiento revertido que no
    debe contarse).
22. Verificación clic a clic en navegador: flujo completo de `/egresos`
    (alta, edición, anulación con countdown visible, filtros), flujo
    completo de `/personal` (alta, edición, baja, reactivación, detalle
    con ledger y neto mensual), banner visible en ambas pantallas, 403
    real para un Operario en ambas rutas.

## Comandos de referencia
```bash
npx prisma migrate dev --name egreso_sueldo_ventana_gracia
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npm run build
```

## Estructura de archivos esperada
```
prisma/
  schema.prisma                # modifica: Egreso + creadoEn/revertido/revertidoEn; SueldoMovimiento + revertido/revertidoEn
  migrations/
    <timestamp>_egreso_sueldo_ventana_gracia/
src/
  lib/
    constants.ts                # sin cambios (VENTANA_GRACIA_MIN ya existe)
    zod/
      egreso.ts                 # nuevo: crearEgresoSchema, editarEgresoSchema, revertirEgresoSchema
      empleado.ts                # nuevo: crearEmpleadoSchema, editarEmpleadoSchema, cambiarEstadoEmpleadoSchema
      sueldo-movimiento.ts       # nuevo: crearSueldoMovimientoSchema, revertirSueldoMovimientoSchema
  server/
    services/
      egreso.ts                  # nuevo: puedeRevertirEgreso
      sueldo-movimiento.ts        # nuevo: puedeRevertirSueldoMovimiento, calcularRangoMesCalendario, calcularNetoMensual
    repositories/
      egreso.ts                   # nuevo
      empleado.ts                 # nuevo
      sueldo-movimiento.ts        # nuevo
    actions/
      egreso.ts                   # nuevo: crearEgresoAction, editarEgresoAction, revertirEgresoAction
      empleado.ts                 # nuevo: crearEmpleadoAction, editarEmpleadoAction, cambiarEstadoEmpleadoAction
      sueldo-movimiento.ts        # nuevo: crearSueldoMovimientoAction, revertirSueldoMovimientoAction
    auth/
      rbac.ts                     # modifica: + /egresos, /personal
  components/domain/
    egresos/
      banner-caja-separada.tsx    # nuevo
      egreso-form-dialog.tsx      # nuevo
      egresos-tabla.tsx           # nuevo
      egreso-filtros.tsx          # nuevo
      revertir-egreso-boton.tsx   # nuevo
    personal/
      empleado-form-dialog.tsx           # nuevo
      empleados-tabla.tsx                # nuevo
      sueldo-movimiento-form-dialog.tsx  # nuevo
      sueldo-movimientos-tabla.tsx       # nuevo
      revertir-sueldo-movimiento-boton.tsx # nuevo
      neto-mensual-card.tsx              # nuevo
  components/layout/nav-items.ts    # + "Egresos", "Personal"
  app/
    (app)/
      egresos/page.tsx              # nuevo
      personal/
        page.tsx                    # nuevo
        [empleadoId]/page.tsx       # nuevo
  app/globals.css                  # + .badge-categoria-egreso-*, .badge-tipo-sueldo-*
tests/
  unit/services/egreso.test.ts               # nuevo
  unit/services/sueldo-movimiento.test.ts     # nuevo
  unit/lib/zod-egreso.test.ts                 # nuevo
  unit/lib/zod-empleado.test.ts               # nuevo
  unit/lib/zod-sueldo-movimiento.test.ts      # nuevo
  integration/actions/egreso.test.ts           # nuevo
  integration/actions/empleado.test.ts         # nuevo
  integration/actions/sueldo-movimiento.test.ts # nuevo
```

## Definition of Done aplicable a este sprint
(`memory/definition-of-done.md` sigue sin existir — mismo criterio que
Sprints 3-11 vienen aplicando: `CLAUDE.md` + esta sección son el DoD
efectivo del proyecto.)
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/egreso.ts` y
  `server/services/sueldo-movimiento.ts`.
- `npx prisma validate` en verde, migración aplicada sin errores.
- `npm run build` en verde.
- Ventana de gracia de `Egreso` verificada contra Neon real: anulable
  dentro de los 10 min, botón/acción ausente fuera de esa ventana,
  editable en ambos casos mientras no esté anulado.
- Ventana de gracia de `SueldoMovimiento` verificada contra Neon real:
  mismo criterio, sin edición en ningún caso.
- Guard de "empleado inactivo no recibe movimientos nuevos" verificado
  forzando el payload directo (no solo escondiendo el `<Select>`).
- Neto mensual verificado con datos reales, incluyendo un movimiento
  revertido que no debe contarse en el desglose.
- Ambas rutas nuevas (`/egresos`, `/personal`) devuelven 403 real para un
  Operario, verificado en código (no solo escondiendo el link del Sidebar).
- Ningún componente ni service importa Prisma directamente (ADR-000).
- Cero `any`, cero `@ts-ignore` (CLAUDE.md).
