# Plan técnico — Sprint 10

**Nota de alcance (léase antes que el resto):** este documento describe el
diseño FINAL, ya corregido — ver "Corrección de diseño real, en plena
ejecución" en `spec.md` para el porqué. La versión original de este plan
también extendía `cerrarVenta()`/`cerrarVentaSchema` para vender sueltos y
ubicaba Romper Paquete/Bandeja dentro de `/pos`; esa parte se implementó,
se revirtió por completo, y no aparece acá — `lib/zod/venta.ts`,
`server/repositories/venta.ts`, `server/actions/venta.ts` y todo `/pos`
quedan sin ningún cambio este sprint. El detalle de qué se revirtió y por
qué queda documentado en `tasks.md` (no se reescribe la historia real).

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `model RoturaPaquete` (`id`, `paqueteId String
  @unique`, `pesoExtraido Decimal(6,3)`, `unidadesExtraidas Int`,
  `unidadesDevueltas Int`, `creadoEn`) — completo desde Sprint 0, sin código
  encima. `model Paquete` tiene `rotura RoturaPaquete?` y `enum
  EstadoPaquete` ya incluye `ROTO` desde Sprint 0. `model BandejaSuelta`
  **no** tenía ningún campo de rotura, y `enum EstadoBandeja` solo tenía
  `DISPONIBLE`/`VENDIDO` — sin equivalente, hizo falta agregarlo.
- `model PaqueteOrigen`/`model BandejaOrigen`: `galponId String`, `loteId
  String?` (nullable desde Sprint 7, sin backfill), `cantidad Int`.
  Inmutables una vez creados.
- `model InventarioSueltos`: `@@unique([galponId, loteId])`, clave
  compuesta real `galponId_loteId` (confirmado leyendo
  `server/repositories/inventario.ts`/`recoleccion.ts`/`consolidacion.ts`).
- `enum TipoMovimientoSueltos`: `RECOLECCION`, `CONSOLIDACION_SALIDA`,
  `ROTURA_PAQUETE_ENTRADA`, `VENTA_SUELTO`, `REVERSION`, `AJUSTE_GERENTE`
  desde Sprint 0. Gana `ROTURA_BANDEJA_ENTRADA` este sprint.
  `VENTA_SUELTO` queda sin usar de forma **permanente** (decisión de
  negocio 1, spec.md — la granja no vende huevo por unidad), no solo
  "hasta que otro sprint lo resuelva".
- `model DetalleVenta`: `tipo TipoDetalleVenta` (`PAQUETE`/`BANDEJA`/
  `SUELTO`), `galponId?`/`loteId?`/`cantidadUnidades?` — el valor `SUELTO`
  queda sin ningún consumidor real de forma permanente, mismo motivo.
- `src/server/repositories/venta.ts`/`src/server/actions/venta.ts`/
  `src/lib/zod/venta.ts`: confirmados de vuelta al estado EXACTO en que
  Sprint 9 los dejó — `cerrarVenta()` ancla `Venta`+`DetalleVenta`, guard
  `updateMany` sobre `Paquete`/`BandejaSuelta` (`WHERE id: {in}, estado:
  DISPONIBLE`), sin ningún tercer guard de sueltos. `listarPaquetesDisponibles()`/
  `listarBandejasDisponibles()` siguen ahí — Sprint 10 las reusa tal cual
  desde `/consolidacion`, además de `/pos`.
- `src/app/(app)/consolidacion/page.tsx` (Sprint 7): `PageHeader` con dos
  `ConsolidarSueltosDialog` (Armar Bandeja/Armar Paquete Mixto) en
  `actions`, `SaldosTabla` debajo. Sin guard de rol.
- `src/server/repositories/consolidacion.ts` (`consolidarSueltos`) es la
  referencia directa del patrón "agregar por clave antes de tocar la
  base" — reusado dentro de `repartirDevolucion()`.

## Migración de schema (primera tarea, todo lo demás depende de esto)

```prisma
enum EstadoBandeja {
  DISPONIBLE
  VENDIDO
  ROTO // mismo criterio que EstadoPaquete.ROTO (Sprint 0)
}

model BandejaSuelta {
  // ...campos existentes sin cambios...
  rotura RoturaBandeja? // relación inversa
}

model RoturaBandeja {
  id                String   @id @default(uuid())
  bandejaId         String   @unique
  pesoExtraido      Decimal  @db.Decimal(6, 3)
  unidadesExtraidas Int
  unidadesDevueltas Int
  creadoEn          DateTime @default(now())

  bandeja BandejaSuelta @relation(fields: [bandejaId], references: [id], onDelete: Cascade)
}

enum TipoMovimientoSueltos {
  RECOLECCION
  CONSOLIDACION_SALIDA
  ROTURA_PAQUETE_ENTRADA
  ROTURA_BANDEJA_ENTRADA // distingue en el ledger Paquete vs. Bandeja
  VENTA_SUELTO
  REVERSION
  AJUSTE_GERENTE
}
```

`npx prisma migrate dev --name rotura_bandeja_y_venta_sueltos` — el nombre
de la migración quedó con "venta_sueltos" por el brief original, pero el
contenido real (`RoturaBandeja` + `EstadoBandeja.ROTO` +
`ROTURA_BANDEJA_ENTRADA`) sigue siendo exactamente lo que hace falta; no
se renombra una migración ya aplicada contra Neon real. Aplicada y
verificada en S10-1 — `ALTER TYPE` en dos pasos antes del `CREATE TABLE`,
sin sentencias destructivas.

## Diseño de `server/services/rotura.ts` — `repartirDevolucion()` (función pura)
Sin cambios respecto al diseño original — ver el archivo real,
`src/server/services/rotura.ts`. Más simple que `calcularConsolidacion()`
porque este sprint siempre rompe la unidad COMPLETA (decisión de negocio
7): `totalExtraido` siempre coincide con la suma de los orígenes, no hay
redondeo. El único matiz real es excluir orígenes con `loteId` null
(`unidadesSinLote`) y agregar por clave si dos filas de origen comparten
galpón/lote.

```ts
export type OrigenUnidad = { galponId: string; loteId: string | null; cantidad: number };
export type PorcionDevolucion = { galponId: string; loteId: string; cantidad: number };
export type ResultadoDevolucion = {
  porciones: PorcionDevolucion[];
  unidadesSinLote: number;
  unidadesDevueltas: number;
};
export class InconsistenciaOrigenesError extends Error {}

export function repartirDevolucion(origenes: OrigenUnidad[], totalExtraido: number): ResultadoDevolucion {
  // 1) valida invariante: sum(origenes.cantidad) === totalExtraido
  // 2) agrega por clave galponId:loteId (Map), separando los que tienen
  //    loteId null hacia unidadesSinLote
  // 3) unidadesDevueltas = totalExtraido - unidadesSinLote
}
```

Tests (cobertura 100%): origen único con `loteId` (`PURO`, trivial);
múltiples orígenes con `loteId` (`MIXTO`, suma exacta); mismo algoritmo con
`totalExtraido: 30` (Bandeja); dos filas de origen con la MISMA clave
(agregación); un origen sin `loteId` entre varios; todos sin `loteId`;
lista vacía con `totalExtraido: 0`; invariante violada lanza
`InconsistenciaOrigenesError`.

## Diseño de `server/repositories/rotura.ts` (sin cambios respecto al diseño original)
`romperPaquete()`/`romperBandeja()` — octava y novena transacción
interactiva del proyecto. Orden: ANCLA primero (`RoturaPaquete`/
`RoturaBandeja.create` — `paqueteId`/`bandejaId` `@unique` sirve de ancla
de idempotencia Y de guard anti-doble-rotura a la vez, sin id de cliente
separado), guard después (`updateMany` sobre `Paquete`/`BandejaSuelta`
`WHERE estado: DISPONIBLE`). Mismo motivo que `cerrarVenta` (Sprint 9):
`EstadoPaquete`/`EstadoBandeja` `DISPONIBLE→ROTO` es de una sola dirección
este sprint — si el guard corriera antes del `create`, un reintento
idempotente legítimo encontraría la unidad YA ROTA y fallaría por error.
Ver el archivo real, `src/server/repositories/rotura.ts`, para el código
completo (`PaqueteNoDisponibleError`/`BandejaNoDisponibleError`, el
`upsert`+`create` de `InventarioSueltos`/`MovimientoSueltos` por porción,
secuencial dentro de la transacción, y las lecturas de apoyo
`buscarPaqueteOrigenesPorPaqueteId`/`buscarPaquetePorId`/
`buscarRoturaPaquetePorPaqueteId` y sus equivalentes de Bandeja).

## Diseño de idempotencia y carrera real (H3)
Un `P2002` sobre `paqueteId`/`bandejaId` puede significar (1) reintento
idempotente propio (mismo peso) o (2) carrera real / reintento con un peso
distinto. `server/actions/rotura.ts` distingue ambos comparando
`pesoExtraido` contra la fila existente — mismo peso: éxito idempotente
sin duplicar; peso distinto: `AccionError` explícito que menciona la
posibilidad de carrera, no un mensaje genérico de "ya existe".

## Diseño de Zod schemas — `lib/zod/rotura.ts` (sin cambios)
```ts
export const romperPaqueteSchema = z.object({
  paqueteId: idUuid(),
  pesoExtraido: z.coerce.number().positive().max(999.999),
});
export const romperBandejaSchema = z.object({
  bandejaId: idUuid(),
  pesoExtraido: z.coerce.number().positive().max(999.999),
});
```
Sin id de cliente — `paqueteId`/`bandejaId` ya son la unicidad de negocio.

## Diseño de Server Actions — `server/actions/rotura.ts` (sin cambios)
`romperPaqueteAction`/`romperBandejaAction`: chequeo previo de
existencia/estado (mensaje de UX razonable antes de tocar la
transacción), `catch` que distingue `PaqueteNoDisponibleError`/
`BandejaNoDisponibleError` (guard real fallido) de `P2002` (idempotencia/
carrera, ver arriba). Sin `rol` — abiertas a GERENTE y OPERARIO.

## Diseño de UI — todo en `/consolidacion`, nada en `/pos`

### `components/domain/consolidacion/romper-paquete-dialog.tsx` / `romper-bandeja-dialog.tsx` (nuevos)
Mismo `<Dialog>` compacto que el resto del proyecto, `<form
action={formAction}>` con `FormData` (mismo patrón que
`AjustarInventarioSueltosDialog`, Sprint 6 — sin campos de longitud
variable, no hace falta el bypass de `startTransition`). Captura de
`pesoExtraido` (D1), toast con el resultado (incluido el aviso de
`unidadesSinLote > 0` cuando aplica), `router.refresh()` al tener éxito
(trae de nuevo el listado de `DISPONIBLE` y los saldos de sueltos
actualizados). Viven en `components/domain/consolidacion/`, no en
`components/domain/pos/` — invocan `romperPaqueteAction`/
`romperBandejaAction` (`server/actions/rotura.ts`), sin relación con
`/pos`.

### `components/domain/consolidacion/romper-inventario-section.tsx` (nuevo)
Dos listados (Paquetes/Bandejas `DISPONIBLE`), mismo patrón de recorte +
búsqueda por peso que `PosSelectorItems` (Sprint 9: preview de los últimos
`N` creados + búsqueda en memoria si hay más), pero sin botón "Agregar"
(no hay carrito en esta pantalla) — cada fila solo tiene "Romper".

### `app/(app)/consolidacion/page.tsx` (modifica)
Agrega `listarPaquetesDisponibles()`/`listarBandejasDisponibles()`
(`server/repositories/venta.ts`, Sprint 9, sin cambios) al `Promise.all`
del fetch inicial, junto a `listarInventarioSueltosConSaldo()` ya
existente. Convierte `Decimal` a `number` antes de pasarlo a
`RomperInventarioSection` (mismo criterio que `/pos/page.tsx`, Sprint 9).
Sección nueva debajo de `SaldosTabla`, con un `<h2>Listado de
inventario</h2>` sin descripción adicional — el botón "Romper" de cada
fila ya explica su propio propósito en el `<Dialog>` que abre, no hace
falta repetirlo en la sección. Sin cambios de rol.

### `app/(app)/pos/page.tsx`, `PosWorkspace`, `PosSelectorItems`, `PosCarrito`, `ComprobanteDialog`, `lib/pdf/comprobante.ts`
**Sin ningún cambio este sprint** — confirmados de vuelta al estado exacto
de Sprint 9 tras revertir el intento de venta de sueltos (ver `tasks.md`
para el detalle de qué se revirtió).

## Orden de ejecución (hay dependencias entre tareas)
1. Migración de schema — nada más puede escribirse contra estos campos
   hasta que existan.
2. `server/services/rotura.ts` (`repartirDevolucion`) + tests —
   independiente de 1.
3. `server/services/inventario.ts` (`reconstruirSaldo` clasifica
   `ROTURA_BANDEJA_ENTRADA`) + test — depende de 1.
4. `lib/zod/rotura.ts` + tests — independiente.
5. `server/repositories/rotura.ts` (`romperPaquete`, `romperBandeja`) —
   depende de 1, 2.
6. `server/actions/rotura.ts` (`romperPaqueteAction`, `romperBandejaAction`)
   — depende de 4, 5.
7. UI: `RomperPaqueteDialog`, `RomperBandejaDialog`
   (`components/domain/consolidacion/`) — depende de 6.
8. UI: `RomperInventarioSection` — depende de 7.
9. `app/(app)/consolidacion/page.tsx` (+ `listarPaquetesDisponibles()`/
   `listarBandejasDisponibles()`) — depende de 8.
10. Tests de integración de las dos Server Actions (repositories
    mockeados) — depende de 6.
11. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/rotura.ts`.
12. Verificación en vivo contra Neon real: rotura de Paquete `PURO`/
    `MIXTO`, rotura con origen sin `loteId`, rotura de Bandeja, **carrera
    concurrente real forzada de romper el mismo Paquete/Bandeja** (H3),
    idempotencia real.
13. Verificación clic a clic en navegador: romper Paquete/Bandeja desde
    `/consolidacion`, confirmar que el saldo se refleja sin recargar
    manualmente, y armar una unidad nueva con los wizards existentes
    usando el saldo recién liberado — todo sin salir de la pantalla.
    Confirmar además que `/pos` sigue funcionando exactamente igual que
    al cerrar Sprint 9 (sin ítems SUELTO, sin cambios visuales).

## Comandos de referencia
```bash
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npx prisma migrate dev --name rotura_bandeja_y_venta_sueltos
npm run build
```

## Estructura de archivos esperada
```
prisma/
  migrations/20260814161310_rotura_bandeja_y_venta_sueltos/migration.sql
src/
  lib/
    zod/
      rotura.ts              # nuevo: romperPaqueteSchema, romperBandejaSchema
  server/
    services/
      rotura.ts              # nuevo: repartirDevolucion
      inventario.ts          # modifica: + ROTURA_BANDEJA_ENTRADA en CLASIFICACION
    repositories/
      rotura.ts              # nuevo: romperPaquete, romperBandeja, lecturas de apoyo
    actions/
      rotura.ts              # nuevo: romperPaqueteAction, romperBandejaAction
  components/domain/
    consolidacion/
      romper-paquete-dialog.tsx     # nuevo
      romper-bandeja-dialog.tsx     # nuevo
      romper-inventario-section.tsx # nuevo
  app/(app)/
    consolidacion/page.tsx    # modifica: + listado de Paquetes/Bandejas + "Romper"
tests/
  unit/services/rotura.test.ts               # nuevo
  unit/services/inventario.test.ts            # modifica: + ROTURA_BANDEJA_ENTRADA
  unit/lib/zod-rotura.test.ts                 # nuevo
  integration/actions/rotura.test.ts          # nuevo

# SIN CAMBIOS este sprint (revertidos tras la corrección de diseño):
#   lib/zod/venta.ts, server/repositories/venta.ts, server/actions/venta.ts,
#   lib/pdf/comprobante.ts, components/domain/pos/**
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/rotura.ts`.
- `npx prisma validate` en verde, migración aplicada contra Neon real.
- `npm run build` en verde.
- Guard anti-doble-rotura verificado bajo carrera real forzada contra
  Neon, para Paquete Y Bandeja (H3/H4).
- `repartirDevolucion()` verificado con el caso real de un origen sin
  `loteId` (remanente correcto, sin acreditar en silencio).
- Idempotencia real confirmada contra Neon para ambas roturas.
- `AuditLog` con filas reales `ROMPER` sobre `RoturaPaquete`/
  `RoturaBandeja`, verificadas contra Neon.
- `reconstruirSaldo()` releído contra el historial real de
  `MovimientoSueltos` reproduce exactamente `InventarioSueltos.cantidad`.
- Verificación clic a clic en navegador real: romper Paquete/Bandeja
  desde `/consolidacion`, armar una unidad nueva con el saldo liberado sin
  salir de la pantalla, y confirmar que `/pos` no cambió.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre de
  Sprint 10, incluida la corrección de diseño real en plena ejecución).
