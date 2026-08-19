# Plan técnico — Sprint 14

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `RegistroRecoleccion`/`RegistroConsolidacion` ya
  tienen `creadoEnCliente DateTime?` + `creadoEn DateTime @default(now())`.
  `RegistroMortalidad`/`BitacoraGlobal` solo tienen `fecha DateTime
  @default(now())`, sin `creadoEnCliente`.
- `server/auth/with-auth.ts`: `withAuth(config, handler)` devuelve una
  función `(rawInput: unknown) => Promise<ActionResult<TOutput>>`.
  `normalizarInput` acepta tanto `FormData` como un objeto plano
  (`RecoleccionPayload` en el dialog de Recolección ya usa esta segunda
  forma). `auth()` se llama con `headers()` de `next/headers` — API
  universal de Next, no específica de Server Actions.
- `server/actions/mortalidad.ts`, `recoleccion.ts`, `bitacora.ts`: cada
  `crear*`/`registrar*` ya resuelve idempotencia por `P2002` con la misma
  forma exacta (buscar existente por id, comparar campos, devolver éxito
  si coincide o `AccionError` si no). **Este plan no reimplementa nada de
  esto — `/api/sync` llama directo a estas funciones.**
- `src/app/sw.ts`: intercepta explícitamente todo `POST` con
  `NetworkOnly` + `handlerDidError` propio que re-lanza el error original
  (para que `useActionState` reciba el error de red tal cual). `/api/sync`
  es un `POST` — cae bajo esa misma regla sin cambios al Service Worker:
  si no hay red, el `fetch` a `/api/sync` rechaza igual que cualquier
  Server Action, y el interceptor de este sprint lo atrapa en el mismo
  punto donde hoy solo se muestra el error.
- `src/proxy.ts`: cualquier ruta autenticada (incluida `/api/sync`, no
  está en el matcher de exclusión) pasa por `verificarRateLimitOperativo`
  (60/min por usuario). Un batch de N ítems en una sola request cuenta
  como **una** solicitud contra ese límite, no N — motivo real (no solo
  conveniencia) para que `/api/sync` reciba un arreglo, no un ítem por
  llamada.
- `components/domain/pwa/connectivity-indicator.tsx`: detecta conectividad
  con `useSyncExternalStore` sobre `navigator.onLine` + eventos
  `online`/`offline`. Se reutiliza el mismo mecanismo para disparar la
  sincronización automática (H5), no uno nuevo.
- `package.json`: Dexie no está instalado todavía (confirmado). Se agrega
  como dependencia nueva de este sprint (`stack-tecnologico.md` ya lo
  anticipa: "Sprint 14, sin instalar todavía"). Versión estable más
  reciente confirmada contra `npm view` al planificar: `dexie@4.4.5`,
  `dexie-react-hooks@4.4.0` (peerDependencies `dexie >=4.2.0-alpha.1
  <5.0.0`, `react >=16` — satisfechos por el proyecto real, React
  19.2.4). Se fijan ambas versiones explícitas al instalar, mismo
  criterio que S13-2.
- `vitest.config.mts`: `environment: "node"` (no `jsdom`), `include:
  ["tests/**/*.test.ts"]` — **no `.tsx`**. Confirmado recorriendo
  `tests/unit/` y `tests/integration/` completos: el proyecto no tiene
  ni un solo test que renderice un componente React (todos son
  `services`/`repositories`/`actions`/`lib`/`auth`). Dos consecuencias
  reales para este sprint, no asumidas: (1) `node` sin `jsdom` no tiene
  `indexedDB` global — Dexie necesita `fake-indexeddb` como dependencia
  de test nueva, no hay ningún mock existente para reutilizar
  (confirmado, no existe en el repo); (2) la pantalla de pendientes
  (H6, 14B) **no lleva test de render** — seguiría el mismo criterio que
  el resto de los componentes `domain/*` del proyecto, verificados en
  vivo (clic a clic), no con un renderer automatizado. Agregar `jsdom` +
  una librería de testing de componentes sería infraestructura nueva no
  pedida por este sprint — fuera de alcance, ver "Fuera de alcance" en
  `spec.md` si hiciera falta revisitarlo.
- `components/domain/bitacora/eliminar-nota-bitacora-dialog.tsx`: **no
  existe ningún `<AlertDialog>` en el proyecto** (confirmado, no hay
  archivo `alert-dialog*` en `components/ui/`). El patrón real de
  confirmación destructiva ya usado (acá y en
  `finalizar-lote-dialog.tsx`) es un `<Dialog>` normal con un botón
  `variant="destructive"` y texto explícito — nunca `window.confirm()`
  (bloquea la pestaña). El botón "Descartar" de la pantalla de
  pendientes (H7, 14B) sigue este mismo patrón exacto, no uno nuevo.

## Divergencia de nombre: `fecha` en vez de `creadoEn` (Mortalidad, Bitácora)
El Contrato Offline-Ready (`memory/convenciones.md`) describe el patrón
genéricamente como "`creadoEnCliente` / `creadoEn`". En el schema real, el
timestamp de servidor de `RegistroMortalidad` y `BitacoraGlobal` ya existe
desde antes de Sprint 5 y se llama `fecha` — usado en índices
(`@@index([loteId, fecha])`), en `puedeRevertirMortalidad({fecha, ...})`,
en filtros de UI (`MortalidadFiltros`, `BitacoraFiltros`) y en el muro
cronológico de Bitácora (`orderBy: [{fecha: "desc"}, {id: "desc"}]`).
Renombrarlo a `creadoEn` tocaría todos esos puntos sin ningún beneficio
real — la migración de este sprint agrega **solo** `creadoEnCliente`,
deja `fecha` intacto, y el resto del plan usa "el timestamp de servidor de
cada entidad" para referirse indistintamente a `creadoEn`
(Recolección/Consolidación) o `fecha` (Mortalidad/Bitácora).

## Migración de schema

```prisma
model RegistroMortalidad {
  id              String         @id @default(uuid())
  loteId          String
  galponId        String
  usuarioId       String
  tipo            TipoMortalidad
  cantidad        Int
  creadoEnCliente DateTime?      // NUEVO — Sprint 14
  fecha           DateTime       @default(now())
  revertido       Boolean        @default(false)
  revertidoEn     DateTime?
  // ... relaciones e índices sin cambios
}

model BitacoraGlobal {
  id              String            @id @default(uuid())
  fecha           DateTime          @default(now())
  creadoEnCliente DateTime?         // NUEVO — Sprint 14
  usuarioId       String
  categoria       CategoriaBitacora
  contenido       String
  eliminada       Boolean           @default(false)
  // ... relaciones e índices sin cambios
}
```

`DateTime?` nullable — igual que `RegistroRecoleccion.creadoEnCliente`:
las filas existentes quedan con `NULL`, sin backfill (no se puede inventar
un reloj de celular que nunca se capturó). No es una columna `NOT NULL`
retroactiva — mismo criterio ya aplicado en Sprint 5/7.

Sin SQL manual adicional — a diferencia de S0-5, esta columna no necesita
ningún `CHECK` ni índice único parcial.

## Zod: agregar `creadoEnCliente` a los schemas de creación

`lib/zod/mortalidad.ts`:
```ts
const creadoEnCliente = z.coerce.date({ message: "Fecha inválida" });

export const crearRegistroMortalidadSchema = z.object({
  id, loteId, tipo, cantidad, creadoEnCliente,
});
```

`lib/zod/bitacora.ts`: mismo agregado a `crearNotaBitacoraSchema`. En
ambos casos, copiar el mismo patrón que ya usa
`crearRecoleccionSchema` (`lib/zod/recoleccion.ts:18`) — no inventar una
validación nueva.

## `server/repositories/mortalidad.ts` / `bitacora.ts` (modifica)
Pasar `creadoEnCliente` al `data` del `create`, igual que
`registrarRecoleccionRepo` ya hace. `registrarMortalidadYDescontarAves`
sigue siendo la misma transacción interactiva — el campo nuevo viaja
dentro del mismo `data`, no cambia el orden ancla-primero/guard-primero ya
decidido en Sprint 5/11.

## `server/actions/mortalidad.ts` / `bitacora.ts` (modifica)
El único cambio es que `input.creadoEnCliente` ahora existe y se pasa al
repository. La lógica de idempotencia (`P2002`, comparación de campos, la
comparación de "existente vs. payload" para decidir si es un reintento
legítimo o un conflicto real) **no compara `creadoEnCliente`** — dos
reintentos legítimos del mismo guardado pueden traer un `creadoEnCliente`
con milisegundos distintos si el reloj del celular avanzó entre el primer
intento fallido y el reintento; comparar ese campo generaría falsos
conflictos. Mismo criterio que ya usa `crearRecoleccionSchema`: la
comparación de "mismos datos" se hace sobre los campos de negocio
(`loteId`, `tipo`, `cantidad` / `categoria`, `contenido`), nunca sobre los
timestamps.

## Capa de cola local — Dexie

Nueva dependencia: `dexie` (última estable). Un solo archivo de definición
de base:

`src/lib/offline/db.ts`:
```ts
import Dexie, { type EntityTable } from "dexie";

export type TipoColaOffline = "MORTALIDAD" | "BITACORA" | "RECOLECCION";
export type EstadoColaOffline = "PENDIENTE" | "ENVIANDO" | "OK" | "ERROR";

// El id de la fila ES el id de cliente de la entidad real (el mismo
// crypto.randomUUID() que ya generan los 3 dialogs) — no un id de cola
// aparte. Así la cola nunca necesita un mapeo id-de-cola ↔ id-de-entidad.
export type ItemColaOffline = {
  id: string;
  tipo: TipoColaOffline;
  // Objeto plano ya validado en forma por el dialog antes de encolar —
  // Dexie serializa con structured clone, así que Date sobrevive tal
  // cual (no hace falta convertirlo a string). Si un módulo futuro con
  // Decimal se agrega a la cola, ESE payload sí debe convertir Decimal a
  // string antes de encolar (Contrato Offline-Ready, memory/convenciones.md)
  // — no aplica a las 3 entidades de este sprint (ver spec.md).
  payload: Record<string, unknown>;
  estado: EstadoColaOffline;
  intentos: number;
  ultimoError?: string;
  creadoEnCliente: Date;
  actualizadoEn: Date;
};

export const dbOffline = new Dexie("avicola-mya-cola") as Dexie & {
  pendientes: EntityTable<ItemColaOffline, "id">;
};

dbOffline.version(1).stores({
  // `estado` indexado: la pantalla de pendientes (H6) y el sincronizador
  // (H5) filtran por estado constantemente, sin recorrer toda la tabla.
  pendientes: "id, estado, tipo",
});
```

`src/lib/offline/cola.ts` (funciones puras sobre Dexie, sin JSX):
- `encolar(tipo, payload)`: inserta con `estado: "PENDIENTE"`, `intentos: 0`.
- `listarPendientes()`: todo lo que no está en `OK` (para H6).
- `marcarEnviando(id)` / `marcarOk(id)` / `marcarError(id, motivo)`.
- `descartar(id)`: `delete` real de la fila — el único lugar de todo el
  proyecto donde un `DELETE` físico es correcto, porque esta tabla no es
  una entidad de negocio en Postgres, es una cola de trabajo local
  (mismo criterio que un `SELECT ... FOR UPDATE SKIP LOCKED` de cualquier
  cola: una vez descartado, no hay "historial" que preservar).

## Interceptor en los 3 dialogs (reemplaza el `catch` marcado)

Antes (los 3 dialogs, hoy):
```ts
try {
  resultado = await registrarMortalidad(formData);
} catch {
  return { ok: false, error: "Sin conexión. Guarda de nuevo cuando recuperes señal." };
}
```

Después:
```ts
try {
  resultado = await registrarMortalidad(payload);
} catch {
  await encolar("MORTALIDAD", payload);
  toastManager.add({
    type: "success",
    title: "Guardado sin conexión",
    description: "Se enviará solo cuando recuperes señal.",
  });
  onExito(); // mismo cierre de diálogo que un guardado online exitoso
  return { ok: true, data: { id: payload.id } };
}
```

Nota de diseño: el `catch` sigue siendo la única señal de "esto es un
fallo de red, no un rechazo de negocio" — igual que hoy. Un rechazo de
negocio (`AccionError`, ej. "no quedan aves vivas") nunca llega a este
`catch`, porque `withAuth` lo traduce a `{ok:false, error}` sin lanzar
excepción — eso sigue mostrándose en rojo en el formulario, sin tocar la
cola. Ningún cambio a esa rama.

`payload` en cada dialog pasa a ser siempre un objeto plano con
`creadoEnCliente: new Date()` (Mortalidad y Bitácora se alinean al patrón
que Recolección ya usa) — no `FormData`, porque la misma cola necesita
persistir el payload y `FormData` no es serializable en IndexedDB sin
conversión manual.

## `POST /api/sync` — batch idempotente

`src/app/api/sync/route.ts` (nuevo):

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { crearNotaBitacora } from "@/server/actions/bitacora";
import { registrarMortalidad } from "@/server/actions/mortalidad";
import { registrarRecoleccion } from "@/server/actions/recoleccion";

const HANDLERS = {
  MORTALIDAD: registrarMortalidad,
  BITACORA: crearNotaBitacora,
  RECOLECCION: registrarRecoleccion,
} as const;

const itemSchema = z.object({
  idLocal: z.string(),
  tipo: z.enum(["MORTALIDAD", "BITACORA", "RECOLECCION"]),
  payload: z.record(z.string(), z.unknown()),
});

// Tope por request — ver "Tamaño de lote" más abajo.
const bodySchema = z.object({ items: z.array(itemSchema).max(25) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Lote inválido." }, { status: 400 });
  }

  // Secuencial, no Promise.all — mismo motivo que R2 en spec.md: no
  // abrir N conexiones pooled de golpe contra Neon (plan gratuito, D6), y
  // mantener el orden de AuditLog coherente con el orden real de captura.
  const resultados = [];
  for (const item of parsed.data.items) {
    const handler = HANDLERS[item.tipo];
    const resultado = await handler(item.payload);
    resultados.push({ idLocal: item.idLocal, ...resultado });
  }

  return NextResponse.json({ resultados });
}
```

**Reutilización, no reimplementación:** `handler(item.payload)` es
literalmente la misma función `withAuth(...)` que ya usan los dialogs
online — misma validación Zod, misma verificación de sesión/rol/idle
timeout, misma idempotencia por `P2002`, mismo `AuditLog`. `/api/sync` no
duplica ninguna regla de negocio — es un adaptador de transporte (HTTP
batch en vez de Server Action individual) sobre lógica que ya existe y ya
está testeada.

**Riesgo R1 de spec.md (verificar `auth()` en Route Handler):** primera
tarea de 14A antes de escribir el resto de `/api/sync` — un `console.log`
temporal dentro de una ruta mínima confirma que `session?.user?.id`
resuelve igual que en una Server Action. Si no resolviera (no se espera,
pero no se asume), la alternativa es pasar el `Authorization`/cookie
explícito — se documenta acá solo como plan B, no se implementa a menos
que la verificación falle.

**Cada `resultado` ya es un `ActionResult<TOutput>`** (`{ok:true,
data}` o `{ok:false, error, campos?}`) — el batch no inventa un contrato
de respuesta nuevo, solo le agrega `idLocal` para que el cliente sepa a
qué ítem de la cola corresponde cada resultado.

**Distinción error transitorio vs. permanente, del lado del cliente:** un
ítem con `resultados[i].ok === false` es SIEMPRE un rechazo de negocio
determinístico (Zod, `AccionError`) — el servidor respondió, no hubo
fallo de red. Ese ítem pasa a `ERROR` en la cola local y no se reintenta
solo (decisión de negocio 6, spec.md). Un fallo de red real (el `fetch` a
`/api/sync` ni siquiera devuelve respuesta) dejaría el ítem en
`PENDIENTE` — el sincronizador (H5) lo reintenta en el próximo evento
`online`, nunca lo pasa a `ERROR`.

### Tamaño de lote
Tope de 25 ítems por request (`bodySchema.max(25)`). Si la cola local
tiene más, el sincronizador envía varios `POST /api/sync` seguidos, uno
por lote de 25 — evita una única request enorme cerca del timeout de
función de Vercel y mantiene cada batch dentro de un tiempo de respuesta
razonable. 25 es una cota inicial conservadora, no una medición real
todavía — si en verificación (14A) resulta insuficiente/excesiva para el
volumen real de un turno de Operario, se ajusta ahí mismo y se documenta
el número final en `tasks.md`.

## Sincronizador (`src/lib/offline/sincronizador.ts`)

```ts
export async function sincronizarCola(): Promise<void> {
  const pendientes = await listarPendientes(); // solo estado === "PENDIENTE"
  if (pendientes.length === 0) return;

  for (const lote of enLotesDe25(pendientes)) {
    await Promise.all(lote.map((item) => marcarEnviando(item.id)));
    let respuesta: { resultados: ResultadoSync[] };
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lote.map((item) => ({
            idLocal: item.id, tipo: item.tipo, payload: item.payload,
          })),
        }),
      });
      respuesta = await res.json();
    } catch {
      // Sin red real (o se cortó a mitad del batch) — vuelven a PENDIENTE,
      // el próximo evento "online" los reintenta. No se marcan ERROR:
      // esto es exactamente la distinción transitorio/permanente de arriba.
      await Promise.all(lote.map((item) => marcarPendiente(item.id)));
      return; // no seguir con el siguiente lote si ya no hay red
    }
    for (const resultado of respuesta.resultados) {
      if (resultado.ok) await marcarOk(resultado.idLocal);
      else await marcarError(resultado.idLocal, resultado.error);
    }
  }
}
```

Disparadores de `sincronizarCola()`:
1. Evento `online` del navegador (mismo mecanismo que
   `ConnectivityIndicator`) — H5, 14A.
2. Botón "Reintentar" manual en la pantalla de pendientes — H6, 14B.
3. Al montar el Shell autenticado (por si la app se abrió ya con señal y
   había pendientes de una sesión anterior sin haber disparado `online`
   todavía) — mismo criterio que `PrecargarCatalogos` de Sprint 13
   (dispara trabajo al entrar, no espera un evento).

No hay reintento automático por temporizador/polling — solo evento
`online` + montaje + botón manual. Un polling agregaría carga constante
contra Neon sin necesidad real (si no hay señal, reintentar cada N
segundos no cambia nada hasta que el evento `online` dispare de todos
modos).

## Pantalla de pendientes (H6, 14B)

`src/components/domain/offline/pantalla-pendientes.tsx` (nuevo, client
component) + ruta `src/app/(app)/pendientes/page.tsx`. Sin restricción de
rol en `RUTAS_POR_ROL` (decisión de negocio 5, spec.md — visible a
cualquier autenticado).

Lee la cola con `useLiveQuery` de `dexie-react-hooks` (extensión oficial
de Dexie para React, mismo paquete, se instala junto con `dexie`) —
reactivo automáticamente a cambios en IndexedDB, sin `useEffect` +
`setState` manual (mismo criterio anti-patrón que ya documentó Sprint 4
para `BitacoraMuro`).

Cada fila: tipo (ícono, mismo set que ya usan los 3 dialogs — `Skull`,
`Egg`, notas de bitácora), estado (badge — reusa el mismo criterio de
`globals.css` de `convenciones.md`: `.badge-cola-pendiente`/
`-enviando`/`-ok`/`-error`, un tono por estado sin pisar los ya usados),
motivo si `ERROR`, botón "Reintentar" (llama `sincronizarCola()` acotado a
ese ítem) y "Descartar" (con confirmación — mismo patrón de
`EliminarNotaBitacoraDialog`: `<Dialog>` + botón `variant="destructive"`,
no `window.confirm()`).

Entrada visible en el Shell: un badge con el conteo de pendientes
(`PENDIENTE` + `ERROR`) en el mismo lugar donde vive
`ConnectivityIndicator` (footer del Sidebar) — no una pantalla nueva
completamente separada del flujo, sino un acceso directo visible siempre
que haya algo sin sincronizar.

## Cómo se integra con el Service Worker existente (sin duplicar caché)
`app/sw.ts` no se modifica. La regla `NetworkOnly` sobre todo `POST` ya
cubre `/api/sync` — el Service Worker no necesita saber nada de la cola de
Dexie, esa lógica vive enteramente en JavaScript de la app (React), no en
el Service Worker. Mantener la cola fuera del Service Worker es
deliberado: Dexie/IndexedDB es accesible desde cualquier contexto (tab,
Service Worker, worker) pero la lógica de reintento/estado es más simple
de razonar y testear viviendo en el hilo principal de React, no en el
Service Worker — mismo criterio que Serwist recomienda para colas de
"background sync" custom cuando no se usa la Background Sync API nativa
(no usada en este sprint: soporte de navegador desigual, y el evento
`online` + reintento manual ya cubre el caso de uso real del proyecto).

## Orden de ejecución

### 14A
1. Spike: confirmar `auth()` funciona en un Route Handler mínimo (R1).
2. Migración: `creadoEnCliente` en `RegistroMortalidad`/`BitacoraGlobal`.
3. Zod: agregar `creadoEnCliente` a los 2 schemas de creación.
4. Repository + Action: pasar `creadoEnCliente` en Mortalidad y Bitácora.
5. Instalar `dexie` + `dexie-react-hooks`. `src/lib/offline/db.ts` +
   `cola.ts`.
6. `POST /api/sync` completo (batch, tope de 25, secuencial).
7. `src/lib/offline/sincronizador.ts`.
8. Interceptor en los 3 dialogs (payload como objeto plano en los 3,
   `encolar` en el `catch`).
9. Disparadores de sincronización (evento `online` + montaje del Shell).
10. Tests unitarios de `cola.ts`/`sincronizador.ts` (mockeando Dexie/fetch)
    + tests de integración de `/api/sync` (mockeando los 3 handlers).
11. Verificación en vivo: cortar red real (DevTools/modo avión), guardar
    en las 3 pantallas, recuperar señal, confirmar sincronización sin
    duplicar contra Neon real.

### 14B
12. Pantalla de pendientes + badge en el Shell.
13. Reintento manual por ítem.
14. Descartar con confirmación.
15. Verificación en vivo: cerrar sesión con pendientes en cola, volver a
    entrar, confirmar que la cola sigue ahí y sincroniza.
16. Verificación en vivo: forzar un error permanente real (ej. finalizar
    un lote antes de sincronizar un registro pendiente de ese lote),
    confirmar que queda en `ERROR` visible y no se descarta solo.

## Comandos de referencia
```
npm install dexie dexie-react-hooks
npx prisma migrate dev --name sprint14_creado_en_cliente
npx prisma validate
npm run typecheck && npm run lint && npm test
```

## Estructura de archivos esperada
```
prisma/schema.prisma                          (modifica)
src/
  app/
    api/sync/route.ts                          (nuevo)
    (app)/pendientes/page.tsx                  (nuevo, 14B)
  components/domain/
    mortalidad/registrar-mortalidad-dialog.tsx (modifica)
    bitacora/nueva-nota-bitacora-dialog.tsx     (modifica)
    recoleccion/registrar-recoleccion-dialog.tsx(modifica)
    offline/
      pantalla-pendientes.tsx                  (nuevo, 14B)
      badge-pendientes.tsx                     (nuevo, 14B)
  lib/
    offline/
      db.ts                                    (nuevo)
      cola.ts                                  (nuevo)
      sincronizador.ts                         (nuevo)
  lib/zod/mortalidad.ts                        (modifica)
  lib/zod/bitacora.ts                          (modifica)
  server/
    repositories/mortalidad.ts                 (modifica)
    repositories/bitacora.ts                   (modifica)
    actions/mortalidad.ts                      (modifica — solo pasa el campo nuevo)
    actions/bitacora.ts                        (modifica — solo pasa el campo nuevo)
tests/
  unit/offline/cola.test.ts                    (nuevo)
  unit/offline/sincronizador.test.ts            (nuevo)
  integration/api/sync.test.ts                  (nuevo — sigue el mismo
                                                  patrón de carpeta anidada
                                                  que integration/actions/,
                                                  integration/auth/, etc.)
```

## Comandos de referencia (dependencias de test)
```
npm install -D fake-indexeddb
```
Necesaria porque `vitest.config.mts` corre en `environment: "node"` (sin
`jsdom`), que no tiene `indexedDB` global — sin esto, `dbOffline` de
`lib/offline/db.ts` no puede abrir ninguna base en los tests. Se importa
una sola vez (`import "fake-indexeddb/auto"`) en el setup del archivo de
test de `cola.ts`, no en un setup global del proyecto — es la única
suite que la necesita.

## Definition of Done aplicable a este sprint
- `npm run typecheck && npm run lint && npm test` en verde.
- `npx prisma validate` en verde tras la migración.
- Cobertura 100%/100% en `lib/offline/cola.ts`/`sincronizador.ts` y en
  `app/api/sync/route.ts` (mockeando los 3 handlers, no una BD real).
- Ningún componente ni `service` importa Prisma directo — `/api/sync`
  tampoco: solo llama a las Server Actions existentes, que ya respetan la
  capa `repositories/`.
- Verificación en vivo (no solo tests) de: guardar sin señal en las 3
  pantallas, recuperar señal, sincronizar sin duplicar; cerrar sesión con
  pendientes y confirmar que sobreviven; forzar un error permanente real.
