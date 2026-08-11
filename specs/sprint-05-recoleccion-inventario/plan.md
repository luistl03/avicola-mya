# Plan técnico — Sprint 5

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `RegistroRecoleccion`, `Paquete`, `PaqueteOrigen`,
  `InventarioSueltos`, `MovimientoSueltos`, `BandejaSuelta`,
  `BandejaOrigen`, `enum TipoPaquete`, `enum EstadoPaquete`, `enum
  TipoMovimientoSueltos` ya existen desde Sprint 0. Sin migración
  pendiente para este sprint.
- `server/repositories/lote.ts` ya expone `buscarUbicacionActual(loteId)`
  y `listarLotesActivos()` (Sprint 3-4) — se reusan tal cual.
- `server/repositories/mortalidad.ts` (`registrarMortalidadYDescontarAves`,
  Sprint 4) es la referencia de transacción interactiva
  (`prisma.$transaction(async (tx) => {...})`), pero este sprint agrega
  una pieza que Mortalidad no necesitó: idempotencia por id de cliente
  (ver sección siguiente).
- `server/auth/with-auth.ts` (`withAuth`, Sprint 2) sin cambios — se usa
  igual que en Mortalidad/Bitácora.
- `lib/zod/comun.ts` (`idUuid()`, Sprint 3) se usa para `loteId` y para
  el `id` nuevo de `RegistroRecoleccion` (generado en cliente).
- UI: `<PageHeader>`, `<TableScrollArea>`, `<DataTablePagination>`,
  `toastManager`, `<Dialog>` compacto (`INPUT_COMPACTO`/`LABEL_COMPACTO`,
  `size="md"`) — sin cambios de patrón, se reusan como en Mortalidad.

## Nueva pieza de arquitectura: idempotencia por id generado en cliente (primera vez en el proyecto)

### Por qué `prisma.upsert()` no alcanza
`upsert()` de Prisma solo sabe crear-o-actualizar **un** modelo. Este
registro necesita crear un padre (`RegistroRecoleccion`) junto con N
hijos (`Paquete` + `PaqueteOrigen` por cada uno) y, condicionalmente,
tocar dos tablas más (`InventarioSueltos`, `MovimientoSueltos`) — todo
o nada. Un `upsert()` del padre no puede expresar "y si el padre no
existía, además crea todo lo demás; si ya existía, no toques nada más".

### El patrón real: `create` + capturar `P2002` = idempotencia
```ts
// server/repositories/recoleccion.ts
export async function registrarRecoleccion(input: {
  id: string; // generado en el cliente, crypto.randomUUID()
  loteId: string;
  galponId: string;
  usuarioId: string;
  cantidadTotal: number;
  creadoEnCliente: Date;
  pesos: number[]; // longitud == calcularEmpaque(cantidadTotal).paquetes
  ahora: Date;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const registro = await tx.registroRecoleccion.create({
        data: {
          id: input.id,
          loteId: input.loteId,
          galponId: input.galponId,
          usuarioId: input.usuarioId,
          cantidadTotal: input.cantidadTotal,
          creadoEnCliente: input.creadoEnCliente,
          creadoEn: input.ahora,
        },
      });

      const { paquetes: numPaquetes, sueltos } = calcularEmpaque(
        input.cantidadTotal,
      );

      for (const peso of input.pesos) {
        const paquete = await tx.paquete.create({
          data: {
            peso,
            tipo: "PURO",
            registroRecoleccionId: registro.id,
          },
        });
        await tx.paqueteOrigen.create({
          data: { paqueteId: paquete.id, galponId: input.galponId, cantidad: 180 },
        });
      }

      if (sueltos > 0) {
        await tx.inventarioSueltos.upsert({
          where: { galponId_loteId: { galponId: input.galponId, loteId: input.loteId } },
          create: { galponId: input.galponId, loteId: input.loteId, cantidad: sueltos },
          update: { cantidad: { increment: sueltos } },
        });
        await tx.movimientoSueltos.create({
          data: {
            galponId: input.galponId,
            loteId: input.loteId,
            tipo: "RECOLECCION",
            cantidad: sueltos,
            referenciaId: registro.id,
            usuarioId: input.usuarioId,
            creadoEn: input.ahora,
          },
        });
      }

      return { registro, paquetesCreados: numPaquetes, sueltos };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Reintento idempotente: el id ya existe. Se devuelve el registro
      // ya persistido, sin volver a tocar el ledger.
      const existente = await prisma.registroRecoleccion.findUniqueOrThrow({
        where: { id: input.id },
        include: { paquetes: true },
      });
      return { registro: existente, paquetesCreados: existente.paquetes.length, sueltos: null };
    }
    throw error;
  }
}
```
(Pseudocódigo de diseño — ajustar nombres exactos de campos/tipos al
implementar; `numPaquetes` arriba se recalcula server-side, nunca se
confía en `input.pesos.length` sin validarlo antes contra
`calcularEmpaque` en la Server Action, ver más abajo.)

### El caso "mismo id, datos distintos"
No se contempla como reintento legítimo. Si `findUniqueOrThrow` en la
rama de `P2002` encuentra un registro con `cantidadTotal` distinto al
del payload actual, la action responde con un error explícito ("Ya
existe un registro con este id pero con datos diferentes") en vez de
devolver silenciosamente el existente — evita que un bug de
generación de id en el cliente (colisión, o un id reusado por error)
pase desapercibido como si fuera un reintento normal.

## Diseño de servicios puros

### `server/services/recoleccion.ts`
```ts
const UNIDADES_POR_PAQUETE = 180;

export function calcularEmpaque(cantidadTotal: number) {
  if (!Number.isInteger(cantidadTotal) || cantidadTotal <= 0) {
    throw new Error("cantidadTotal debe ser un entero positivo");
  }
  const paquetes = Math.floor(cantidadTotal / UNIDADES_POR_PAQUETE);
  const sueltos = cantidadTotal % UNIDADES_POR_PAQUETE;
  return { paquetes, sueltos };
}

export function puedeRegistrarRecoleccion(lote: { estado: EstadoLote }) {
  return lote.estado === "ACTIVO";
}
```
Ambas funciones puras, sin Prisma — tests exhaustivos: `cantidadTotal`
< 180, múltiplo exacto de 180, caso general con resto, y los bordes
inválidos (0, negativo, no entero) lanzando el error esperado.

### `server/services/inventario.ts`
```ts
const ENTRADAS: TipoMovimientoSueltos[] = ["RECOLECCION", "ROTURA_PAQUETE_ENTRADA", "AJUSTE_GERENTE"];
const SALIDAS: TipoMovimientoSueltos[] = ["CONSOLIDACION_SALIDA", "VENTA_SUELTO"];
// REVERSION se trata aparte: revierte el signo del movimiento original
// que referencia (Sprint 6 la va a necesitar completa; este sprint solo
// deja la función preparada, sin movimientos REVERSION reales que probar).

export function reconstruirSaldo(movimientos: { tipo: TipoMovimientoSueltos; cantidad: number }[]) {
  return movimientos.reduce((saldo, m) => {
    if (ENTRADAS.includes(m.tipo)) return saldo + m.cantidad;
    if (SALIDAS.includes(m.tipo)) return saldo - m.cantidad;
    return saldo; // REVERSION: sin caso de prueba real en este sprint
  }, 0);
}
```
Pura, sin Prisma — el repository (`server/repositories/inventario.ts`,
nuevo, mínimo) solo trae la lista de `MovimientoSueltos` de un
galpón+lote y se la pasa a esta función; no repite la lógica de
sumar/restar.

## Diseño de repositories

### `server/repositories/lote.ts` (sin cambios funcionales)
Se reusan `buscarUbicacionActual(loteId)`, `listarLotesActivos()`,
`buscarLotePorId(id)`.

### `server/repositories/recoleccion.ts` (nuevo)
- `registrarRecoleccion(input)` — la transacción de arriba.
- `listarRecolecciones({ skip, take })` +
  `contarRecolecciones()` — mismo patrón de paginación server-side por
  URL que Mortalidad (`<DataTablePagination>`, 10 filas), no cursor (es
  una tabla de gestión, no un muro cronológico — ver
  `memory/convenciones.md`).

### `server/repositories/inventario.ts` (nuevo, mínimo)
- `listarMovimientosSueltos({ galponId, loteId })` — trae el historial
  completo para alimentar `reconstruirSaldo()` en un test/script de
  auditoría. Sin pantalla en este sprint.

## Diseño de Zod schemas

### `lib/zod/recoleccion.ts`
```ts
export const crearRecoleccionSchema = z.object({
  id: idUuid(),
  loteId: idUuid(),
  cantidadTotal: z.coerce.number().int().positive(),
  creadoEnCliente: z.coerce.date(),
  pesos: z.array(z.coerce.number().positive()).max(1000),
});
```
`pesos` es un arreglo simple de números (uno por paquete, en el mismo
orden en que se mostraron en la UI) — la Server Action valida que
`pesos.length === calcularEmpaque(cantidadTotal).paquetes` **antes** de
llamar al repository; si no coincide, rechaza con un mensaje explícito
("El número de pesos no coincide con los paquetes esperados") sin
tocar la base. El `.max(1000)` es una cota defensiva de tamaño de
payload, no una regla de negocio.

## Diseño de Server Actions

### `server/actions/recoleccion.ts`
```ts
export const registrarRecoleccion = withAuth(
  { schema: crearRecoleccionSchema, entidad: "RegistroRecoleccion" },
  async ({ input, usuarioId }) => {
    const lote = await buscarLotePorId(input.loteId);
    if (!lote || !puedeRegistrarRecoleccion(lote)) {
      return { error: "Solo se puede registrar recolección de un lote activo." };
    }

    const { paquetes } = calcularEmpaque(input.cantidadTotal);
    if (input.pesos.length !== paquetes) {
      return { error: "El número de pesos no coincide con los paquetes esperados." };
    }

    const ubicacion = await buscarUbicacionActual(input.loteId);
    if (!ubicacion) {
      return { error: "El lote no tiene una ubicación activa." };
    }

    const resultado = await registrarRecoleccion({
      id: input.id,
      loteId: input.loteId,
      galponId: ubicacion.galponId,
      usuarioId,
      cantidadTotal: input.cantidadTotal,
      creadoEnCliente: input.creadoEnCliente,
      pesos: input.pesos,
      ahora: new Date(),
    });

    return { data: resultado };
  },
);
```
`withAuth` sin `rol` (abierta a ambos, decisión confirmada en
`spec.md`) — auditoría automática vía `AuditLog` (`entidad:
"RegistroRecoleccion"`, `entidadId: resultado.registro.id`).

## Diseño de UI

### `app/(app)/recoleccion/page.tsx`
Server Component: fetch inicial de `listarRecolecciones` +
`contarRecolecciones` (paginación por `?page=N`, igual que Mortalidad),
`<PageHeader title="Recolección" actions={<RegistrarRecoleccionDialog ... />} />`.

### `RegistrarRecoleccionDialog` (Client Component)
- `<Dialog>` compacto, `<Select>` de lote (poblado con
  `listarLotesActivos()`, etiqueta = código de lote, mismo patrón que
  Mortalidad — controlado con `useState`, `<SelectValue>` con
  `children` explícito para no repetir el Bug 2 de Sprint 3).
- Input numérico `cantidadTotal`.
- **Helper local de cliente** (no importa `server/services/recoleccion.ts`
  — ver decisión de diseño en `spec.md`):
  ```ts
  // Debe coincidir exactamente con calcularEmpaque() de
  // server/services/recoleccion.ts — aritmética trivial, duplicada a
  // propósito para no cruzar el límite de RSC desde un "use client".
  function calcularEmpaquePreview(total: number) {
    if (!Number.isInteger(total) || total <= 0) return { paquetes: 0, sueltos: 0 };
    return { paquetes: Math.floor(total / 180), sueltos: total % 180 };
  }
  ```
- `useMemo`/derivado directo en cada render a partir de `cantidadTotal`:
  arreglo de N campos de peso (`useState<string[]>`, redimensionado
  cuando cambia `paquetes` — al reducirse, se recortan los valores
  sobrantes, no se conservan "por si vuelven a aparecer").
- Texto informativo no editable: "`{sueltos}` unidades sueltas" cuando
  `sueltos > 0`.
- Botón "Guardar" (`disabled`) mientras `cantidadTotal <= 0` o algún
  campo de peso esté vacío/`<= 0`.
- Al enviar: genera `id: crypto.randomUUID()` y `creadoEnCliente: new
  Date()` en el cliente, arma el payload y llama a
  `registrarRecoleccion` vía `useActionState` (mismo patrón que los
  formularios de Sprint 2-4). El formulario vive en un subcomponente
  que solo se monta con `open === true` (evita el bug de estado
  arrastrado de Sprint 3, mismo fix ya aplicado en los cuatro dialogs
  existentes).

### `app/(app)/recoleccion/recolecciones-tabla.tsx`
Columnas: fecha, lote, galpón, cantidadTotal, paquetes generados,
sueltos, usuario. `<TableScrollArea>` si la tabla no entra en el ancho
disponible.

## `NAV_ITEMS`
Se agrega "Recolección" (`components/layout/nav-items.ts`) apuntando a
`/recoleccion`, sin entrada nueva en `RUTAS_POR_ROL` (abierta a ambos
roles).

## Orden de ejecución (hay dependencias entre tareas)
1. `server/services/recoleccion.ts` (`calcularEmpaque`,
   `puedeRegistrarRecoleccion`) + tests unitarios — no depende de nada
   nuevo, se puede escribir primero.
2. `server/services/inventario.ts` (`reconstruirSaldo`) + tests
   unitarios — igual de independiente.
3. `lib/zod/recoleccion.ts`.
4. `server/repositories/recoleccion.ts` (transacción + idempotencia) —
   depende de 1.
5. `server/repositories/inventario.ts` (lectura simple para
   `reconstruirSaldo`) — depende de 2.
6. `server/actions/recoleccion.ts` — depende de 1, 3, 4.
7. Pantalla `/recoleccion` (page + tabla + dialog reactivo) — depende
   de 6.
8. `NAV_ITEMS`.
9. Tests de integración de la action (repositories mockeados, incluido
   el caso de reintento con mismo id) — depende de 6.
10. Verificación en vivo contra Neon real (transacción completa,
    idempotencia real con el mismo id reenviado, caso `sueltos === 0`
    sin ruido en el ledger) — depende de todo lo anterior.
11. Verificación clic a clic en navegador (UI reactiva de pesos,
    guardado, listado) — depende de todo lo anterior.
12. `npx vitest run --coverage` — confirmar ≥90% en
    `services/recoleccion.ts` e `services/inventario.ts`.

## Comandos de referencia
```bash
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npm run build
```

## Estructura de archivos esperada
```
src/
  server/
    services/
      recoleccion.ts       # calcularEmpaque, puedeRegistrarRecoleccion
      inventario.ts        # reconstruirSaldo
    repositories/
      recoleccion.ts       # registrarRecoleccion (transacción + idempotencia), listarRecolecciones, contarRecolecciones
      inventario.ts        # listarMovimientosSueltos
    actions/
      recoleccion.ts       # registrarRecoleccion (withAuth)
    lib/
      zod/
        recoleccion.ts     # crearRecoleccionSchema
  app/(app)/recoleccion/
    page.tsx
    recolecciones-tabla.tsx
  components/domain/recoleccion/
    registrar-recoleccion-dialog.tsx
tests/
  unit/services/recoleccion.test.ts
  unit/services/inventario.test.ts
  integration/actions/recoleccion.test.ts
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/recoleccion.ts` y
  `server/services/inventario.ts`.
- `npx prisma validate` en verde (sin migración nueva esperada).
- `npm run build` en verde (sin fugas de import de servidor al cliente).
- Transacción completa verificada en vivo contra Neon real: caso con
  sueltos, caso múltiplo exacto de 180 (sin ruido en el ledger), caso
  menor a 180 (sin paquetes), lote INACTIVO rechazado, y el caso de
  idempotencia (mismo id reenviado dos veces, sin duplicar nada).
- Verificación clic a clic en navegador real: campos de peso
  desplegándose/recortándose reactivamente, botón "Guardar"
  deshabilitado hasta completar todos los pesos, listado paginado
  actualizado tras guardar.
- `AuditLog` con una fila real `CREAR`/`RegistroRecoleccion` verificada
  contra Neon.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de
  cierre de Sprint 5, deuda pendiente si la hay).
