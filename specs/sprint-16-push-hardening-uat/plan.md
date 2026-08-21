# Plan técnico — Sprint 16

## Punto de partida real del código (verificado antes de planificar)
- `prisma/schema.prisma`: `PushSubscription` (línea ~674) completo desde
  Sprint 0, sin consumidor. `Credito` (línea ~559) completo desde Sprint 11.
- `src/server/services/credito.ts`: `calcularNivelAlerta(fechaLimite, hoy)`
  es la única fuente de verdad de los 3 niveles — este sprint la reutiliza,
  no la reimplementa.
- `src/server/auth/with-auth.ts`: patrón estándar de mutación (Zod + rol +
  AuditLog) — se usa para `suscribirPush`/`eliminarSuscripcionPush`. El
  cron NO pasa por acá (no hay sesión de usuario en una llamada de Vercel
  Cron) — ver "Route Handler del cron" abajo.
- `src/lib/rate-limit.ts` es el precedente exacto de "integración externa
  sin Prisma vive en `lib/`, no en `services/`" — `lib/webPush.ts` sigue el
  mismo criterio para `web-push`.
- `src/proxy.ts`: guard de sesión por defecto en cualquier ruta no
  excluida. Se modifica `esRutaPublica` para incluir `/api/cron` (además
  de `/login`) — el cron se autentica solo, con su propio `CRON_SECRET`,
  dentro del Route Handler.
- `src/app/(app)/creditos/page.tsx` y
  `src/components/domain/creditos/panel-alertas.tsx` ya existen —
  `suscripcion-push-toggle.tsx` se agrega al lado de `panel-alertas.tsx`,
  mismo `page.tsx`.

## D12 — Playwright E2E contra Neon dev real
**Decisión:** los 5 flujos E2E corren contra la misma base Neon de
desarrollo que usa el resto del proyecto para "verificación en vivo" — no
se provisiona una base/rama aislada nueva.
**Motivo:** consistencia con el criterio ya establecido en Sprints 1-15
(scripts temporales contra Neon real, nunca mocks para verificación final).
Provisionar y mantener una rama de Neon aparte solo para CI/Playwright es
un costo de infraestructura nuevo que el roadmap no pide resolver este
sprint.
**Mitigación del riesgo (R3, spec.md):** cada test de Playwright crea sus
propios datos con IDs de cliente prefijados (`crypto.randomUUID()`, mismo
contrato offline-ready que ya usa el resto del proyecto) y los borra en un
`afterEach`/`afterAll` del propio spec — nunca deja filas huérfanas. Los 5
flujos se corren manualmente (no en CI en cada PR, corolario de diseño 7),
así que no compiten con una sesión de prueba manual del Product Owner sin
coordinación.
**Impacto:** se agrega a `memory/decisiones-tecnicas.md` como D12 en la
primera tarea de H5.

## D13 — Librería de Web Push: `web-push`
**Decisión:** se usa `web-push` (Node, MIT) para enviar notificaciones
VAPID desde el servidor.
**Motivo:** es la librería de referencia del ecosistema Node para Web Push
con VAPID — implementa el protocolo completo (cifrado del payload,
firmado JWT del header VAPID) sin que el proyecto tenga que reimplementarlo
a mano. No hay alternativa real más liviana para este caso de uso.
**Impacto:** se agrega a `memory/decisiones-tecnicas.md` como D13 en la
primera tarea de H1/H2.

```bash
npm install web-push
npm install -D @types/web-push
```

## Migración de schema — `Credito.notificacionVencidoEnviada`
```prisma
model Credito {
  id          String        @id @default(uuid())
  ventaId     String        @unique
  clienteId   String
  montoTotal  Decimal       @db.Decimal(10, 2)
  montoPagado Decimal       @default(0) @db.Decimal(10, 2)
  fechaLimite DateTime
  estado      EstadoCredito @default(PENDIENTE)
  notificacionVencidoEnviada Boolean @default(false) // NUEVO Sprint 16

  venta   Venta             @relation(fields: [ventaId], references: [id], onDelete: Restrict)
  cliente Cliente           @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  abonos  HistorialAbonos[]

  @@index([estado, fechaLimite])
  @@index([clienteId])
}
```
`npx prisma migrate dev --name sprint16_credito_notificacion_vencido` — aditiva
(`ADD COLUMN ... DEFAULT false`), no destructiva, mismo patrón que
`Egreso.revertido` (Sprint 12) y el índice de `RegistroMortalidad`
(Sprint 15).

## `lib/zod/pushSubscription.ts` (nuevo)
```ts
import { z } from "zod";

export const suscribirPushSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const eliminarSuscripcionPushSchema = z.object({
  endpoint: z.string().url(),
});
```
Sin `idUuid()` acá — `PushSubscription.id` lo genera Prisma
(`@default(uuid())`), el cliente nunca lo envía; la identidad real de la
fila para el cliente es el `endpoint` (ya `@unique` en el schema), no un id
propio — no aplica el contrato offline-ready (suscribirse requiere
conectividad por definición, no es una operación de campo sin señal).

## `lib/webPush.ts` (nuevo) — wrapper de `web-push`, sin Prisma
```ts
import webPush from "web-push";

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export type ResultadoEnvioPush =
  | { ok: true }
  | { ok: false; suscripcionInvalida: boolean };

export async function enviarNotificacionPush(
  suscripcion: { endpoint: string; p256dh: string; auth: string },
  payload: { titulo: string; cuerpo: string; url: string },
): Promise<ResultadoEnvioPush> {
  try {
    await webPush.sendNotification(
      { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
      JSON.stringify({ titulo: payload.titulo, cuerpo: payload.cuerpo, url: payload.url }),
    );
    return { ok: true };
  } catch (error) {
    // web-push tipa el error como WebPushError con statusCode — 404/410
    // significa que el navegador ya revocó esta suscripción (corolario de
    // diseño 2, spec.md); cualquier otro código es un fallo transitorio.
    const statusCode = (error as { statusCode?: number }).statusCode;
    return { ok: false, suscripcionInvalida: statusCode === 404 || statusCode === 410 };
  }
}
```

## `server/repositories/pushSubscription.ts` (nuevo)
```ts
// H1 — upsert por endpoint (ya @unique): un mismo navegador reintentando
// "Activar" no duplica fila, solo refresca p256dh/auth si el navegador
// rotó las claves internas de la suscripción.
export function crearOActualizarSuscripcionPush(
  usuarioId: string,
  datos: { endpoint: string; p256dh: string; auth: string },
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: datos.endpoint },
    create: { usuarioId, ...datos },
    update: { usuarioId, p256dh: datos.p256dh, auth: datos.auth },
  });
}

// H1 — solo borra la propia suscripción del usuario que la pide (no un
// endpoint ajeno) — deleteMany es no-op silencioso si no matchea, mismo
// criterio que el resto del proyecto para "reintento sin fila real".
export function eliminarSuscripcionPushDeUsuario(usuarioId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { usuarioId, endpoint } });
}

// H2 — destinatarios del cron: solo GERENTE con Usuario.estado ACTIVO
// (un Gerente desactivado no debería seguir recibiendo avisos).
export function listarSuscripcionesPushDeGerentesActivos() {
  return prisma.pushSubscription.findMany({
    where: { usuario: { rol: "GERENTE", estado: "ACTIVO" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
}

// H3 — limpieza tras un 404/410 real (lib/webPush.ts lo determina).
export function eliminarSuscripcionPushPorId(id: string) {
  return prisma.pushSubscription.deleteMany({ where: { id } });
}
```

## `server/repositories/credito.ts` (agrega)
```ts
// H2 — créditos PENDIENTES aún no notificados, con el dato de cliente ya
// aplanado para el mensaje del push (mismo criterio que
// listarVentasParaRankingEnRango de Sprint 15: el repository no aplana
// includes, pero acá el consumidor único es el cron, se aplana adelante
// para no repetir el patrón de "aplanar en el Server Component" que no
// aplica a un Route Handler sin JSX).
export function listarCreditosPendientesSinNotificar() {
  return prisma.credito.findMany({
    where: { estado: "PENDIENTE", notificacionVencidoEnviada: false },
    select: {
      id: true,
      fechaLimite: true,
      montoTotal: true,
      montoPagado: true,
      cliente: { select: { nombre: true } },
    },
  });
}

// H2 — marca en batch los créditos que el cron efectivamente notificó
// este ciclo (best-effort, corolario de diseño 4: se marcan aunque algún
// envío individual haya fallado por un motivo transitorio).
export function marcarCreditosComoNotificados(ids: string[]) {
  return prisma.credito.updateMany({
    where: { id: { in: ids } },
    data: { notificacionVencidoEnviada: true },
  });
}
```

## `server/services/credito.ts` (agrega) — función pura, sin Prisma
```ts
// H2 — decide, sin tocar la base, qué créditos de la lista ya traída por
// el repository cruzan a "recién vencido" hoy. Reutiliza
// calcularNivelAlerta (arriba en el mismo archivo) — no un cuarto nivel
// nuevo ni un cálculo de fecha distinto.
export function creditosParaNotificar(
  creditos: { id: string; fechaLimite: Date }[],
  hoy: Date,
): string[] {
  return creditos
    .filter((credito) => calcularNivelAlerta(credito.fechaLimite, hoy) === "VENCIDO_RECIENTE")
    .map((credito) => credito.id);
}

// H2 — arma el texto del push, function pura y testeable sin red.
export function construirMensajePush(credito: {
  cliente: { nombre: string };
  montoTotal: number;
  montoPagado: number;
}): { titulo: string; cuerpo: string } {
  const saldo = calcularSaldoPendiente(credito.montoTotal, credito.montoPagado);
  return {
    titulo: "Crédito vencido",
    cuerpo: `${credito.cliente.nombre} debe S/ ${saldo.toFixed(2)}`,
  };
}
```
**Nota de diseño real, distinta de `agruparSumaPorDia`/`rankearClientes`
(Sprint 15):** acá `creditosParaNotificar` filtra por "vence justo hoy",
no por un rango de fechas ya acotado en el `where` del repository —
`listarCreditosPendientesSinNotificar()` trae TODOS los PENDIENTES no
notificados (volumen bajo, confirmado en `memory/estado-proyecto.md`), y
es la función pura la que decide cuál cruza el umbral exacto de hoy. Se
prefirió así para no filtrar por fecha dos veces con criterios que podrían
divergir (uno en SQL, otro en JS) — más simple con el volumen actual.

## `server/actions/pushSubscription.ts` (nuevo)
```ts
export const suscribirPush = withAuth(
  { schema: suscribirPushSchema, rol: "GERENTE", entidad: "PushSubscription", accion: "SUSCRIBIR" },
  async (input, { usuarioId }) => {
    const suscripcion = await crearOActualizarSuscripcionPush(usuarioId, input);
    return { data: suscripcion, entidadId: suscripcion.id };
  },
);

export const eliminarSuscripcionPush = withAuth(
  { schema: eliminarSuscripcionPushSchema, rol: "GERENTE", entidad: "PushSubscription", accion: "ELIMINAR" },
  async (input, { usuarioId }) => {
    await eliminarSuscripcionPushDeUsuario(usuarioId, input.endpoint);
    return { data: null, entidadId: input.endpoint };
  },
);
```
Ambas dejan fila en `AuditLog` (mismo criterio que cualquier mutación vía
`withAuth`) — activar/desactivar notificaciones es una acción de
configuración con valor de auditoría real (a diferencia de la limpieza
automática del cron, que no pasa por acá — ver abajo).

## `src/app/api/cron/creditos-vencidos/route.ts` (nuevo, Route Handler GET)
```ts
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const [creditos, suscripciones] = await Promise.all([
    listarCreditosPendientesSinNotificar(),
    listarSuscripcionesPushDeGerentesActivos(),
  ]);

  const idsParaNotificar = creditosParaNotificar(creditos, hoyEnLima());
  const creditosParaEnviar = creditos.filter((c) => idsParaNotificar.includes(c.id));

  for (const credito of creditosParaEnviar) {
    const mensaje = construirMensajePush(credito);
    for (const suscripcion of suscripciones) {
      const resultado = await enviarNotificacionPush(suscripcion, { ...mensaje, url: "/creditos" });
      if (!resultado.ok && resultado.suscripcionInvalida) {
        await eliminarSuscripcionPushPorId(suscripcion.id);
      }
    }
  }

  if (idsParaNotificar.length > 0) {
    await marcarCreditosComoNotificados(idsParaNotificar);
  }

  return NextResponse.json({ notificados: idsParaNotificar.length });
}
```
**No pasa por `withAuth`** (no hay sesión ni usuario invocando esto,
`config.entidad`/`AuditLog` de `withAuth` asumen una mutación disparada por
un Usuario real) — mismo criterio que `api/sync/route.ts` (Sprint 14) de
"adaptador de transporte" con su propia verificación, documentado en
`memory/convenciones.md` para lecturas fuera del molde de `withAuth`, acá
extendido a un job de sistema sin sesión. Sin fila de `AuditLog` para el
envío en sí — no hay `usuarioId` real que atribuirle; si hace falta
trazabilidad del cron a futuro, es una decisión nueva (ej. una tabla de
log de cron), fuera de alcance de este sprint.

## `vercel.json` (nuevo)
```json
{
  "crons": [
    {
      "path": "/api/cron/creditos-vencidos",
      "schedule": "0 13 * * *"
    }
  ]
}
```
`13:00 UTC` = `08:00 América/Lima` (UTC-5 fijo todo el año, D5 — sin
horario de verano en Perú, no hace falta ajustar por estación). Una sola
ejecución diaria, dentro del límite del plan Hobby (decisión de negocio 1).

## `src/proxy.ts` (modifica) — excluir `/api/cron` del guard de sesión
```ts
const esRutaPublica = pathname === "/login" || pathname.startsWith("/api/cron");
```
El resto del guard (rate limiting operativo, RBAC) no aplica a esta ruta
porque no hay `req.auth` en una llamada de Cron — cae directo a
`NextResponse.next()`. La protección real de `/api/cron/*` vive DENTRO del
propio Route Handler (`CRON_SECRET`), no en el proxy — mismo principio de
"defensa en el punto de uso" que ya aplica `exportar/route.ts` (Sprint 15)
verificando rol adentro aunque el middleware también proteja la ruta,
solo que acá el middleware directamente no puede aplicar (no hay rol que
verificar sin sesión).

## `src/app/sw.ts` (modifica) — listeners de `push` y `notificationclick`
```ts
self.addEventListener("push", (event) => {
  const datos = event.data?.json() as { titulo: string; cuerpo: string; url: string } | undefined;
  if (!datos) return;
  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/icon-192.png", // mismo ícono que el manifest de Sprint 13
      data: { url: datos.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url));
});
```
Se agrega dentro del mismo `serwist.addEventListeners()` — `push`/
`notificationclick` son eventos nativos del Service Worker, no pasan por
las estrategias de `runtimeCaching` de Serwist, se registran aparte con
`self.addEventListener` directo (confirmado como patrón estándar de
Service Workers, no específico de Serwist).

## `components/domain/creditos/suscripcion-push-toggle.tsx` (nuevo, Client Component)
Lee el estado real con `navigator.serviceWorker.ready.then(reg =>
reg.pushManager.getSubscription())` al montar (no un flag propio del
servidor — corolario, H1 spec.md). Activar: `Notification.requestPermission()`
→ si `"granted"`, `reg.pushManager.subscribe({ userVisibleOnly: true,
applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY)
})` → `suscribirPush({ endpoint, p256dh, auth })` (extraídos de
`subscription.toJSON()`). Desactivar: `subscription.unsubscribe()` →
`eliminarSuscripcionPush({ endpoint })`. Renderizado condicional en
`src/app/(app)/creditos/page.tsx`: `{session.user.rol === "GERENTE" &&
<SuscripcionPushToggle />}`, mismo criterio que las secciones GERENTE-only
del dashboard (Sprint 15, S15-35).

## Playwright — instalación y estructura
```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```
Solo Chromium (no Firefox/WebKit) — el volumen de este sprint es 5 flujos
de humo contra un solo navegador real, no una matriz de compatibilidad
cross-browser; el proyecto ya delega la verificación mobile/Safari a
dispositivos reales del Product Owner (ver `memory/estado-proyecto.md`,
"Verificación en dispositivos reales"), no a Playwright.

`playwright.config.ts` (raíz): `baseURL` apunta a `http://localhost:3000`
(contra `npm run dev`, no un build de producción — mismo criterio de
"verificación en vivo" del resto del proyecto), `testDir: "tests/e2e"`,
`fullyParallel: false` (los 5 flujos comparten la misma Neon dev, correr
en paralelo aumentaría el riesgo de datos cruzados entre flujos).

### Aislamiento de datos de prueba (D12, mitigación de R3)
Cada spec de `tests/e2e/*.spec.ts`:
1. Crea sus propios datos de prueba al inicio (`test.beforeAll`), con un
   nombre reconocible (`"E2E Playwright — <flujo>"`) para poder
   identificarlos si algo queda huérfano.
2. Limpia lo que creó en `test.afterAll`, incluso si el test falló
   (`try/finally` alrededor de las acciones, o el hook `afterAll` de
   Playwright que corre siempre).
3. Usa credenciales de un Usuario de prueba dedicado (no la cuenta real
   `gerente`/`operario` sembrada) — mismo criterio que Sprints 2-15 usan
   para no tocar cuentas reales durante verificación.

```
tests/e2e/
  login.spec.ts
  pos-venta-contado.spec.ts
  pos-venta-credito-abono.spec.ts
  mortalidad-offline.spec.ts
  lote-alta-mudanza.spec.ts
```
El flujo offline (`mortalidad-offline.spec.ts`) usa
`page.context().setOffline(true)` (API nativa de Playwright) para simular
sin conexión, confirma que el registro aparece en la cola de IndexedDB
(`page.evaluate(() => ...)` contra Dexie), y `setOffline(false)` + espera
de sincronización para confirmar que llegó a Neon.

## Auditoría de performance — enfoque
1. Listar las queries de mayor riesgo real, no solo las ya sospechadas:
   revisar `server/repositories/*.ts` completo buscando `findMany` con
   `include` anidado profundo o sin `where` acotado.
2. Confirmadas de antemano por el propio roadmap/sesión: Galpones/Lotes
   (joins anidados de ubicación), Ventas (3 relaciones + count).
3. Por cada una: `EXPLAIN ANALYZE` de la query real (extraída con
   `prisma.$queryRaw` temporal o el log de Prisma en modo `query`) contra
   Neon dev con el volumen real de datos disponible.
4. Documentar resultado en `memory/estado-proyecto.md` (mismo formato que
   el hallazgo de `RegistroMortalidad` en Sprint 15) — plan de ejecución,
   si hay seq scan evitable, y la decisión (fix ahora / deuda), siguiendo
   la decisión de negocio 3.

## Guion de UAT (H7) — cómo se organiza dentro de una sesión de Claude Code
1. Confirmar con el Product Owner una fecha/momento en que el Gerente y el
   Operario puedan probar juntos (presencial o cada uno desde su
   dispositivo real).
2. Guion de prueba guiado, un flujo real por rol:
   - **Gerente:** revisar dashboard, activar notificaciones push en
     `/creditos`, generar un reporte en `/reportes` y exportarlo, revisar
     un crédito vencido real.
   - **Operario:** registrar producción/mortalidad del día, hacer una
     venta en `/pos` (contado y a crédito), probar sin señal (modo avión)
     si es posible.
3. Cada hallazgo (bug, confusión de UX, pedido de cambio) se anota en el
   momento, se prioriza con el Product Owner al final de la sesión, y se
   documenta en `memory/estado-proyecto.md` — mismo criterio que cualquier
   sesión de verificación en vivo anterior (Sprints 1-15).
4. Si hay un iPhone real disponible durante esta sesión, se aprovecha para
   cerrar S13-21 (instalación de la PWA, notificación push si el navegador
   lo soporta) — si no, se documenta que sigue pendiente.

## `docs/manual-usuario.md` (nuevo) — formato
Markdown en el repo (no PDF ni herramienta externa, decisión de negocio en
H7). Estructura: una sección por rol (Gerente/Operario), cada una con los
flujos reales que ese rol usa día a día, capturas de pantalla reales de la
app ya desplegada (guardadas en `docs/img/`, no enlazadas a un servicio
externo). Se escribe DESPUÉS del UAT (H7), incorporando cualquier
confusión real que el Gerente/Operario haya mostrado durante la sesión —
un manual escrito antes de ver a un usuario real probando corre el riesgo
de explicar lo que el equipo cree que es confuso, no lo que realmente lo es.

## Orden de ejecución (hay dependencias entre tareas)
1. `memory/decisiones-tecnicas.md` (D12, D13) — documentar antes de instalar.
2. `npm install web-push` + `@types/web-push`. Generar claves VAPID
   (`npx web-push generate-vapid-keys`, script descartable) + `CRON_SECRET`
   propio. Cargar las 5 env vars en `.env` local y en Vercel
   (Production + Preview).
3. Migración `Credito.notificacionVencidoEnviada`.
4. `lib/webPush.ts`, `lib/zod/pushSubscription.ts` — sin dependencias de
   Prisma, se pueden escribir/testear antes que los repositories.
5. `server/repositories/pushSubscription.ts`,
   `server/repositories/credito.ts` (funciones nuevas) — independientes
   entre sí.
6. `server/services/credito.ts` (`creditosParaNotificar`,
   `construirMensajePush`) + tests unitarios (cobertura ≥90%).
7. `server/actions/pushSubscription.ts` — depende de 4, 5.
8. `src/app/sw.ts` (listeners `push`/`notificationclick`) — independiente
   del resto, se puede hacer en paralelo.
9. `components/domain/creditos/suscripcion-push-toggle.tsx` +
   integración en `creditos/page.tsx` — depende de 7, 8.
10. `src/app/api/cron/creditos-vencidos/route.ts` — depende de 4, 5, 6.
11. `src/proxy.ts` (excluir `/api/cron`) — antes de desplegar el cron, o
    el propio proxy lo bloquea.
12. `vercel.json` — depende de 10, 11. Deploy y verificación en vivo del
    cron real (invocación manual con `curl` + `CRON_SECRET` correcto y con
    uno incorrecto, confirmando 200/401).
13. H3 (limpieza de suscripciones caducadas) ya queda cubierta por el
    diseño de `lib/webPush.ts` + el `route.ts` del paso 10 — sin tarea de
    código aparte, solo verificación explícita (simular un 410 real o con
    un endpoint inválido a mano).
14. `npm install -D @playwright/test`, `playwright.config.ts`, los 5
    `tests/e2e/*.spec.ts` — puede empezar en paralelo con 2-13 (sin
    dependencia real, otro subsistema).
15. Auditoría de performance (H6) — puede empezar en paralelo con
    cualquier otra tarea, es solo lectura/diagnóstico hasta que aparezca
    algo que corregir.
16. UAT (H7) — depende de que 1-15 estén desplegados y estables; se agenda
    con el Product Owner.
17. `docs/manual-usuario.md` — depende de 16 (incorpora hallazgos reales
    del UAT).
18. Verificación final completa + `npm run typecheck && npm run lint &&
    npm test`.

## Definition of Done aplicable a este sprint
(`memory/definition-of-done.md` sigue sin existir — mismo criterio que
Sprints 3-15: `CLAUDE.md` + esta sección son el DoD efectivo.)
- `npm run typecheck && npm run lint` en verde.
- `npm test` en verde, sin regresión sobre los tests heredados de Sprint 15.
- `npx playwright test` en verde para los 5 flujos, contra Neon dev real,
  sin datos huérfanos tras la corrida (verificado explícitamente).
- Cobertura ≥90% en las funciones nuevas de `server/services/credito.ts`
  (`creditosParaNotificar`, `construirMensajePush`).
- Ningún componente ni service importa Prisma directamente (ADR-000).
- `suscribirPush`/`eliminarSuscripcionPush` pasan por `withAuth`, rol
  GERENTE, dejan `AuditLog`.
- `/api/cron/creditos-vencidos` verificado en vivo: 401 sin `CRON_SECRET`
  correcto, 200 con el correcto, y un crédito real de prueba efectivamente
  notificado (push recibido en un navegador real) y marcado
  `notificacionVencidoEnviada = true` sin duplicarse en una segunda
  invocación el mismo día.
- Migración de `Credito.notificacionVencidoEnviada` aplicada en vivo contra
  Neon dev, `memory/modelo-datos.md` actualizado.
- `memory/decisiones-tecnicas.md` con D12 y D13 cerradas.
- `memory/estado-proyecto.md` actualizado con: resultado de la auditoría de
  performance, hallazgos del UAT, y el estado final de S13-21.
- `docs/manual-usuario.md` existente, con capturas reales.
- Cero `any`, cero `@ts-ignore` (CLAUDE.md).
- Toda mutación que toque más de una tabla, dentro de `prisma.$transaction`
  — no aplica ninguna transacción multi-tabla nueva este sprint (el cron
  hace un `updateMany` de una sola tabla; suscribir/eliminar push tocan
  solo `PushSubscription`).

## Estructura de archivos esperada
```
src/
  app/
    api/
      cron/
        creditos-vencidos/
          route.ts                     # nuevo
    (app)/
      creditos/
        page.tsx                       # modifica: + SuscripcionPushToggle
    sw.ts                               # modifica: + push, notificationclick
  components/domain/creditos/
    suscripcion-push-toggle.tsx        # nuevo
  server/
    actions/
      pushSubscription.ts              # nuevo
    repositories/
      pushSubscription.ts              # nuevo
      credito.ts                       # modifica: + funciones del cron
    services/
      credito.ts                       # modifica: + creditosParaNotificar, construirMensajePush
  lib/
    webPush.ts                         # nuevo
    zod/
      pushSubscription.ts              # nuevo
  proxy.ts                             # modifica: + /api/cron ruta pública
tests/
  e2e/
    login.spec.ts                      # nuevo
    pos-venta-contado.spec.ts          # nuevo
    pos-venta-credito-abono.spec.ts    # nuevo
    mortalidad-offline.spec.ts         # nuevo
    lote-alta-mudanza.spec.ts          # nuevo
  unit/services/
    credito.test.ts                    # modifica: + tests de las 2 funciones nuevas
docs/
  manual-usuario.md                    # nuevo
  img/                                 # nuevo, capturas reales
vercel.json                            # nuevo
playwright.config.ts                   # nuevo
prisma/
  schema.prisma                        # modifica: Credito.notificacionVencidoEnviada
  migrations/.../sprint16_credito_notificacion_vencido/  # nueva
memory/
  decisiones-tecnicas.md               # modifica: + D12, D13
  stack-tecnologico.md                 # modifica: Web Push real, Playwright instalado
  modelo-datos.md                      # modifica: campo nuevo de Credito
  estado-proyecto.md                   # modifica: auditoría, UAT, S13-21
```
