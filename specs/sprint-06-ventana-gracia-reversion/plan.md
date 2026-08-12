# Plan técnico — Sprint 6

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `RegistroRecoleccion.revertido` existe,
  `revertidoEn` **no** — falta agregarlo (ver "Hallazgo real" en
  `spec.md`). `Paquete.estado` (enum `EstadoPaquete`:
  `DISPONIBLE/VENDIDO/ROTO/ANULADO`) ya trae `ANULADO` sin usar.
  `TipoMovimientoSueltos` ya trae `REVERSION`/`AJUSTE_GERENTE` sin usar.
  `InventarioSueltos.cantidad` tiene `CHECK (cantidad >= 0)` a nivel de
  base (S0-5, migración `20260802063735_init`).
- `server/repositories/mortalidad.ts` (`revertirMortalidad`,
  `registrarMortalidadYDescontarAves`) es la referencia real de
  transacción interactiva con `UPDATE` condicional como guard anti-carrera
  — este sprint reusa el mismo patrón, extendido a un `updateMany` sobre
  varias filas para el guard de `Paquete` (pieza nueva, ver más abajo).
- `server/services/mortalidad.ts` (`puedeRevertirMortalidad`) es la
  referencia de guard pura de ventana de gracia — se reusa el mismo
  cálculo de minutos transcurridos.
- `components/domain/mortalidad/revertir-mortalidad-boton.tsx` es la
  referencia de UI (countdown real, `setInterval`, plazo autoritativo
  revalidado en servidor) — se clona el patrón, no se generaliza a un
  componente compartido en este sprint (dos módulos con formas de
  registro ligeramente distintas — `fecha` en Mortalidad vs. `creadoEn` en
  Recolección — no vale la pena la abstracción todavía; si un tercer
  módulo necesita lo mismo, ahí sí se extrae).
- `server/repositories/recoleccion.ts` (`registrarRecoleccion`,
  `buscarRecoleccionConPaquetesPorId`, `listarRecolecciones`,
  `contarRecolecciones`) — se reusa `buscarRecoleccionConPaquetesPorId`
  para leer el registro completo (con sus `paquetes`) antes de revertir.
- `server/services/inventario.ts` (`reconstruirSaldo`) — se modifica, no
  se reescribe: se resuelve el signo de `REVERSION` y `AJUSTE_GERENTE`,
  dejados a propósito sin resolver desde Sprint 5.
- `lib/zod/comun.ts` (`idUuid()`) — se usa para todo id nuevo, igual que
  siempre.
- `server/auth/with-auth.ts` (`withAuth`, `AccionError`) — sin cambios,
  se usa igual que en Mortalidad/Recolección. Primera vez que este
  proyecto necesita `rol: "GERENTE"` en un módulo que por lo demás queda
  abierto a ambos roles (`/recoleccion` sigue sin entrada en
  `RUTAS_POR_ROL` — la restricción de rol del ajuste vive en la Server
  Action, no en la ruta).
- `server/repositories/galpon.ts` (`listarGalponesActivos`) y
  `server/repositories/lote.ts` (`listarLotesActivos`) — se reusan para
  poblar los dos `<Select>` independientes del diálogo de ajuste.

## Migración de schema (primera tarea, todo lo demás depende de esto)

```prisma
model RegistroRecoleccion {
  ...
  revertido   Boolean   @default(false)
  revertidoEn DateTime?
  ...
}
```

`npx prisma migrate dev --name recoleccion_revertido_en` genera un `ADD
COLUMN "revertidoEn" TIMESTAMP(3);` — no destructiva, mismo patrón exacto
que `20260808024615_mortalidad_revertido_bitacora_eliminada`. Se aplica
contra Neon real antes de escribir cualquier código que dependa del campo.

## Pieza nueva de arquitectura 1: guard "todo o nada" sobre un conjunto de filas

### Por qué el patrón de Mortalidad no alcanza tal cual
`registrarMortalidadYDescontarAves`/`revertirMortalidad` protegen **una
sola fila** (`Lote` o `RegistroMortalidad`) con `WHERE condicion`. Acá el
guard de elegibilidad tiene que verificar **N filas relacionadas**
(`Paquete.registroRecoleccionId = X`) y decidir todo-o-nada según cuántas
de ellas siguen en el estado esperado.

### El patrón real: `updateMany` + comparación de conteo
```ts
// server/repositories/recoleccion.ts
export class YaRevertidoError extends Error {}
export class PaquetesNoDisponiblesError extends Error {}
export class SaldoInsuficienteError extends Error {}

export function revertirRecoleccion(params: {
  id: string;
  galponId: string;
  loteId: string;
  sueltos: number; // recalculado por quien llama vía calcularEmpaque(cantidadTotal).sueltos
  usuarioId: string;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    // 1) Guard anti-carrera de "ya revertido" — mismo patrón que Mortalidad.
    const marcado = await tx.registroRecoleccion.updateMany({
      where: { id: params.id, revertido: false },
      data: { revertido: true, revertidoEn: params.ahora },
    });
    if (marcado.count === 0) throw new YaRevertidoError();

    // 2) Guard "todo o nada" sobre Paquete — pieza nueva de este sprint.
    //    El total se cuenta DENTRO de la misma transacción (no antes, no
    //    en la Server Action) para que la comparación sea consistente con
    //    el propio UPDATE de abajo, no con una lectura de otro momento.
    const totalPaquetes = await tx.paquete.count({
      where: { registroRecoleccionId: params.id },
    });
    if (totalPaquetes > 0) {
      const anulados = await tx.paquete.updateMany({
        where: { registroRecoleccionId: params.id, estado: "DISPONIBLE" },
        data: { estado: "ANULADO" },
      });
      if (anulados.count !== totalPaquetes) {
        // Al menos un Paquete ya no estaba DISPONIBLE (vendido/roto) —
        // aborta TODO, incluido el paso 1 (Prisma revierte la
        // transacción completa).
        throw new PaquetesNoDisponiblesError();
      }
    }

    // 3) Guard de saldo suficiente sobre InventarioSueltos — mismo
    //    patrón UPDATE condicional que avesVivas, no un decrement a
    //    ciegas que dependa del CHECK de la base.
    if (params.sueltos > 0) {
      const descontado = await tx.inventarioSueltos.updateMany({
        where: {
          galponId: params.galponId,
          loteId: params.loteId,
          cantidad: { gte: params.sueltos },
        },
        data: { cantidad: { decrement: params.sueltos } },
      });
      if (descontado.count === 0) throw new SaldoInsuficienteError();

      await tx.movimientoSueltos.create({
        data: {
          galponId: params.galponId,
          loteId: params.loteId,
          tipo: "REVERSION",
          cantidad: params.sueltos,
          referenciaId: params.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }
  });
}
```

**Orden importa:** se marca `revertido` primero porque es el guard más
barato y el que más frecuentemente va a fallar en la práctica (doble
clic) — fallar rápido ahí evita hacer el `count`/`updateMany` de
`Paquete` innecesariamente. Cualquier error lanzado en los pasos 2 o 3
aborta la transacción **completa**, incluido el paso 1 — Prisma no aplica
nada parcial de una transacción interactiva que termina en excepción.

### El caso `sueltos === 0` (múltiplo exacto de 180, o ya en 0 aunque el registro tuviera sueltos originalmente)
No se toca `InventarioSueltos` ni se crea `MovimientoSueltos` — mismo
criterio de "sin ruido en el ledger" que Sprint 5 ya estableció.
`sueltos` lo recalcula la Server Action con
`calcularEmpaque(registro.cantidadTotal).sueltos`, nunca se lee de una
columna persistida (no existe una — sigue siendo un campo calculado, ver
`memory/modelo-datos.md`).

## Pieza nueva de arquitectura 2: Ajuste manual del Gerente

### Por qué necesita idempotencia por id de cliente (y la reversión no)
La reversión es un `UPDATE` sobre algo que ya existe — el propio
`revertido = false` en el `WHERE` ya la hace naturalmente idempotente
(un reintento choca con `YaRevertidoError`, no duplica nada). El ajuste
manual, en cambio, **crea una fila nueva e independiente**
(`MovimientoSueltos`) sin ninguna unicidad de negocio posible sobre sus
campos (`galponId`+`loteId`+`cantidad`+`motivo` pueden repetirse
legítimamente en dos ajustes reales distintos) — cae exactamente en el
tercer caso de la regla de `memory/convenciones.md`
("Idempotencia por id de cliente"): necesita el patrón completo.

```ts
// server/repositories/inventario.ts
export class SaldoInsuficienteAjusteError extends Error {}

export function ajustarInventarioSueltos(params: {
  id: string; // generado en el cliente
  galponId: string;
  loteId: string;
  delta: number; // puede ser negativo
  motivo: string;
  usuarioId: string;
  ahora: Date;
}) {
  return prisma.$transaction(async (tx) => {
    if (params.delta >= 0) {
      await tx.inventarioSueltos.upsert({
        where: { galponId_loteId: { galponId: params.galponId, loteId: params.loteId } },
        create: { galponId: params.galponId, loteId: params.loteId, cantidad: params.delta },
        update: { cantidad: { increment: params.delta } },
      });
    } else {
      const actualizado = await tx.inventarioSueltos.updateMany({
        where: {
          galponId: params.galponId,
          loteId: params.loteId,
          cantidad: { gte: -params.delta },
        },
        data: { cantidad: { increment: params.delta } }, // delta negativo: decrementa
      });
      if (actualizado.count === 0) throw new SaldoInsuficienteAjusteError();
    }

    return tx.movimientoSueltos.create({
      data: {
        id: params.id,
        galponId: params.galponId,
        loteId: params.loteId,
        tipo: "AJUSTE_GERENTE",
        cantidad: params.delta,
        motivo: params.motivo,
        usuarioId: params.usuarioId,
        creadoEn: params.ahora,
      },
    });
  });
}
```

El `create` con `id` explícito va al final, dentro de la misma
transacción — si lanza `P2002` (reintento), Prisma revierte también el
`upsert`/`updateMany` de arriba, mismo criterio verificado en vivo para
Mortalidad en Sprint 5 (el `create` con `id` puede ir después del
decremento sin problema). El `catch` de `P2002` vive en la Server Action
(`server/actions/inventario.ts`), no acá — mismo precedente que
`recoleccion.ts`/`mortalidad.ts`/`galpon.ts`/`bitacora.ts`.

**Caso `delta === 0`:** rechazado por Zod antes de llegar acá (un ajuste
de 0 no tiene sentido de negocio, ver diseño de schema abajo).

## Diseño de servicios puros

### `server/services/recoleccion.ts` (agrega `puedeRevertirRecoleccion`)
```ts
export function puedeRevertirRecoleccion(params: {
  revertido: boolean;
  creadoEn: Date;
  ahora: Date;
  paquetesNoDisponibles: number; // cuántos Paquete de este registro NO están DISPONIBLE
}): GuardResultado {
  if (params.revertido) {
    return { permitido: false, motivo: "Este registro ya fue revertido." };
  }
  if (params.paquetesNoDisponibles > 0) {
    return {
      permitido: false,
      motivo:
        "Ya se vendió o rompió al menos un paquete de este registro — no se puede corregir automáticamente.",
    };
  }
  const minutosTranscurridos = (params.ahora.getTime() - params.creadoEn.getTime()) / 60_000;
  if (minutosTranscurridos > VENTANA_GRACIA_MIN) {
    return {
      permitido: false,
      motivo: `La ventana de ${VENTANA_GRACIA_MIN} minutos para deshacer este registro ya pasó.`,
    };
  }
  return { permitido: true };
}
```
Guard de **aplicación** — dado el mensaje rápido y preciso en el caso
común (mismo criterio que `puedeRevertirMortalidad`). El backstop real
contra la carrera (H2/H5) vive en el `updateMany` de
`revertirRecoleccion()` del repository, no acá — esta función no toca la
base. Orden de los tres chequeos elegido a propósito: "ya revertido" da
el mensaje más específico primero (no tiene sentido decir "ya se vendió
algo" de un registro que de todos modos ya está revertido); elegibilidad
antes que ventana porque, aunque ambas bloqueen, un paquete vendido es un
motivo más permanente/importante de mostrarle al usuario que "se te pasó
el tiempo" (que suena a "llegaste tarde", cuando en realidad nunca iba a
poder revertirse).

`paquetesNoDisponibles` lo calcula quien llama (la Server Action, contando
sobre `registro.paquetes` ya leído para la respuesta) — este service
sigue sin importar Prisma.

### `server/services/inventario.ts` (modifica `reconstruirSaldo`, resuelve el pendiente de Sprint 5)
```ts
const TIPOS_ENTRADA: readonly TipoMovimientoSueltos[] = [
  "RECOLECCION",
  "ROTURA_PAQUETE_ENTRADA",
];
const TIPOS_SALIDA: readonly TipoMovimientoSueltos[] = [
  "CONSOLIDACION_SALIDA",
  "VENTA_SUELTO",
  "REVERSION", // resuelto en Sprint 6: siempre deshace una entrada RECOLECCION anterior
];

// AJUSTE_GERENTE es el único tipo cuyo `cantidad` no es siempre positivo
// (Sprint 6): se guarda con signo (delta real elegido por el Gerente), así
// que se suma directo al saldo sin pasar por las listas de arriba. Código
// futuro que lea MovimientoSueltos.cantidad asumiendo que siempre es
// positivo tiene que tratar este tipo aparte.
export function reconstruirSaldo(
  movimientos: { tipo: TipoMovimientoSueltos; cantidad: number }[],
): number {
  return movimientos.reduce((saldo, movimiento) => {
    if (movimiento.tipo === "AJUSTE_GERENTE") return saldo + movimiento.cantidad;
    if (TIPOS_ENTRADA.includes(movimiento.tipo)) return saldo + movimiento.cantidad;
    if (TIPOS_SALIDA.includes(movimiento.tipo)) return saldo - movimiento.cantidad;
    return saldo;
  }, 0);
}
```
`AJUSTE_GERENTE` se saca de `TIPOS_ENTRADA` (donde Sprint 5 lo había
dejado "por ahora", con el comentario explícito de que Sprint 6 tenía que
resolver el signo). Tests existentes de `inventario.test.ts` que asumían
`AJUSTE_GERENTE` como entrada fija se actualizan.

## Diseño de Zod schemas

### `lib/zod/recoleccion.ts` (agrega)
```ts
export const revertirRecoleccionSchema = z.object({ registroId: idUuid() });
export type RevertirRecoleccionInput = z.infer<typeof revertirRecoleccionSchema>;
```
Mismo schema mínimo que `revertirMortalidadSchema`.

### `lib/zod/inventario.ts` (nuevo)
```ts
export const ajustarInventarioSueltosSchema = z.object({
  id: idUuid(),
  galponId: idUuid("Seleccioná un galpón"),
  loteId: idUuid("Seleccioná un lote"),
  delta: z.coerce.number().int().refine((v) => v !== 0, "El ajuste no puede ser 0"),
  motivo: z
    .string()
    .trim()
    .min(10, "Explicá el motivo del ajuste (mínimo 10 caracteres)")
    .max(500),
});
export type AjustarInventarioSueltosInput = z.infer<typeof ajustarInventarioSueltosSchema>;
```
`delta` entero (mismas unidades que `InventarioSueltos.cantidad`, sin
decimales — son huevos sueltos). `motivo` con mínimo de 10 caracteres a
propósito: es la única barrera real contra un ajuste sin explicación real
("s", "ok"), no una validación de contenido — el roadmap exige "requiere
un motivo/comentario obligatorio, dado que rompe la protección
automática" (pregunta 6b del brief, resuelta: sí, obligatorio y con un
mínimo razonable, no solo `min(1)`).

## Diseño de repositories
Ambos ya detallados arriba (`revertirRecoleccion` en
`server/repositories/recoleccion.ts`, `ajustarInventarioSueltos` en
`server/repositories/inventario.ts`, junto a `listarMovimientosSueltos`
ya existente de Sprint 5).

## Diseño de Server Actions

### `server/actions/recoleccion.ts` (agrega `revertirRecoleccionAction`)
```ts
export const revertirRecoleccionAction = withAuth(
  { schema: revertirRecoleccionSchema, entidad: "RegistroRecoleccion", accion: "REVERTIR" },
  async (input, ctx) => {
    const registro = await buscarRecoleccionConPaquetesPorId(input.registroId);
    if (!registro) throw new AccionError("El registro no existe.");

    const paquetesNoDisponibles = registro.paquetes.filter((p) => p.estado !== "DISPONIBLE").length;
    const guard = puedeRevertirRecoleccion({
      revertido: registro.revertido,
      creadoEn: registro.creadoEn,
      ahora: new Date(),
      paquetesNoDisponibles,
    });
    if (!guard.permitido) throw new AccionError(guard.motivo);

    const { sueltos } = calcularEmpaque(registro.cantidadTotal);
    const ahora = new Date();

    try {
      await revertirRecoleccion({
        id: registro.id,
        galponId: registro.galponId,
        loteId: registro.loteId,
        sueltos,
        usuarioId: ctx.usuarioId,
        ahora,
      });
    } catch (error) {
      if (error instanceof YaRevertidoError) {
        throw new AccionError("Este registro ya fue revertido — actualizá la pantalla.");
      }
      if (error instanceof PaquetesNoDisponiblesError) {
        throw new AccionError(
          "Ya se vendió o rompió al menos un paquete de este registro — actualizá la pantalla e intentá de nuevo.",
        );
      }
      if (error instanceof SaldoInsuficienteError) {
        throw new AccionError("El saldo de sueltos ya no alcanza para deshacer este registro.");
      }
      throw error;
    }

    return {
      data: { id: registro.id },
      entidadId: registro.id,
      estadoAntes: { revertido: false },
      estadoDespues: { revertido: true, paquetesAnulados: registro.paquetes.length, sueltosRevertidos: sueltos },
    };
  },
);
```
Sin `rol` (abierta a ambos, decisión confirmada en `spec.md`), mismo
criterio que `revertirMortalidadAction`.

### `server/actions/inventario.ts` (nuevo)
```ts
export const ajustarInventarioSueltosAction = withAuth(
  { schema: ajustarInventarioSueltosSchema, entidad: "MovimientoSueltos", accion: "AJUSTAR", rol: "GERENTE" },
  async (input, ctx) => {
    let movimiento;
    try {
      movimiento = await ajustarInventarioSueltos({
        id: input.id,
        galponId: input.galponId,
        loteId: input.loteId,
        delta: input.delta,
        motivo: input.motivo,
        usuarioId: ctx.usuarioId,
        ahora: new Date(),
      });
    } catch (error) {
      if (error instanceof SaldoInsuficienteAjusteError) {
        throw new AccionError("El saldo no alcanza para este ajuste.");
      }
      if (esErrorDeUnicidad(error)) {
        const existente = await buscarMovimientoSueltosPorId(input.id);
        if (!existente) throw error;
        if (existente.cantidad !== input.delta || existente.motivo !== input.motivo) {
          throw new AccionError("Ya existe un ajuste con este id pero con datos diferentes — no se sobrescribe.");
        }
        movimiento = existente;
      } else {
        throw error;
      }
    }

    return {
      data: { id: movimiento.id },
      entidadId: movimiento.id,
      estadoDespues: { galponId: input.galponId, loteId: input.loteId, delta: input.delta, motivo: input.motivo },
    };
  },
);
```
`rol: "GERENTE"` — primera vez que un módulo por lo demás abierto
(`/recoleccion`) tiene una acción puntual restringida a un solo rol,
enforced en la Server Action (defensa real), no solo escondiendo el botón
en la UI. `buscarMovimientoSueltosPorId(id)` es una lectura mínima nueva
en `server/repositories/inventario.ts`, mismo criterio que
`buscarRecoleccionConPaquetesPorId`.

## Diseño de UI

### `RevertirRecoleccionBoton` (`components/domain/recoleccion/revertir-recoleccion-boton.tsx`)
Clon directo de `RevertirMortalidadBoton`: mismo `setInterval` de 1s, mismo
`formatearMMSS`, mismo `VENTANA_GRACIA_MIN` (ya renombrado) importado de
`lib/constants.ts`. Única diferencia real: el campo de fecha se llama
`creadoEn` (no `fecha`) y la acción invocada es `revertirRecoleccionAction`
con `{ registroId }`.

### `components/domain/recoleccion/recolecciones-tabla.tsx` (modifica)
Agrega columna "Acciones" con `<RevertirRecoleccionBoton registro={...} />`,
fila atenuada (`opacity-60`) cuando `revertido`, mismo criterio visual que
`MortalidadTabla`. La tabla ya trae `paquetes: { select: { id: true } }`
en el `include` de `listarRecolecciones` (Sprint 5) — se amplía a incluir
también `estado` para poder mostrar/ocultar el botón de forma consistente
con la guard real (aunque el servidor es la fuente de verdad final, no
tiene sentido mostrar un botón "Deshacer" habilitado si ya se sabe de
entrada que algún paquete no está DISPONIBLE).

### `AjustarInventarioSueltosDialog` (`components/domain/inventario/ajustar-inventario-sueltos-dialog.tsx`, nuevo)
`<Dialog>` compacto, visible solo si `rol === "GERENTE"` (decidido en el
Server Component `page.tsx`, no con un hook de sesión en cliente — mismo
criterio que el resto del proyecto, `auth()` solo se llama en servidor).
Dos `<Select>` independientes y controlados (lote vía
`listarLotesActivos()`, galpón vía `listarGalponesActivos()` — sin
resolución automática de ubicación, el ajuste puede corregir una
combinación histórica), input numérico `delta` (acepta negativo,
`type="number"`, sin `min`/`max` HTML que choquen con valores negativos
válidos), `<textarea>` `motivo` (mínimo 10 caracteres, contador de
caracteres visible), botón "Guardar" deshabilitado hasta que haya
lote+galpón+delta≠0+motivo válido. `id` generado una sola vez por
apertura del diálogo (`useState(() => crypto.randomUUID())`), mismo
patrón ya establecido para todos los formularios de creación del
proyecto — el bug de S5-13 (id regenerado por clic) no se repite.
`<form action={formAction}>` normal alcanza acá (todos los campos son de
longitud fija, a diferencia de `pesos` en Recolección) — no hace falta el
bypass de `startTransition` manual que sí necesitó
`RegistrarRecoleccionDialog`.

### `app/(app)/recoleccion/page.tsx` (modifica)
```tsx
const session = await auth();
const rol = session!.user!.rol;
// ...
<PageHeader
  title="Recolección"
  actions={
    <div className="flex gap-2">
      {rol === "GERENTE" && <AjustarInventarioSueltosDialog />}
      <RegistrarRecoleccionDialog loteIds={...} />
    </div>
  }
/>
```

## `lib/constants.ts` — renombre
```ts
/** Minutos de ventana de gracia para revertir un registro (Mortalidad y
 * Recolección comparten el mismo plazo — antes MORTALIDAD_VENTANA_GRACIA_MIN,
 * renombrada en Sprint 6 al dejar de ser exclusiva de un módulo). */
export const VENTANA_GRACIA_MIN = 10;
```
Archivos a actualizar por el rename: `server/services/mortalidad.ts`,
`components/domain/mortalidad/revertir-mortalidad-boton.tsx`, y sus tests
(`tests/unit/services/mortalidad.test.ts` si referencia la constante).
Sin cambio de comportamiento — mismo valor, mismo uso, distinto nombre.

## Orden de ejecución (hay dependencias entre tareas)
1. Migración de schema (`revertidoEn`) — nada más puede escribirse contra
   el campo hasta que exista.
2. Rename `VENTANA_GRACIA_MIN` — independiente, se puede hacer en
   paralelo con el punto 1.
3. `server/services/recoleccion.ts` (`puedeRevertirRecoleccion`) + tests.
4. `server/services/inventario.ts` (resolver signo de `REVERSION`/
   `AJUSTE_GERENTE`) + actualizar tests existentes de Sprint 5.
5. `lib/zod/recoleccion.ts` (`revertirRecoleccionSchema`) y
   `lib/zod/inventario.ts` (`ajustarInventarioSueltosSchema`, nuevo).
6. `server/repositories/recoleccion.ts` (`revertirRecoleccion`) — depende
   de 1.
7. `server/repositories/inventario.ts` (`ajustarInventarioSueltos`,
   `buscarMovimientoSueltosPorId`) — independiente de 6.
8. `server/actions/recoleccion.ts` (`revertirRecoleccionAction`) —
   depende de 3, 5, 6.
9. `server/actions/inventario.ts` (nuevo, `ajustarInventarioSueltosAction`)
   — depende de 5, 7.
10. UI: `RevertirRecoleccionBoton` + integración en la tabla — depende
    de 8.
11. UI: `AjustarInventarioSueltosDialog` + integración en `page.tsx` —
    depende de 9.
12. Tests de integración de ambas Server Actions (repositories
    mockeados) — depende de 8, 9.
13. Tests de carrera reales contra Neon (doble reversión, reversión vs.
    venta simulada, doble ajuste) — depende de todo lo anterior.
14. `npx vitest run --coverage` — confirmar ≥90% en los services tocados.
15. Verificación en vivo contra Neon real (transacción completa de
    reversión, ajuste positivo/negativo, `AuditLog` real).
16. Verificación clic a clic en navegador / Product Owner.

## Comandos de referencia
```bash
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npx prisma migrate dev --name recoleccion_revertido_en
npm run build
```

## Estructura de archivos esperada
```
prisma/
  migrations/YYYYMMDDHHMMSS_recoleccion_revertido_en/migration.sql
src/
  lib/
    constants.ts             # VENTANA_GRACIA_MIN (renombrada)
    zod/
      recoleccion.ts         # + revertirRecoleccionSchema
      inventario.ts           # nuevo: ajustarInventarioSueltosSchema
  server/
    services/
      recoleccion.ts          # + puedeRevertirRecoleccion
      inventario.ts           # reconstruirSaldo: signo REVERSION/AJUSTE_GERENTE resuelto
      mortalidad.ts            # usa VENTANA_GRACIA_MIN (renombrada)
    repositories/
      recoleccion.ts          # + revertirRecoleccion, errores custom
      inventario.ts            # + ajustarInventarioSueltos, buscarMovimientoSueltosPorId
    actions/
      recoleccion.ts           # + revertirRecoleccionAction
      inventario.ts             # nuevo: ajustarInventarioSueltosAction
  components/domain/
    mortalidad/revertir-mortalidad-boton.tsx  # usa VENTANA_GRACIA_MIN
    recoleccion/
      revertir-recoleccion-boton.tsx           # nuevo
      recolecciones-tabla.tsx                  # modificado
    inventario/
      ajustar-inventario-sueltos-dialog.tsx    # nuevo
  app/(app)/recoleccion/page.tsx               # modificado
tests/
  unit/services/recoleccion.test.ts    # + puedeRevertirRecoleccion
  unit/services/inventario.test.ts     # reconstruirSaldo actualizado
  unit/services/mortalidad.test.ts     # si referenciaba la constante vieja
  integration/actions/recoleccion.test.ts  # + revertirRecoleccionAction
  integration/actions/inventario.test.ts   # nuevo: ajustarInventarioSueltosAction
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/recoleccion.ts` y
  `server/services/inventario.ts` (ya al 100% desde Sprint 5, no debería
  bajar).
- `npx prisma validate` en verde, migración `revertidoEn` aplicada contra
  Neon real.
- `npm run build` en verde.
- Guard "todo o nada" verificado con un test de carrera real (H5), no
  solo con mocks.
- Guard de saldo suficiente de la reversión y del ajuste verificados con
  el mismo criterio (`UPDATE condicional`, no un `decrement` a ciegas).
- Reversión completa verificada en vivo contra Neon real: con sueltos,
  múltiplo exacto de 180 (sin ruido en el ledger), solo sueltos (sin
  paquetes), guard de elegibilidad bloqueando (paquete simulado como
  vendido), doble reversión concurrente (exactamente una tiene éxito).
- Ajuste manual verificado en vivo: positivo, negativo, saldo
  insuficiente rechazado, motivo corto rechazado por Zod, OPERARIO
  rechazado por `withAuth`, idempotencia real con `P2002`.
- `AuditLog` con filas reales `REVERTIR`/`RegistroRecoleccion` y
  `AJUSTAR`/`MovimientoSueltos` verificadas contra Neon.
- Verificación clic a clic en navegador real: botón "Deshacer" con
  countdown, fila atenuada tras revertir, diálogo de ajuste visible solo
  para GERENTE.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre
  de Sprint 6, deuda de "ajuste manual para Mortalidad" documentada
  explícitamente como pendiente para un sprint futuro).
