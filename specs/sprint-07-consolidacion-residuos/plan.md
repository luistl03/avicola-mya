# Plan técnico — Sprint 7

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `Paquete.tipo` (enum `TipoPaquete`:
  `PURO`/`MIXTO`) existe desde Sprint 0, `MIXTO` sin usar. `PaqueteOrigen`/
  `BandejaOrigen` solo tienen `galponId`+`cantidad`, sin `loteId` (ver
  "Hallazgo real" en `spec.md`). `BandejaSuelta`/`BandejaOrigen` existen
  desde Sprint 0, sin ninguna fila creada por código real todavía.
  `TipoMovimientoSueltos.CONSOLIDACION_SALIDA` existe y ya está clasificado
  como salida en `reconstruirSaldo()` (Sprint 6), sin generarse todavía.
  `InventarioSueltos.cantidad` tiene `CHECK (cantidad >= 0)` a nivel de base
  (S0-5).
- `server/repositories/recoleccion.ts` (`registrarRecoleccion`,
  `revertirRecoleccion`) es la referencia real de transacción interactiva
  con `create` de un padre + N hijos en cascada, y de guard "todo o nada"
  sobre un conjunto de filas vía `updateMany` + comparación de conteo — este
  sprint extiende ambos patrones.
- `server/repositories/inventario.ts` (`ajustarInventarioSueltos`) es la
  referencia de guard `UPDATE` condicional sobre `InventarioSueltos` (`WHERE
  cantidad >= X`) + `create` de `MovimientoSueltos` con `id` explícito al
  final de la transacción.
- `components/domain/recoleccion/registrar-recoleccion-dialog.tsx` es la
  referencia de UI: arreglo de longitud variable (`pesos`) que exige
  `formAction(payload)` llamado a mano dentro de `startTransition()` en vez
  de `<form action={formAction}>`, más un cálculo puro **duplicado** en el
  cliente (`calcularEmpaquePreview`, documentado como duplicación
  intencional porque un Client Component nunca importa `server/services/*`
  directo) para la vista previa reactiva.
- `server/actions/recoleccion.ts` (`registrarRecoleccion`) es la referencia
  de "nunca confiar en el cálculo del cliente": recalcula
  `calcularEmpaque(cantidadTotal)` server-side y rechaza si `pesos.length`
  no coincide — este sprint hace lo mismo con `calcularConsolidacion()`.
- `lib/zod/comun.ts` (`idUuid()`) — se usa para todo id nuevo.
- `server/auth/with-auth.ts` (`withAuth`, `AccionError`) — sin cambios.
- `server/repositories/lote.ts`/`galpon.ts` — sin cambios funcionales;
  `Lote` gana dos relaciones inversas nuevas (`paqueteOrigenes`,
  `bandejaOrigenes`), sin nuevas funciones de repository.

## Migración de schema (primera tarea, todo lo demás depende de esto)

```prisma
// Módulo 4 — Recolección e Inventario (ampliado en Sprint 7)

model PaqueteOrigen {
  id        String  @id @default(uuid())
  paqueteId String
  galponId  String
  loteId    String? // NUEVO Sprint 7 — nullable: filas creadas antes de
                     // este sprint no tienen forma confiable de backfillearse
                     // (ver R5 en spec.md). Todo código nuevo (este sprint,
                     // y registrarRecoleccion desde ahora) lo completa
                     // siempre.
  cantidad  Int

  paquete Paquete @relation(fields: [paqueteId], references: [id], onDelete: Cascade)
  galpon  Galpon  @relation(fields: [galponId], references: [id], onDelete: Restrict)
  lote    Lote?   @relation(fields: [loteId], references: [id], onDelete: Restrict)

  @@index([paqueteId])
}

model BandejaOrigen {
  id        String  @id @default(uuid())
  bandejaId String
  galponId  String
  loteId    String? // NUEVO Sprint 7 — mismo criterio que PaqueteOrigen.loteId.
  cantidad  Int

  bandeja BandejaSuelta @relation(fields: [bandejaId], references: [id], onDelete: Cascade)
  galpon  Galpon        @relation(fields: [galponId], references: [id], onDelete: Restrict)
  lote    Lote?         @relation(fields: [loteId], references: [id], onDelete: Restrict)

  @@index([bandejaId])
}

// NUEVO Sprint 7 — ancla de idempotencia + auditoría de una corrida del
// wizard que crea N Paquete o N BandejaSuelta a la vez (ver "Hallazgo real"
// en spec.md, motivo completo de por qué hace falta este modelo en vez de
// reusar cualquiera de los hijos como ancla).
enum TipoConsolidacion {
  PAQUETE_MIXTO
  BANDEJA
}

model RegistroConsolidacion {
  id              String            @id @default(uuid())
  tipo            TipoConsolidacion
  usuarioId       String
  creadoEnCliente DateTime?
  creadoEn        DateTime          @default(now())
  // Campos calculados persistidos a propósito (excepción documentada al
  // principio de "campos calculados nunca se guardan" en
  // memory/modelo-datos.md): a diferencia de la edad de un lote, esto NO
  // se puede recalcular después de leer — depende de cuántos Paquete/
  // BandejaSuelta se crearon en ESE momento específico, que ya quedan
  // vinculados por FK; guardarlo acá es solo una comodidad de lectura para
  // AuditLog/reportes, no una fuente de verdad alternativa (paquetes.length
  // /bandejas.length siguen siendo la fuente real).
  cantidadUnidadesFormadas Int
  cantidadConsolidada      Int // cantidadUnidadesFormadas * (180 o 30)

  usuario  Usuario         @relation(fields: [usuarioId], references: [id], onDelete: Restrict)
  paquetes Paquete[]
  bandejas BandejaSuelta[]

  @@index([creadoEn])
}

model Paquete {
  id                      String                 @id @default(uuid())
  peso                    Decimal                @db.Decimal(6, 3)
  tipo                    TipoPaquete
  estado                  EstadoPaquete          @default(DISPONIBLE)
  registroRecoleccionId   String?
  registroConsolidacionId String?                // NUEVO Sprint 7
  creadoEn                DateTime               @default(now())

  registroRecoleccion   RegistroRecoleccion?   @relation(fields: [registroRecoleccionId], references: [id], onDelete: SetNull)
  registroConsolidacion RegistroConsolidacion? @relation(fields: [registroConsolidacionId], references: [id], onDelete: SetNull)
  origenes              PaqueteOrigen[]
  detalleVentas         DetalleVenta[]
  rotura                RoturaPaquete?

  @@index([estado])
  @@index([tipo])
  @@index([registroRecoleccionId])
  @@index([registroConsolidacionId]) // NUEVO Sprint 7
}

model BandejaSuelta {
  id                      String        @id @default(uuid())
  peso                    Decimal       @db.Decimal(6, 3)
  estado                  EstadoBandeja @default(DISPONIBLE)
  registroConsolidacionId String?       // NUEVO Sprint 7 — primer campo de
                                         // procedencia real que tiene este
                                         // modelo (sin usar desde Sprint 0).
  creadoEn                DateTime      @default(now())

  registroConsolidacion RegistroConsolidacion? @relation(fields: [registroConsolidacionId], references: [id], onDelete: SetNull)
  origenes              BandejaOrigen[]
  detalleVentas         DetalleVenta[]

  @@index([estado])
  @@index([registroConsolidacionId]) // NUEVO Sprint 7
}

model Lote {
  // ...campos existentes sin cambios...
  paqueteOrigenes PaqueteOrigen[] // NUEVO Sprint 7 (relación inversa)
  bandejaOrigenes BandejaOrigen[] // NUEVO Sprint 7 (relación inversa)
}

model Usuario {
  // ...campos existentes sin cambios...
  registrosConsolidacion RegistroConsolidacion[] // NUEVO Sprint 7 (relación inversa)
}
```

**Ojo con el error real ya cometido una vez (Sprint 0):** `Usuario` necesita
el campo inverso `registrosConsolidacion RegistroConsolidacion[]` desde el
primer intento de migración, no después — el mismo tipo de omisión
(`MovimientoSueltos.usuario` sin su campo inverso en `Usuario`) ya se
encontró y corrigió en Sprint 0 (`memory/estado-proyecto.md`, "Problemas
encontrados y resueltos durante Sprint 0", punto 1). `npx prisma validate`
lo hubiera detectado, pero más vale no repetir la omisión.

`npx prisma migrate dev --name consolidacion_residuos` genera: `ADD COLUMN
"loteId" TEXT` en `PaqueteOrigen`/`BandejaOrigen` (+ `FOREIGN KEY`, ambas
nullable, no destructivas), `CREATE TABLE "RegistroConsolidacion"` +
`CREATE TYPE "TipoConsolidacion"`, `ADD COLUMN "registroConsolidacionId"
TEXT` en `Paquete`/`BandejaSuelta` (+ `FOREIGN KEY`, nullable). Ninguna
sentencia destructiva — se aplica contra Neon real antes de escribir
cualquier código que dependa de estos campos, mismo criterio que S6-1.

**Verificar después de aplicar** (mismo hallazgo real que ya pasó una vez en
Sprint 6 con `revertidoEn`): releer el schema aplicado y correr `npx prisma
validate` antes de seguir — no asumir que la migración generada coincide
exactamente con lo planificado acá.

## `lib/constants.ts` — constante nueva
```ts
/** Unidades por bandeja suelta armada en Consolidación (Sprint 7) — mismo
 * criterio que UNIDADES_POR_PAQUETE: constante compartida entre
 * server/services/consolidacion.ts (autoritativo) y el preview reactivo del
 * wizard en el cliente. */
export const UNIDADES_POR_BANDEJA = 30;
```

## Pieza nueva de arquitectura 1: `calcularConsolidacion()` — reparto secuencial-determinista, función pura

### Por qué no alcanza con generalizar `calcularEmpaque()`
`calcularEmpaque(cantidadTotal)` (Sprint 5) reparte un único número en
paquetes de 180 + resto. Acá el input no es un número, es una LISTA de
orígenes con su propio saldo cada uno, y el resultado tiene que decir, por
cada unidad de destino, **de qué orígenes salió y cuánto de cada uno** — la
pieza que `PaqueteOrigen`/`BandejaOrigen` necesitan para persistirse.

### El algoritmo: relleno secuencial, agota un origen antes de pasar al siguiente
```ts
// server/services/consolidacion.ts
export type OrigenConSaldo = { galponId: string; loteId: string; disponible: number };
export type PorcionOrigen = { galponId: string; loteId: string; cantidad: number };

export type ResultadoConsolidacion = {
  unidades: PorcionOrigen[][]; // cada elemento interno suma EXACTO unidadDestino
  totalConsolidado: number; // unidades.length * unidadDestino
};

// Función pura, sin Prisma — recibe los orígenes YA en el orden en que se
// deben consumir (el orden en que el operario los seleccionó; quien llama
// decide el orden, esta función no lo infiere). Determinista: mismo input,
// mismo output siempre — requisito para 100% de cobertura con tests
// simples, sin necesidad de mockear nada.
export function calcularConsolidacion(
  origenes: OrigenConSaldo[],
  unidadDestino: number,
): ResultadoConsolidacion {
  const unidades: PorcionOrigen[][] = [];
  let unidadActual: PorcionOrigen[] = [];
  let acumuladoUnidadActual = 0;

  for (const origen of origenes) {
    let restante = origen.disponible;
    while (restante > 0) {
      const necesario = unidadDestino - acumuladoUnidadActual;
      const tomar = Math.min(necesario, restante);
      if (tomar <= 0) break;

      unidadActual.push({ galponId: origen.galponId, loteId: origen.loteId, cantidad: tomar });
      acumuladoUnidadActual += tomar;
      restante -= tomar;

      if (acumuladoUnidadActual === unidadDestino) {
        unidades.push(unidadActual);
        unidadActual = [];
        acumuladoUnidadActual = 0;
      }
    }
  }
  // unidadActual incompleta al terminar el loop se descarta — ese sobrante
  // queda como sueltos sin consolidar, sigue viviendo en InventarioSueltos,
  // no se toca.

  return { unidades, totalConsolidado: unidades.length * unidadDestino };
}
```

**Casos cubiertos por diseño** (van a ser los casos de test, ver más abajo):
origen único múltiplo exacto de `unidadDestino`; origen único con sobrante;
dos orígenes donde el segundo completa la unidad que el primero dejó a
medias; un origen con `disponible: 0` (no aporta nada, `while` no entra);
lista vacía de orígenes (`unidades: []`); orígenes cuyo total combinado no
llega a `unidadDestino` (`unidades: []`, todo queda como sobrante); un
origen que por sí solo alcanza para varias unidades completas (aparece en
varios elementos de `unidades`, confirma la decisión de negocio "un origen
puede aportar a más de una unidad").

## Pieza nueva de arquitectura 2: guard "todo o nada" agregado por origen distinto

### Por qué agregar antes de guardar, no guardar por unidad
Si el mismo origen aparece en dos unidades distintas de `resultado.unidades`
(caso confirmado de negocio), hay que sumar cuánto necesita ESE origen en
TOTAL antes de tocar la base — evita N `updateMany` sobre la misma fila (más
lento, y más ocasiones para que una carrera real se cuele entre medio, aunque
la transacción de todos modos lo protegería).

```ts
// server/repositories/consolidacion.ts
export class SaldoInsuficienteConsolidacionError extends Error {}

// Sexta transacción interactiva del proyecto — combina el patrón de
// "create padre con id de cliente al frente" (registrarRecoleccion) con el
// guard "todo o nada" agregado (revertirRecoleccion, extendido de N filas
// de Paquete a N filas de InventarioSueltos con cantidades DISTINTAS por
// fila, no la misma condición para todas).
export function consolidarSueltos(params: {
  id: string; // RegistroConsolidacion.id, generado en el cliente
  tipo: "PAQUETE_MIXTO" | "BANDEJA";
  unidades: { peso: number; origenes: PorcionOrigen[] }[]; // ya calculado por quien llama
  usuarioId: string;
  creadoEnCliente: Date;
  ahora: Date;
}) {
  const cantidadUnidadesFormadas = params.unidades.length;
  const unidadDestino = params.tipo === "PAQUETE_MIXTO" ? UNIDADES_POR_PAQUETE : UNIDADES_POR_BANDEJA;

  return prisma.$transaction(async (tx) => {
    // 1) Ancla de idempotencia — si params.id ya existe, P2002 acá aborta
    //    TODO antes de tocar InventarioSueltos/Paquete/BandejaSuelta.
    const registro = await tx.registroConsolidacion.create({
      data: {
        id: params.id,
        tipo: params.tipo,
        usuarioId: params.usuarioId,
        creadoEnCliente: params.creadoEnCliente,
        creadoEn: params.ahora,
        cantidadUnidadesFormadas,
        cantidadConsolidada: cantidadUnidadesFormadas * unidadDestino,
      },
    });

    // 2) Agregar cuánto necesita CADA origen distinto, sumando a través de
    //    todas las unidades (un mismo origen puede aparecer en varias).
    const necesarioPorOrigen = new Map<string, { galponId: string; loteId: string; cantidad: number }>();
    for (const unidad of params.unidades) {
      for (const porcion of unidad.origenes) {
        const clave = `${porcion.galponId}:${porcion.loteId}`;
        const previo = necesarioPorOrigen.get(clave);
        necesarioPorOrigen.set(clave, {
          galponId: porcion.galponId,
          loteId: porcion.loteId,
          cantidad: (previo?.cantidad ?? 0) + porcion.cantidad,
        });
      }
    }

    // 3) Guard todo o nada: un UPDATE condicional por origen distinto
    //    (secuencial, no Promise.all — mismo motivo que registrarRecoleccion:
    //    una transacción interactiva comparte una sola conexión). Si la
    //    cantidad de filas afectadas no coincide con la cantidad de
    //    orígenes distintos, al menos uno no alcanzó — aborta TODO
    //    (incluido el create del paso 1).
    let filasAfectadas = 0;
    for (const { galponId, loteId, cantidad } of necesarioPorOrigen.values()) {
      const resultado = await tx.inventarioSueltos.updateMany({
        where: { galponId, loteId, cantidad: { gte: cantidad } },
        data: { cantidad: { decrement: cantidad } },
      });
      filasAfectadas += resultado.count;
    }
    if (filasAfectadas !== necesarioPorOrigen.size) {
      throw new SaldoInsuficienteConsolidacionError();
    }

    // 4) Ledger: un MovimientoSueltos CONSOLIDACION_SALIDA por origen
    //    distinto (no por unidad de destino) — mismo criterio de "sin
    //    ruido redundante en el ledger" que Sprint 5/6 ya establecieron.
    for (const { galponId, loteId, cantidad } of necesarioPorOrigen.values()) {
      await tx.movimientoSueltos.create({
        data: {
          galponId,
          loteId,
          tipo: "CONSOLIDACION_SALIDA",
          cantidad,
          referenciaId: registro.id,
          usuarioId: params.usuarioId,
          creadoEn: params.ahora,
        },
      });
    }

    // 5) Crear las unidades de destino con su detalle de origen anidado —
    //    ids server-default (Prisma), NO client-generated: el reintento ya
    //    quedó bloqueado en el paso 1 (P2002 del padre), así que no hace
    //    falta que estos hijos también sean idempotentes por separado,
    //    mismo criterio que los N Paquete de registrarRecoleccion.
    const creadas: { id: string }[] = [];
    for (const unidad of params.unidades) {
      if (params.tipo === "PAQUETE_MIXTO") {
        const paquete = await tx.paquete.create({
          data: {
            peso: unidad.peso,
            tipo: "MIXTO",
            registroConsolidacionId: registro.id,
            origenes: {
              create: unidad.origenes.map((o) => ({
                galponId: o.galponId,
                loteId: o.loteId,
                cantidad: o.cantidad,
              })),
            },
          },
        });
        creadas.push(paquete);
      } else {
        const bandeja = await tx.bandejaSuelta.create({
          data: {
            peso: unidad.peso,
            registroConsolidacionId: registro.id,
            origenes: {
              create: unidad.origenes.map((o) => ({
                galponId: o.galponId,
                loteId: o.loteId,
                cantidad: o.cantidad,
              })),
            },
          },
        });
        creadas.push(bandeja);
      }
    }

    return { registro, creadas };
  });
}

// Usada por la Server Action en la rama de P2002 (reintento idempotente)
// para comparar cantidadUnidadesFormadas/cantidadConsolidada contra el plan
// recalculado, y para devolver las unidades ya creadas sin re-ejecutar la
// transacción.
export function buscarRegistroConsolidacionConUnidadesPorId(id: string) {
  return prisma.registroConsolidacion.findUnique({
    where: { id },
    include: { paquetes: true, bandejas: true },
  });
}
```

**Orden importa, mismo criterio que `revertirRecoleccion`:** el guard más
barato de fallar primero (colisión de `id`) va antes que el trabajo caro
(N `updateMany` + N `create`). Cualquier error lanzado en cualquier paso
aborta la transacción COMPLETA, incluido el `create` del `RegistroConsolidacion`
ya aplicado — Prisma no deja nada parcial de una transacción interactiva que
termina en excepción.

## Diseño de Zod schemas

### `lib/zod/consolidacion.ts` (nuevo)
```ts
const id = idUuid(); // RegistroConsolidacion.id, generado en el cliente
const creadoEnCliente = z.coerce.date({ message: "Fecha inválida" });

const origenSeleccionado = z.object({
  galponId: idUuid("Galpón inválido"),
  loteId: idUuid("Lote inválido"),
});

const origenes = z
  .array(origenSeleccionado)
  .min(1, "Seleccioná al menos un origen")
  .max(200)
  .refine(
    (arr) => new Set(arr.map((o) => `${o.galponId}:${o.loteId}`)).size === arr.length,
    "No repitas el mismo galpón/lote como origen",
  );

// Mismo criterio que `pesos` de crearRecoleccionSchema: la CANTIDAD de
// pesos tiene que coincidir con las unidades que calcularConsolidacion()
// determina — ese cruce lo hace la Server Action (recalculado
// server-side), no este schema.
const pesos = z
  .array(z.coerce.number().positive("El peso debe ser mayor a 0").max(999.999, "Peso fuera de rango"))
  .min(1, "Debe formarse al menos una unidad")
  .max(1000);

// Un solo schema compartido por los dos wizards — el `tipo`
// (PAQUETE_MIXTO/BANDEJA) NO viaja en el payload: lo fija cada Server
// Action por separado (consolidarPaqueteMixtoAction/consolidarBandejaAction),
// para que el cliente no pueda mandar un `tipo` que no coincide con el
// wizard que en verdad abrió.
export const consolidarSueltosSchema = z.object({ id, origenes, creadoEnCliente, pesos });

export type ConsolidarSueltosInput = z.infer<typeof consolidarSueltosSchema>;
```

## Diseño de repositories

### `server/repositories/inventario.ts` (amplía)
```ts
// Para la pantalla de saldos (/consolidacion) y para poblar la lista de
// orígenes seleccionables de ambos wizards — mismo dataset, una sola
// función. Sin paginar: son pocas combinaciones galpón/lote por granja,
// mismo criterio que listarGalponesActivos()/listarLotesActivos().
export function listarInventarioSueltosConSaldo() {
  return prisma.inventarioSueltos.findMany({
    orderBy: [{ galpon: { nombre: "asc" } }, { lote: { codigo: "asc" } }],
    include: {
      galpon: { select: { id: true, nombre: true } },
      lote: { select: { id: true, codigo: true } },
    },
  });
}
```
`consolidarSueltos`/`buscarRegistroConsolidacionConUnidadesPorId` ya
detallados arriba, en `server/repositories/consolidacion.ts` (archivo
nuevo — módulo propio, mismo criterio de "nombre del módulo en singular"
que `recoleccion.ts`/`inventario.ts`).

## Diseño de Server Actions

### `server/actions/consolidacion.ts` (nuevo)
```ts
async function ejecutarConsolidacion(
  input: ConsolidarSueltosInput,
  ctx: { usuarioId: string },
  tipo: "PAQUETE_MIXTO" | "BANDEJA",
) {
  const unidadDestino = tipo === "PAQUETE_MIXTO" ? UNIDADES_POR_PAQUETE : UNIDADES_POR_BANDEJA;

  // Nunca se confía en el saldo que el cliente leyó al abrir el wizard —
  // se relee InventarioSueltos fresco para los orígenes pedidos, mismo
  // criterio que registrarRecoleccion recalculando calcularEmpaque.
  const saldosReales = await listarInventarioSueltosConSaldo();
  const saldoPorClave = new Map(
    saldosReales.map((s) => [`${s.galponId}:${s.loteId}`, s.cantidad]),
  );
  const origenesConSaldo = input.origenes.map((o) => ({
    galponId: o.galponId,
    loteId: o.loteId,
    disponible: saldoPorClave.get(`${o.galponId}:${o.loteId}`) ?? 0,
  }));

  const { unidades: porciones, totalConsolidado } = calcularConsolidacion(
    origenesConSaldo,
    unidadDestino,
  );

  if (porciones.length === 0) {
    throw new AccionError(
      `No hay saldo suficiente para formar al menos un${tipo === "BANDEJA" ? "a" : ""} ${
        tipo === "PAQUETE_MIXTO" ? "paquete" : "bandeja"
      } completo${tipo === "BANDEJA" ? "a" : ""} (mínimo ${unidadDestino}).`,
    );
  }
  if (input.pesos.length !== porciones.length) {
    throw new AccionError(
      `Los saldos cambiaron — se esperaban ${porciones.length} pesos, se recibieron ${input.pesos.length}. Actualizá la pantalla e intentá de nuevo.`,
    );
  }

  const unidades = porciones.map((origenes, i) => ({ peso: input.pesos[i], origenes }));
  const ahora = new Date();

  let resultado;
  try {
    resultado = await consolidarSueltos({
      id: input.id,
      tipo,
      unidades,
      usuarioId: ctx.usuarioId,
      creadoEnCliente: input.creadoEnCliente,
      ahora,
    });
  } catch (error) {
    if (error instanceof SaldoInsuficienteConsolidacionError) {
      throw new AccionError("El saldo ya no alcanza para esta consolidación — actualizá la pantalla e intentá de nuevo.");
    }
    if (!esErrorDeUnicidad(error)) throw error;

    // Reintento idempotente.
    const existente = await buscarRegistroConsolidacionConUnidadesPorId(input.id);
    if (!existente) throw error;
    if (existente.cantidadUnidadesFormadas !== porciones.length) {
      throw new AccionError(
        "Ya existe una consolidación con este id pero con datos diferentes — no se sobrescribe.",
      );
    }
    resultado = {
      registro: existente,
      creadas: tipo === "PAQUETE_MIXTO" ? existente.paquetes : existente.bandejas,
    };
  }

  return {
    data: { id: resultado.registro.id, unidadesCreadas: resultado.creadas.length, totalConsolidado },
    entidadId: resultado.registro.id,
    estadoDespues: {
      tipo,
      unidadesCreadas: resultado.creadas.length,
      totalConsolidado,
    },
  };
}

export const consolidarPaqueteMixtoAction = withAuth(
  { schema: consolidarSueltosSchema, entidad: "RegistroConsolidacion", accion: "CONSOLIDAR_PAQUETE_MIXTO" },
  (input, ctx) => ejecutarConsolidacion(input, ctx, "PAQUETE_MIXTO"),
);

export const consolidarBandejaAction = withAuth(
  { schema: consolidarSueltosSchema, entidad: "RegistroConsolidacion", accion: "CONSOLIDAR_BANDEJA" },
  (input, ctx) => ejecutarConsolidacion(input, ctx, "BANDEJA"),
);
```
Sin `rol` en ninguna de las dos (abiertas a ambos, decisión confirmada en
`spec.md`) — la función interna `ejecutarConsolidacion` evita duplicar la
lógica completa entre las dos actions (a diferencia de los componentes de
UI, acá SÍ hay valor real en no repetir ~40 líneas idénticas salvo `tipo`).

## Diseño de UI

### `components/domain/consolidacion/saldos-tabla.tsx` (nuevo)
Tabla de solo lectura (galpón, lote, sueltos), envuelta en `<TableScrollArea>`
mismo criterio que el resto de tablas del proyecto. Estado vacío explícito
("Todavía no hay sueltos registrados") si `saldos.length === 0` — no una
tabla en blanco. Sin paginación (mismo criterio que
`listarInventarioSueltosConSaldo`: pocas filas por granja).

### `ConsolidarSueltosDialog` (`components/domain/consolidacion/consolidar-sueltos-dialog.tsx`, nuevo)
Un solo componente parametrizado, usado dos veces en `page.tsx` con props
distintas:
```ts
type ConsolidarSueltosDialogProps = {
  tipo: "PAQUETE_MIXTO" | "BANDEJA";
  unidadDestino: number; // UNIDADES_POR_PAQUETE o UNIDADES_POR_BANDEJA
  etiquetaUnidad: string; // "paquete" | "bandeja"
  titulo: string; // "Armar Paquete Mixto" | "Armar Bandeja"
  saldos: { galponId: string; loteId: string; galponNombre: string; loteCodigo: string; disponible: number }[];
};
```
- Lista de filas seleccionables (galpón — lote — disponible), clicables con
  `aria-pressed` + estilo de borde/fondo primary cuando seleccionadas — sin
  `Checkbox` nuevo (ver corolario en `spec.md`).
- Vista previa reactiva: cada cambio de selección recalcula con una copia
  **duplicada a propósito** de `calcularConsolidacion()` en el cliente
  (`calcularConsolidacionPreview`, mismo criterio documentado que
  `calcularEmpaquePreview` de `RegistrarRecoleccionDialog` — un Client
  Component nunca importa `server/services/*` directo, cruzaría el límite
  de RSC).
- Muestra "Se {va a formar/van a formar} N {unidad(es)} de {unidadDestino} —
  quedan M sueltos sin consolidar", o el mensaje de saldo insuficiente si
  `N === 0`.
- Despliega N campos de peso (mismo patrón reactivo de
  `RegistrarRecoleccionDialog`: se redimensiona en el mismo evento que
  cambia la selección, no en un `useEffect` separado).
- `id` generado una sola vez por apertura (`useState(() =>
  crypto.randomUUID())`), mismo criterio que todos los formularios de
  creación del proyecto desde el fix de S5-13.
- `formAction(payload)` llamado a mano dentro de `startTransition()` — igual
  que `RegistrarRecoleccionDialog`, porque `origenes`/`pesos` son arreglos
  de longitud variable que `<form action>` + `FormData` no puede
  representar.
- Botón "Confirmar" deshabilitado hasta que `unidades.length > 0` y todos
  los pesos tengan valor > 0.

### `app/(app)/consolidacion/page.tsx` (nuevo)
```tsx
export default async function ConsolidacionPage() {
  const saldos = await listarInventarioSueltosConSaldo();
  const saldosParaWizard = saldos.map((s) => ({
    galponId: s.galponId,
    loteId: s.loteId,
    galponNombre: s.galpon.nombre,
    loteCodigo: s.lote.codigo,
    disponible: s.cantidad,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Consolidación"
        actions={
          <div className="flex gap-2">
            <ConsolidarSueltosDialog
              tipo="BANDEJA"
              unidadDestino={UNIDADES_POR_BANDEJA}
              etiquetaUnidad="bandeja"
              titulo="Armar Bandeja"
              saldos={saldosParaWizard}
            />
            <ConsolidarSueltosDialog
              tipo="PAQUETE_MIXTO"
              unidadDestino={UNIDADES_POR_PAQUETE}
              etiquetaUnidad="paquete"
              titulo="Armar Paquete Mixto"
              saldos={saldosParaWizard}
            />
          </div>
        }
      />
      <SaldosTabla saldos={saldos} />
    </div>
  );
}
```
Sin guard de rol — igual que `/recoleccion`/`/mortalidad`/`/bitacora`, sin
entrada en `RUTAS_POR_ROL` (decisión de negocio confirmada).

### `components/layout/nav-items.ts` (modifica)
Agrega `{ href: "/consolidacion", label: "Consolidación", icon: Combine }`
(ícono nuevo de `lucide-react`, ya en el paquete instalado — representa
combinar/unir, coherente con el resto de íconos elegidos por semántica
directa: `Egg` para Recolección, `Skull` para Mortalidad).

## Orden de ejecución (hay dependencias entre tareas)
1. Migración de schema (`loteId` en orígenes, `RegistroConsolidacion`,
   `registroConsolidacionId` en `Paquete`/`BandejaSuelta`, relaciones
   inversas en `Lote`) — nada más puede escribirse contra estos campos
   hasta que existan.
2. `lib/constants.ts` (`UNIDADES_POR_BANDEJA`) — independiente, en paralelo
   con el punto 1.
3. `server/services/consolidacion.ts` (`calcularConsolidacion`) + tests
   unitarios — independiente de 1 (función pura, sin Prisma).
4. `lib/zod/consolidacion.ts` (`consolidarSueltosSchema`) + tests.
5. `server/repositories/inventario.ts` (`listarInventarioSueltosConSaldo`) —
   depende de 1 (necesita los `include` de galpón/lote, que ya existían,
   pero se agrupa acá por orden lógico de repository antes de action).
6. `server/repositories/consolidacion.ts` (`consolidarSueltos`,
   `buscarRegistroConsolidacionConUnidadesPorId`) — depende de 1.
7. `server/actions/consolidacion.ts` (`consolidarPaqueteMixtoAction`,
   `consolidarBandejaAction`) — depende de 3, 4, 5, 6.
8. UI: `SaldosTabla` — depende de 5.
9. UI: `ConsolidarSueltosDialog` — depende de 7.
10. `app/(app)/consolidacion/page.tsx` + `NAV_ITEMS` — depende de 8, 9.
11. Tests de integración de las dos Server Actions (repositories mockeados)
    — depende de 7.
12. Tests de carrera reales contra Neon (guard de saldo bajo concurrencia,
    idempotencia real) — depende de todo lo anterior.
13. `npx vitest run --coverage` — confirmar ≥90% en
    `server/services/consolidacion.ts`.
14. Verificación en vivo contra Neon real (transacción completa: múltiples
    orígenes, un origen que aporta a varias unidades, saldo insuficiente,
    idempotencia real, `AuditLog` real).
15. Verificación clic a clic en navegador / Product Owner.

## Comandos de referencia
```bash
npm run typecheck && npm run lint && npm test
npx vitest run --coverage
npx prisma validate
npx prisma migrate dev --name consolidacion_residuos
npm run build
```

## Estructura de archivos esperada
```
prisma/
  migrations/YYYYMMDDHHMMSS_consolidacion_residuos/migration.sql
src/
  lib/
    constants.ts               # + UNIDADES_POR_BANDEJA
    zod/
      consolidacion.ts         # nuevo: consolidarSueltosSchema
  server/
    services/
      consolidacion.ts         # nuevo: calcularConsolidacion
      inventario.ts             # sin cambios (reconstruirSaldo ya clasifica CONSOLIDACION_SALIDA)
    repositories/
      inventario.ts             # + listarInventarioSueltosConSaldo
      consolidacion.ts          # nuevo: consolidarSueltos, buscarRegistroConsolidacionConUnidadesPorId
    actions/
      consolidacion.ts          # nuevo: consolidarPaqueteMixtoAction, consolidarBandejaAction
  components/domain/
    consolidacion/
      saldos-tabla.tsx                     # nuevo
      consolidar-sueltos-dialog.tsx        # nuevo, compartido por los dos wizards
  components/layout/nav-items.ts            # + entrada "Consolidación"
  app/(app)/consolidacion/page.tsx          # nuevo
tests/
  unit/services/consolidacion.test.ts      # nuevo: calcularConsolidacion
  unit/lib/zod-consolidacion.test.ts       # nuevo
  integration/actions/consolidacion.test.ts # nuevo
```

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx vitest run --coverage` ≥90% en `server/services/consolidacion.ts`.
- `npx prisma validate` en verde, migración `consolidacion_residuos`
  aplicada contra Neon real.
- `npm run build` en verde.
- Guard "todo o nada" agregado por origen verificado con un test de carrera
  real (H5), no solo con mocks.
- Caso "un mismo origen aporta a más de una unidad" verificado explícitamente
  (H3) — confirma que el guard agrega correctamente antes de descontar.
- Consolidación completa verificada en vivo contra Neon real: múltiples
  orígenes formando 1 unidad, un origen formando 2+ unidades, saldo
  insuficiente rechazado, "Armar Bandeja" con el mismo criterio, idempotencia
  real con `P2002`.
- `AuditLog` con filas reales `CONSOLIDAR_PAQUETE_MIXTO`/
  `CONSOLIDAR_BANDEJA` sobre `RegistroConsolidacion`, verificadas contra
  Neon.
- `reconstruirSaldo()` releído contra el historial real de
  `MovimientoSueltos` de un galpón/lote consolidado reproduce exactamente
  `InventarioSueltos.cantidad`.
- Verificación clic a clic en navegador real: selección de orígenes,
  vista previa reactiva, ambos wizards, saldos actualizados sin recargar.
- `memory/estado-proyecto.md` actualizado al cerrar (registro de cierre de
  Sprint 7, deuda de "sin reversión para Consolidación" documentada
  explícitamente, ver `spec.md` R4).
