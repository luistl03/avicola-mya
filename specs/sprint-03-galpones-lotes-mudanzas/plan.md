# Plan técnico — Sprint 3

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma:94-143` — `Galpon`, `Lote`, `HistorialUbicacionLote`
  ya existen desde Sprint 0. `Galpon` no tiene `estado`. `Lote` no tiene
  `galponId` directo — la ubicación se deriva siempre de
  `HistorialUbicacionLote` (`fechaSalida IS NULL` = ubicación abierta).
  Este sprint no agrega un `galponId` denormalizado a `Lote` (ver "Por qué
  no denormalizar" más abajo).
- `server/auth/with-auth.ts` — `withAuth(config, handler)` y `AccionError`
  ya existen y no cambian; este sprint solo los reusa (mismo patrón que
  `server/actions/usuario.ts`).
- `server/repositories/auditLog.ts` — `crearAuditLog` ya existe, lo llama
  `withAuth` automáticamente. No hay nada que tocar acá.
- `tests/factories/galpon.factory.ts` (`makeGalpon`) y
  `lote.factory.ts` (`makeLote`) ya existen. `makeGalpon` no incluye
  `estado` porque el campo no existe todavía en el schema — se actualiza
  en S3-1, junto con la migración, para no dejar la factory desincronizada
  del modelo real (mismo criterio que llevó a actualizar `usuario.factory.ts`
  en Sprint 2 cuando se agregaron campos).
- `server/auth/rbac.ts` — `RUTAS_POR_ROL` hoy solo tiene `/usuarios`. Se
  amplía con `/galpones` y `/lotes`, ambas GERENTE.
- `components/layout/nav-items.ts` — `NAV_ITEMS` hoy solo tiene "Inicio" y
  "Usuarios". Se amplía con "Galpones" y "Lotes".
- `components/ui/`: `table.tsx`, `table-scroll-area.tsx`, `badge.tsx`,
  `dialog.tsx`, `select.tsx`, `data-table-pagination.tsx`, `toast.tsx` ya
  instalados y usados por Usuarios (Sprint 2) — este sprint no instala
  ningún componente shadcn nuevo, todo lo que necesita ya está.
- `components/layout/page-header.tsx` — `<PageHeader title actions />` ya
  existe, se reusa tal cual para `/galpones` y `/lotes`.
- **Deuda preexistente, no de este sprint:** el badge de estado de
  `usuarios-tabla.tsx` escribe su receta de color inline en vez de una
  clase de `globals.css` (ver spec.md). Este plan **no** replica ese
  patrón para los badges nuevos — ver "Badges de estado" más abajo.

## Por qué no denormalizar `galponId` en `Lote`
`memory/modelo-datos.md` ya documenta el índice
`HistorialUbicacionLote(loteId, fechaSalida)` con el propósito explícito
de "encontrar la ubicación ACTUAL de un lote sin recorrer todo el
historial" — la intención original del schema (Sprint 0) ya era que
`HistorialUbicacionLote` fuera la única fuente de verdad de "dónde está
un lote ahora", no un campo redundante en `Lote` que la mudanza tendría
que mantener sincronizado a mano (y que podría desincronizarse si un bug
actualiza uno y no el otro). Este sprint respeta esa intención: todas las
consultas de "ubicación actual" filtran `HistorialUbicacionLote` por
`fechaSalida: null`, apoyadas en ese índice ya existente.

## Migración de schema (S3-1)

```prisma
// Agregar junto al enum EstadoLote existente, mismo bloque "MÓDULO 2"
enum EstadoGalpon {
  ACTIVO
  INACTIVO
}

model Galpon {
  id              String       @id @default(uuid())
  nombre          String
  capacidadMaxima Int
  estado          EstadoGalpon @default(ACTIVO)
  creadoEn        DateTime     @default(now())

  // ... relaciones existentes sin cambios

  @@index([nombre])
  @@index([estado])
}
```
Enum dedicado (`EstadoGalpon`), no reutilizar `EstadoLote` aunque los
valores coincidan — mismo criterio que el proyecto ya aplica entre
`EstadoUsuario` y `EstadoLote` (dos enums idénticos en valores, uno por
entidad). `@@index([estado])` nuevo, mismo patrón que `Usuario` y `Lote`
ya tienen sobre su propio campo `estado` (listados van a filtrar por
ACTIVO constantemente, igual que el POS filtra `Paquete(estado)`).

Comando: `npx prisma migrate dev --name galpon_estado`. Después,
actualizar `tests/factories/galpon.factory.ts`:
```ts
export function makeGalpon(overrides: Partial<Galpon> = {}): Galpon {
  return {
    id: crypto.randomUUID(),
    nombre: `Galpón ${crypto.randomUUID().slice(0, 4)}`,
    capacidadMaxima: 500,
    estado: "ACTIVO",
    creadoEn: new Date(),
    ...overrides,
  };
}
```

## Diseño de servicios puros (testables sin BD)

### `server/services/galpon.ts`
```ts
export type GuardResultado = { permitido: true } | { permitido: false; motivo: string };

export function puedeAlojarEnGalpon(params: {
  galponEstado: EstadoGalpon;
  capacidadMaxima: number;
  avesActualesAlojadas: number;
  avesEntrantes: number;
}): GuardResultado {
  if (params.galponEstado !== "ACTIVO") {
    return { permitido: false, motivo: "El galpón no está activo." };
  }
  const totalResultante = params.avesActualesAlojadas + params.avesEntrantes;
  if (totalResultante > params.capacidadMaxima) {
    return {
      permitido: false,
      motivo: `Supera la capacidad del galpón (${totalResultante}/${params.capacidadMaxima} aves).`,
    };
  }
  return { permitido: true };
}

export function puedeDesactivarGalpon(params: { lotesAlojados: number }): GuardResultado {
  if (params.lotesAlojados > 0) {
    return { permitido: false, motivo: "No se puede desactivar un galpón con lotes alojados." };
  }
  return { permitido: true };
}

export function puedeReducirCapacidad(params: {
  capacidadNueva: number;
  avesActualesAlojadas: number;
}): GuardResultado {
  if (params.capacidadNueva < params.avesActualesAlojadas) {
    return {
      permitido: false,
      motivo: `El galpón aloja ${params.avesActualesAlojadas} aves — no puede bajar de esa capacidad.`,
    };
  }
  return { permitido: true };
}
```
`puedeAlojarEnGalpon` es la guard compartida entre alta de lote (S3-6) y
mudanza (S3-8) — ambas necesitan el mismo cálculo (estado del destino +
capacidad resultante), así que vive una sola vez acá en vez de
duplicarse en `services/lote.ts`.

### `server/services/lote.ts`
```ts
export function puedeMudarLote(params: {
  loteEstado: EstadoLote;
  galponOrigenId: string | null;
  galponDestinoId: string;
}): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "Solo se pueden mudar lotes activos." };
  }
  if (params.galponOrigenId === params.galponDestinoId) {
    return { permitido: false, motivo: "El lote ya está en ese galpón." };
  }
  return { permitido: true };
}

export function puedeFinalizarLote(params: { loteEstado: EstadoLote }): GuardResultado {
  if (params.loteEstado !== "ACTIVO") {
    return { permitido: false, motivo: "El lote ya está finalizado." };
  }
  return { permitido: true };
}
```
La action de mudanza (S3-8) llama primero `puedeMudarLote`, y si pasa,
llama `puedeAlojarEnGalpon` con la ocupación real del galpón destino
(consultada por el repository) — dos guards puras combinadas, ninguna
sabe de la otra, mismo espíritu de composición que ya usa
`puedeDesactivarUsuario` con `contarGerentesActivos` (el service no
consulta Prisma, la action junta el dato con el resultado del repository).

## Diseño de repositories

### `server/repositories/galpon.ts`
```ts
export function crearGalpon(data: { nombre: string; capacidadMaxima: number }) {
  return prisma.galpon.create({ data });
}

export function actualizarGalpon(id: string, data: { nombre: string; capacidadMaxima: number }) {
  return prisma.galpon.update({ where: { id }, data });
}

export function cambiarEstadoGalpon(id: string, estado: EstadoGalpon) {
  return prisma.galpon.update({ where: { id }, data: { estado } });
}

export function buscarGalponPorId(id: string) {
  return prisma.galpon.findUnique({ where: { id } });
}

// Ocupación de UN galpón — usada por las guards de alta/mudanza/editar/
// desactivar antes de decidir. No trae más que lo necesario (id + avesVivas
// de cada lote alojado) porque solo se necesita para sumar.
export function obtenerOcupacionGalpon(galponId: string) {
  return prisma.historialUbicacionLote.findMany({
    where: { galponId, fechaSalida: null },
    include: { lote: { select: { id: true, codigo: true, avesVivas: true } } },
  });
}

export function listarGalponesActivos() {
  return prisma.galpon.findMany({ where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } });
}

// Para la tabla de /galpones (H6): una sola query con include, no N+1 —
// cada fila ya trae sus lotes alojados actuales para calcular la
// ocupación en el Server Component, sin una consulta aparte por fila.
export function listarGalponesConOcupacion(params: { skip: number; take: number }) {
  return prisma.galpon.findMany({
    orderBy: { nombre: "asc" },
    skip: params.skip,
    take: params.take,
    include: {
      historialUbicaciones: {
        where: { fechaSalida: null },
        include: { lote: { select: { id: true, codigo: true, avesVivas: true } } },
      },
    },
  });
}

export function contarGalpones() {
  return prisma.galpon.count();
}
```

### `server/repositories/lote.ts`
```ts
// $transaction en array-form (mismo patrón que desactivarUsuarioYRevocarSesiones)
// — el id del lote se genera acá mismo con crypto.randomUUID() para poder
// referenciarlo en la segunda operación (crear la primera fila de
// HistorialUbicacionLote) sin necesitar el resultado de la primera query,
// que el array-form de $transaction no expone hasta que TODA la
// transacción termina. La alternativa (prisma.$transaction(async tx => ...))
// introduciría un patrón nuevo en el repo — no se usa en ningún lugar
// todavía, así que no se introduce acá sin necesidad real.
export function crearLoteConUbicacion(data: {
  codigo: string;
  fechaIngreso: Date;
  avesIniciales: number;
  galponId: string;
}) {
  const loteId = crypto.randomUUID();
  const ahora = new Date();
  return prisma.$transaction([
    prisma.lote.create({
      data: {
        id: loteId,
        codigo: data.codigo,
        fechaIngreso: data.fechaIngreso,
        avesIniciales: data.avesIniciales,
        avesVivas: data.avesIniciales,
      },
    }),
    prisma.historialUbicacionLote.create({
      data: { loteId, galponId: data.galponId, fechaEntrada: ahora },
    }),
  ]);
}

// updateMany (no update) para cerrar la fila vieja — mismo motivo que
// revocarSesionesPorUsuario desde Sprint 1: si por algún motivo no hay
// fila abierta (no debería pasar, lo garantiza el índice único parcial
// de S0-5), es un no-op silencioso, no un throw de P2025.
export function mudarLote(loteId: string, galponDestinoId: string, ahora: Date) {
  return prisma.$transaction([
    prisma.historialUbicacionLote.updateMany({
      where: { loteId, fechaSalida: null },
      data: { fechaSalida: ahora },
    }),
    prisma.historialUbicacionLote.create({
      data: { loteId, galponId: galponDestinoId, fechaEntrada: ahora },
    }),
  ]);
}

export function finalizarLote(id: string, ahora: Date) {
  return prisma.$transaction([
    prisma.lote.update({ where: { id }, data: { estado: "INACTIVO" } }),
    prisma.historialUbicacionLote.updateMany({
      where: { loteId: id, fechaSalida: null },
      data: { fechaSalida: ahora },
    }),
  ]);
}

export function buscarLotePorId(id: string) {
  return prisma.lote.findUnique({ where: { id } });
}

export function buscarLotePorCodigo(codigo: string) {
  return prisma.lote.findUnique({ where: { codigo } });
}

// Ubicación abierta de UN lote — usada por la guard de mudanza (necesita
// el galponOrigenId para el chequeo "no mudar al mismo galpón") y por el
// repository de mudanza para saber qué cerrar.
export function buscarUbicacionActual(loteId: string) {
  return prisma.historialUbicacionLote.findFirst({ where: { loteId, fechaSalida: null } });
}

// Para la tabla de /lotes (H6): include, no N+1, mismo criterio que
// listarGalponesConOcupacion.
export function listarLotesConUbicacion(params: { skip: number; take: number }) {
  return prisma.lote.findMany({
    orderBy: { fechaIngreso: "desc" },
    skip: params.skip,
    take: params.take,
    include: {
      historialUbicaciones: {
        where: { fechaSalida: null },
        include: { galpon: { select: { id: true, nombre: true } } },
      },
    },
  });
}

export function contarLotes() {
  return prisma.lote.count();
}
```

## Diseño de Zod schemas

### `lib/zod/galpon.ts`
```ts
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(80);
const capacidadMaxima = z.coerce.number().int().positive("Debe ser mayor a 0");
const galponId = z.string().uuid("Id inválido");

export const crearGalponSchema = z.object({ nombre, capacidadMaxima });
export const editarGalponSchema = z.object({ galponId, nombre, capacidadMaxima });
export const cambiarEstadoGalponSchema = z.object({
  galponId,
  estado: z.enum(["ACTIVO", "INACTIVO"]),
});
```
`z.coerce.number()` porque el input llega como string desde `FormData`
(mismo problema que ya resuelve `normalizarInput` en `withAuth` para el
resto de campos, pero acá específicamente para que `"500"` se convierta a
`500` antes del `.int().positive()`).

### `lib/zod/lote.ts`
```ts
const codigo = z.string().trim().min(1, "El código es obligatorio").max(40);
const fechaIngreso = z.coerce.date({ message: "Fecha inválida" });
const avesIniciales = z.coerce.number().int().positive("Debe ser mayor a 0");
const loteId = z.string().uuid("Id inválido");
const galponId = z.string().uuid("Seleccioná un galpón");

export const crearLoteSchema = z.object({ codigo, fechaIngreso, avesIniciales, galponId });
export const mudarLoteSchema = z.object({ loteId, galponDestinoId: galponId });
export const finalizarLoteSchema = z.object({ loteId });
```

## Diseño de Server Actions

### `server/actions/galpon.ts`
```ts
export const crearGalpon = withAuth(
  { schema: crearGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "CREAR" },
  async (input) => {
    const galpon = await crearGalponRepo(input);
    return { data: { id: galpon.id }, entidadId: galpon.id, estadoDespues: galpon };
  },
);

export const editarGalpon = withAuth(
  { schema: editarGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "EDITAR" },
  async (input) => {
    const existente = await buscarGalponPorId(input.galponId);
    if (!existente) throw new AccionError("El galpón no existe.");

    const ocupacion = await obtenerOcupacionGalpon(input.galponId);
    const avesActuales = ocupacion.reduce((suma, fila) => suma + fila.lote.avesVivas, 0);
    const guard = puedeReducirCapacidad({
      capacidadNueva: input.capacidadMaxima,
      avesActualesAlojadas: avesActuales,
    });
    if (!guard.permitido) throw new AccionError(guard.motivo);

    const galpon = await actualizarGalpon(input.galponId, {
      nombre: input.nombre,
      capacidadMaxima: input.capacidadMaxima,
    });
    return {
      data: { id: galpon.id },
      entidadId: galpon.id,
      estadoAntes: { nombre: existente.nombre, capacidadMaxima: existente.capacidadMaxima },
      estadoDespues: { nombre: galpon.nombre, capacidadMaxima: galpon.capacidadMaxima },
    };
  },
);

export const cambiarEstadoGalponAction = withAuth(
  { schema: cambiarEstadoGalponSchema, rol: "GERENTE", entidad: "Galpon", accion: "CAMBIAR_ESTADO" },
  async (input) => {
    const existente = await buscarGalponPorId(input.galponId);
    if (!existente) throw new AccionError("El galpón no existe.");
    if (input.estado === existente.estado) {
      return {
        data: { id: existente.id, estado: existente.estado },
        entidadId: existente.id,
        estadoAntes: { estado: existente.estado },
        estadoDespues: { estado: existente.estado },
      };
    }
    if (input.estado === "INACTIVO") {
      const ocupacion = await obtenerOcupacionGalpon(input.galponId);
      const guard = puedeDesactivarGalpon({ lotesAlojados: ocupacion.length });
      if (!guard.permitido) throw new AccionError(guard.motivo);
    }
    const galpon = await cambiarEstadoGalpon(input.galponId, input.estado);
    return {
      data: { id: galpon.id, estado: galpon.estado },
      entidadId: galpon.id,
      estadoAntes: { estado: existente.estado },
      estadoDespues: { estado: galpon.estado },
    };
  },
);
```
Mismo patrón "no-op si ya está en el estado pedido" que
`cambiarEstadoUsuarioAction` de Sprint 2 — evita una escritura/auditoría
vacía si el Gerente hace doble clic o reenvía el mismo estado.

### `server/actions/lote.ts`
```ts
export const crearLote = withAuth(
  { schema: crearLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "CREAR" },
  async (input) => {
    const existente = await buscarLotePorCodigo(input.codigo);
    if (existente) throw new AccionError(ERROR_CODIGO_DUPLICADO);

    const galpon = await buscarGalponPorId(input.galponId);
    if (!galpon) throw new AccionError("El galpón no existe.");

    const ocupacion = await obtenerOcupacionGalpon(input.galponId);
    const avesActuales = ocupacion.reduce((suma, fila) => suma + fila.lote.avesVivas, 0);
    const guard = puedeAlojarEnGalpon({
      galponEstado: galpon.estado,
      capacidadMaxima: galpon.capacidadMaxima,
      avesActualesAlojadas: avesActuales,
      avesEntrantes: input.avesIniciales,
    });
    if (!guard.permitido) throw new AccionError(guard.motivo);

    let resultado;
    try {
      resultado = await crearLoteConUbicacion(input);
    } catch (error) {
      if (esErrorDeUnicidad(error)) throw new AccionError(ERROR_CODIGO_DUPLICADO);
      throw error;
    }
    const [lote] = resultado;
    return { data: { id: lote.id }, entidadId: lote.id, estadoDespues: lote };
  },
);

export const mudarLoteAction = withAuth(
  { schema: mudarLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "MUDAR" },
  async (input) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) throw new AccionError("El lote no existe.");

    const ubicacionActual = await buscarUbicacionActual(input.loteId);
    const guardMudanza = puedeMudarLote({
      loteEstado: lote.estado,
      galponOrigenId: ubicacionActual?.galponId ?? null,
      galponDestinoId: input.galponDestinoId,
    });
    if (!guardMudanza.permitido) throw new AccionError(guardMudanza.motivo);

    const destino = await buscarGalponPorId(input.galponDestinoId);
    if (!destino) throw new AccionError("El galpón destino no existe.");

    const ocupacionDestino = await obtenerOcupacionGalpon(input.galponDestinoId);
    const avesDestino = ocupacionDestino.reduce((suma, fila) => suma + fila.lote.avesVivas, 0);
    const guardCapacidad = puedeAlojarEnGalpon({
      galponEstado: destino.estado,
      capacidadMaxima: destino.capacidadMaxima,
      avesActualesAlojadas: avesDestino,
      avesEntrantes: lote.avesVivas,
    });
    if (!guardCapacidad.permitido) throw new AccionError(guardCapacidad.motivo);

    await mudarLote(input.loteId, input.galponDestinoId, new Date());
    return {
      data: { id: lote.id },
      entidadId: lote.id,
      estadoAntes: { galponId: ubicacionActual?.galponId ?? null },
      estadoDespues: { galponId: input.galponDestinoId },
    };
  },
);

export const finalizarLoteAction = withAuth(
  { schema: finalizarLoteSchema, rol: "GERENTE", entidad: "Lote", accion: "FINALIZAR" },
  async (input) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote) throw new AccionError("El lote no existe.");

    const guard = puedeFinalizarLote({ loteEstado: lote.estado });
    if (!guard.permitido) throw new AccionError(guard.motivo);

    await finalizarLote(input.loteId, new Date());
    return {
      data: { id: lote.id },
      entidadId: lote.id,
      estadoAntes: { estado: lote.estado },
      estadoDespues: { estado: "INACTIVO" },
    };
  },
);
```
`esErrorDeUnicidad` (catch de `P2002`) se reusa igual que en
`server/actions/usuario.ts` — cubre la carrera entre dos altas de lote
simultáneas con el mismo `codigo`, igual que ya cubre la de `usuario`.

## Badges de estado — nuevos, siguiendo la regla vigente de `globals.css`
A diferencia del badge preexistente de `usuarios-tabla.tsx` (deuda
documentada en spec.md, no se toca en este sprint), los badges nuevos de
Galpón y Lote **sí** siguen `convenciones.md` desde el vamos: se agregan
dos clases a `@layer components` de `globals.css`, reusando exactamente
los mismos tonos que ya aprobó el Product Owner (el verde de
`.toast-success`, el gris neutro de `INACTIVO`):
```css
.badge-estado-activo {
  @apply border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200;
}
.badge-estado-inactivo {
  @apply border-border bg-muted text-muted-foreground;
}
```
`GalponesTabla` y `LotesTabla` aplican `<Badge variant="secondary"
className={estado === "ACTIVO" ? "badge-estado-activo" :
"badge-estado-inactivo"} />` — ambas tablas reusan las mismas dos clases,
no una por módulo.

## Diseño de UI

### `app/(app)/galpones/page.tsx`
Mismo esqueleto que `app/(app)/usuarios/page.tsx`: Server Component, guard
de rol redundante (`notFound()` si `session.user.rol !== "GERENTE"`,
segunda capa además del 403 de `proxy.ts`), `Promise.all` de
`listarGalponesConOcupacion` + `contarGalpones`, `PageHeader` con
`GalponFormDialog` (modo crear) como `actions`, `GalponesTabla`,
`DataTablePagination` (`PAGE_SIZE = 10`, `basePath="/galpones"`).

`GalponesTabla` columnas: Nombre | Capacidad máxima | Ocupación actual
(`{avesAlojadas} / {capacidadMaxima} aves`, calculado en el propio
componente a partir de `historialUbicaciones` incluidas) | Lotes alojados
(chips con el `codigo` de cada lote, o "—" si está vacío) | Estado (badge)
| Acciones (`GalponFormDialog` modo editar + botón Activar/Desactivar vía
`cambiarEstadoGalponAction`, mismo patrón `useTransition` +
`toastManager` que `UsuariosTabla`).

`GalponFormDialog` — copia estructural de `UsuarioFormDialog`
(`useActionState`, `formRef`, gateo `{open ? (...) : null}` del form,
mismo `INPUT_COMPACTO`/`LABEL_COMPACTO`) con dos campos: `nombre`,
`capacidadMaxima` (`type="number"` `min={1}`).

### `app/(app)/lotes/page.tsx`
Mismo esqueleto, con un fetch adicional: `listarGalponesActivos()` (sin
paginar — son pocos, se usan solo para poblar el `<Select>` de destino en
los diálogos de alta y mudanza). `PageHeader` con `LoteFormDialog` (modo
crear, recibe `galponesActivos`) como `actions`.

`LotesTabla` columnas: Código | Fecha ingreso | Aves iniciales | Aves
vivas | Ubicación actual (nombre del galpón vía
`historialUbicaciones[0]?.galpon.nombre`, o "— finalizado —" si no hay
ninguna abierta) | Estado (badge) | Acciones — solo si `estado ===
"ACTIVO"`: botón "Mudar" (abre `MudanzaDialog`, `<Select>` con
`galponesActivos` **excluyendo** el galpón donde ya está) y botón
"Finalizar" (abre `FinalizarLoteDialog`, confirmación simple con
`Dialog` + texto explicando que la acción no se puede deshacer, no un
`window.confirm` nativo — evita el problema ya documentado de diálogos de
navegador bloqueando la extensión Claude in Chrome durante verificación).

`LoteFormDialog` — mismo patrón de `UsuarioFormDialog`/`GalponFormDialog`,
campos: `codigo`, `fechaIngreso` (`type="date"`), `avesIniciales`
(`type="number"` `min={1}`), `galponId` (`<Select>` poblado con
`galponesActivos`).

## `RUTAS_POR_ROL` y `NAV_ITEMS`
```ts
// server/auth/rbac.ts
export const RUTAS_POR_ROL: { ruta: string; roles: Rol[] }[] = [
  { ruta: "/usuarios", roles: ["GERENTE"] },
  { ruta: "/galpones", roles: ["GERENTE"] },
  { ruta: "/lotes", roles: ["GERENTE"] },
];
```
```ts
// components/layout/nav-items.ts
import { Home, Users, Warehouse, Layers3 } from "lucide-react";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/galpones", label: "Galpones", icon: Warehouse },
  { href: "/lotes", label: "Lotes", icon: Layers3 },
];
```
Confirmar en S3-11 que `Warehouse`/`Layers3` existen en la versión de
`lucide-react` instalada (`npm ls lucide-react`) — si no, usar el
ícono equivalente más cercano disponible, sin bloquear la tarea por esto.

## Orden de ejecución (hay dependencias entre tareas)
1. **S3-1** — Migración: `estado` en `Galpon` (H1). Independiente,
   primero porque todo lo demás de Galpón depende de que el campo exista.
2. **S3-2** — `lib/zod/galpon.ts` + `server/repositories/galpon.ts` +
   `server/services/galpon.ts`. Depende de S3-1.
3. **S3-3** — `server/actions/galpon.ts` vía `withAuth`. Depende de S3-2.
4. **S3-4** — Pantalla `/galpones` (`GalponFormDialog`, `GalponesTabla`,
   `page.tsx`) + clases `.badge-estado-*` en `globals.css`. Depende de
   S3-3.
5. **S3-5** — `RUTAS_POR_ROL` (`/galpones`) + `NAV_ITEMS` ("Galpones").
   Puede ir en paralelo con S3-4, antes de verificar en navegador.
6. **S3-6** — `lib/zod/lote.ts` + `server/repositories/lote.ts` +
   `server/services/lote.ts`. Independiente de Galpón salvo por reusar
   `obtenerOcupacionGalpon`/`puedeAlojarEnGalpon` (S3-2), así que depende
   de S3-2, no de S3-3/S3-4.
7. **S3-7** — `server/actions/lote.ts` (`crearLote`) vía `withAuth`.
   Depende de S3-6.
8. **S3-8** — `server/actions/lote.ts` (`mudarLoteAction`,
   `finalizarLoteAction`). Puede ir junto con S3-7 (mismo archivo), se
   separa acá solo para ordenar la revisión.
9. **S3-9** — Pantalla `/lotes` (`LoteFormDialog`, `MudanzaDialog`,
   `FinalizarLoteDialog`, `LotesTabla`, `page.tsx`). Depende de S3-7,
   S3-8 y de `listarGalponesActivos` (S3-2).
10. **S3-10** — `RUTAS_POR_ROL` (`/lotes`) + `NAV_ITEMS` ("Lotes").
    Depende de S3-9.
11. **S3-11** — Tests unitarios de `services/galpon.ts` y
    `services/lote.ts`. Puede escribirse apenas S3-2/S3-6 existen, en
    paralelo con el resto.
12. **S3-12** — Tests de integración de `actions/galpon.ts` y
    `actions/lote.ts` (repositories mockeados, mismo patrón que
    `tests/integration/actions/usuario.test.ts`). Depende de S3-3, S3-8.
13. **S3-13** — Verificación en vivo del índice único parcial de
    `HistorialUbicacionLote` contra la base real (H7) + verificación
    manual end-to-end (crear galpón, dar de alta lote, mudarlo, finalizarlo)
    con script/curl+cookie jar, mismo patrón que Sprint 2. Al final,
    cubre S3-1 a S3-10.

## Comandos de referencia
```bash
npx prisma migrate dev --name galpon_estado
npx prisma validate
npx prisma studio    # verificar filas de Galpon/Lote/HistorialUbicacionLote
npm run typecheck && npm run lint && npm test
```

## Estructura de archivos esperada
```
src/
  server/
    auth/
      rbac.ts                         # + /galpones, /lotes
    actions/
      galpon.ts
      lote.ts
    services/
      galpon.ts                       # puedeAlojarEnGalpon, puedeDesactivarGalpon, puedeReducirCapacidad
      lote.ts                         # puedeMudarLote, puedeFinalizarLote
    repositories/
      galpon.ts
      lote.ts
  lib/
    zod/
      galpon.ts
      lote.ts
  components/
    layout/
      nav-items.ts                    # + Galpones, Lotes
    domain/
      galpones/
        galpon-form-dialog.tsx
        galpones-tabla.tsx
      lotes/
        lote-form-dialog.tsx
        mudanza-dialog.tsx
        finalizar-lote-dialog.tsx
        lotes-tabla.tsx
  app/
    (app)/
      galpones/
        page.tsx
      lotes/
        page.tsx
  app/globals.css                     # + .badge-estado-activo/.badge-estado-inactivo
prisma/
  schema.prisma                       # + EstadoGalpon, Galpon.estado
  migrations/<timestamp>_galpon_estado/
tests/
  factories/galpon.factory.ts         # + estado
  unit/services/galpon.test.ts
  unit/services/lote.test.ts
  integration/actions/galpon.test.ts
  integration/actions/lote.test.ts
```

## Definition of Done aplicable a este sprint
`memory/definition-of-done.md` sigue sin existir (mismo hallazgo que
Sprint 2). Hasta que se cree, este sprint se verifica contra:
- Ningún componente ni service importa Prisma directamente — solo
  `server/repositories/galpon.ts` y `lote.ts`.
- Toda Server Action nueva (`crearGalpon`, `editarGalpon`,
  `cambiarEstadoGalponAction`, `crearLote`, `mudarLoteAction`,
  `finalizarLoteAction`) pasa por `withAuth`.
- Toda mutación que toque más de una tabla
  (`crearLoteConUbicacion`: Lote + HistorialUbicacionLote; `mudarLote`:
  dos filas de HistorialUbicacionLote; `finalizarLote`: Lote +
  HistorialUbicacionLote) va dentro de `prisma.$transaction`.
- TypeScript strict, cero `any`, cero `@ts-ignore`.
- `npm run typecheck && npm run lint && npm test` y `npx prisma validate`
  en verde antes de cerrar el sprint.
- Guards de capacidad/estado/mudanza verificadas con tests de integración
  reales (repositories mockeados) y con al menos una verificación manual
  contra Neon real (mismo estándar que Sprint 2 aplicó a AuditLog y
  SesionActiva) — en particular, el índice único parcial de
  HistorialUbicacionLote (H7) se verifica en vivo, no solo se asume que
  sigue existiendo desde Sprint 0.
