# Sprint 16 — Push, hardening y UAT

## Sprint Goal
El Gerente recibe una notificación push real en su celular/navegador el día
que un crédito vence, sin depender de un cron externo de terceros ni de
entrar a mirar el dashboard. El proyecto queda además con cobertura E2E
automatizada de sus 5 flujos más críticos, una auditoría de performance
sobre las queries más pesadas, y una sesión de UAT real con el Gerente y el
Operario en campo, con manual de usuario. Es el último sprint del roadmap
(Release 4 — Inteligencia).

## Contexto previo — qué ya existe, qué no
Confirmado leyendo el código real antes de planificar, no asumido:

- **`PushSubscription` ya existe en el schema desde Sprint 0** (`usuarioId`,
  `endpoint` @unique, `p256dh`, `auth`, `creadoEn`, índice en `usuarioId`) —
  sin ningún código encima todavía (ni Server Action, ni repository, ni UI).
  Como `endpoint` es `@unique` pero no hay `@@unique([usuarioId])`, un mismo
  Usuario puede tener varias filas (varios dispositivos/navegadores) sin
  cambio de schema.
- **`Credito` está completo desde Sprint 11** (`fechaLimite`, `estado`,
  `montoTotal`, `montoPagado`) y `server/services/credito.ts` ya expone
  `calcularNivelAlerta()` con los 3 niveles reales (`POR_VENCER`,
  `VENCIDO_RECIENTE`, `VENCIDO_CRITICO`) y `resumirAlertasCredito()`, ya
  usados por `/creditos` y el dashboard. Este sprint reutiliza esa función
  tal cual — no inventa un cuarto nivel ni recalcula alertas con otro
  criterio.
- **`/creditos` (`src/app/(app)/creditos/page.tsx`) hoy NO está restringida
  a GERENTE** en `server/auth/rbac.ts` (`RUTAS_POR_ROL` no la lista) — está
  abierta a ambos roles, a diferencia de `/reportes`/`/egresos`/`/personal`.
  Importa para dónde vive el control de suscripción push (ver decisión de
  negocio 6 abajo).
- **Ninguna dependencia de Web Push instalada** (`package.json` confirmado:
  sin `web-push`, sin claves VAPID en ningún `.env` documentado).
- **`src/app/sw.ts` (Serwist, Sprint 13) no tiene ningún listener de
  `push`/`notificationclick` todavía** — solo cachea rutas y maneja el
  fallback offline.
- **No existe `vercel.json`** — ningún Cron Job configurado todavía, pese a
  que `memory/stack-tecnologico.md` ya menciona "Vercel Cron para jobs
  programados (detección de créditos vencidos)" como intención desde antes
  de este sprint.
- **`src/proxy.ts` protege por defecto cualquier ruta que no esté en su
  matcher de exclusión ni sea `/login`** (`if (!req.auth && !esRutaPublica)
  → redirect a /login`). Una llamada de Vercel Cron a `/api/cron/...` NO
  trae cookie de sesión — sin un ajuste explícito, el propio guard de
  sesión bloquearía el cron antes de que llegue a su propia validación por
  `CRON_SECRET`. Este es un hallazgo real de este sprint, no estaba anotado
  en el roadmap.
- **Playwright no está instalado** (confirmado en `package.json`) — ya
  estaba "decidido" a nivel de librería en `memory/stack-tecnologico.md`
  desde antes de Sprint 0 (sin número de decisión, es parte del stack base
  documentado desde el inicio), pero la instalación y el diseño de contra
  qué corre son 100% de este sprint.
- **`memory/definition-of-done.md` sigue sin existir** — mismo criterio que
  Sprints 3-15: `CLAUDE.md` + la sección "Definition of Done" de `plan.md`
  son el DoD efectivo del proyecto.

## Contexto obligatorio ya releído antes de escribir esta spec
`CLAUDE.md`, `memory/mision.md` (Gerente necesita "visibilidad total:
finanzas, créditos vencidos" — Operario no gestiona cobranza),
`memory/estado-proyecto.md` completo (cierre de Sprint 15 en la misma
fecha de hoy, 2026-08-20; S13-21 — verificación en iPhone real — sigue
pendiente, confirmado explícitamente con el Product Owner en esta sesión),
`memory/stack-tecnologico.md` (Playwright y Web Push ya mencionados como
intención, sin instalar), `memory/arquitectura.md` (ADR-000: solo
`repositories/` toca Prisma; librerías de integración externa sin Prisma —
como Upstash en `lib/rate-limit.ts` — viven en `lib/`, no en
`services/`/`repositories/`, precedente que este sprint sigue para
`lib/webPush.ts`), `memory/convenciones.md` (Server Actions vía `withAuth`;
`idUuid()` para cualquier id nuevo; nunca `DELETE` físico en **entidades de
negocio** — `PushSubscription` no lo es, es infraestructura técnica de
notificación, mismo criterio implícito que ya trata `SesionActiva` como
registro técnico, aunque esa sí usa revocación en vez de borrado por tener
valor de auditoría; una `PushSubscription` muerta no tiene ese valor, se
borra), `memory/decisiones-tecnicas.md` (D1-D11 cerradas, no se reabren),
`memory/definition-of-ready.md`, `specs/roadmap-completo.md` (sección
Sprint 16), `specs/sprint-11-creditos-cobranza/spec.md` (confirma que Push/
cron quedaron fuera de alcance a propósito, "Sprint 16" mencionado dos
veces). También se releyó el código real de `prisma/schema.prisma`
(`PushSubscription`, `Credito`), `src/server/services/credito.ts`,
`src/server/auth/with-auth.ts`, `src/server/auth/rbac.ts`, `src/proxy.ts`,
`src/app/sw.ts`, `package.json`, y la estructura de
`src/app/(app)/creditos/` y `src/components/domain/creditos/`.

## Decisiones confirmadas por el Product Owner
Siete preguntas explícitas vía `AskUserQuestion` antes de cerrar esta
spec — el roadmap describe el alcance pero deja abiertos varios puntos que
bloquean el diseño (mismo criterio de "preguntar antes de comprometerse a
un plan" que ya usó Sprint 15):

1. **Plan de Vercel: Hobby.** El cron queda limitado a 1 ejecución diaria
   por job — coincide exactamente con "cron diario" del roadmap, sin
   necesidad de ajustar el alcance por esta restricción.
2. **Playwright corre contra Neon dev real**, mismo criterio que el resto
   del proyecto usa para "verificación en vivo" — se cierra como **D12**
   en `memory/decisiones-tecnicas.md` (a agregar en la primera tarea de
   ejecución de H5, mismo patrón que D8 en Sprint 15). Riesgo aceptado:
   cada corrida crea/muta datos reales; mitigado en el diseño de los tests
   (ver `plan.md`, "Aislamiento de datos de prueba").
3. **Auditoría de performance:** un fix chico (índice, ajuste puntual de
   query) se corrige en este mismo sprint; cualquier cosa más grande
   (rediseño de query, N+1) se documenta como deuda en
   `memory/estado-proyecto.md` para un sprint futuro — no se permite que
   la auditoría por sí sola infle los 32 pts.
4. **S13-21 (verificación en iPhone real) sigue pendiente, y queda
   pendiente indefinidamente por decisión explícita del Product Owner**
   (revisión post-planificación, misma fecha): no hay dispositivo iPhone
   disponible, se retoma más adelante si consiguen uno. Deja de ser
   dependencia de H7 — no se intenta resolver dentro de este sprint ni se
   agenda como parte del UAT. No bloquea el cierre de Sprint 16.
5. **Evento que dispara el push: un solo aviso por crédito, en el momento
   exacto en que pasa a `VENCIDO_RECIENTE`** (el día que cruza
   `fechaLimite`, mismo umbral que ya usa `calcularNivelAlerta`). No hay
   push preventivo (`POR_VENCER`) ni escalonado en `VENCIDO_CRITICO` — un
   evento por crédito, simple de hacer idempotente.
6. **Destinatarios: todo Usuario con rol GERENTE que tenga una
   `PushSubscription` activa.** La suscripción es una funcionalidad
   exclusiva de GERENTE — aunque `/creditos` (el corolario de diseño 1,
   abajo) sigue abierta a ambos roles como hoy, el control de "Activar
   notificaciones" solo se renderiza para sesión GERENTE.
7. **5° flujo E2E: Alta y mudanza de un Lote.** El roadmap sugería "cierre
   de un sprint contable" — no existe ninguna feature con ese nombre en el
   código (el "Cierre" de Sprint 9 es cerrar una venta del POS, ya cubierto
   por el flujo de venta). Los 5 flujos quedan: Login, POS venta al
   contado, POS venta a crédito + abono, Mortalidad/Recolección con cola
   offline, Alta y mudanza de Lote.

**Corolarios de diseño documentados acá, no vueltos a preguntar** (mismo
criterio que los "corolarios" de Sprints 3/13/15):

1. El control de suscripción push vive dentro de `/creditos` (ruta
   existente, sin crear una pantalla nueva de "Configuración" que el
   roadmap no pide), pero **renderizado condicionalmente solo para
   `session.user.rol === "GERENTE"`** — mismo patrón que las secciones
   GERENTE-only del dashboard de Sprint 15 (S15-35).
2. **Limpieza de `PushSubscription` caducada: `DELETE` físico**, no
   soft-delete. No es una entidad de negocio (no aparece en ningún reporte,
   no tiene valor de auditoría una vez que el navegador la revocó) —
   re-suscribirse desde el mismo navegador simplemente crea una fila nueva
   con un `endpoint` distinto.
3. **Idempotencia del cron: campo nuevo `Credito.notificacionVencidoEnviada
   Boolean @default(false)`.** Migración aditiva, no destructiva, mismo
   patrón que `Egreso.revertido` (Sprint 12). Se evaluó resolverlo sin
   migración (filtrar por "el crédito venció exactamente ayer"), pero eso
   no protege contra un reintento del propio cron el mismo día (posible en
   Hobby, sin garantía de ejecución única) — el campo lo hace robusto sin
   ambigüedad.
4. **Entrega best-effort, no garantizada:** si el envío a una
   `PushSubscription` falla por un motivo transitorio (no 404/410), el
   crédito igual queda marcado como notificado en ese ciclo del cron — no
   hay reintento al día siguiente para ese mismo crédito. Aceptado como
   riesgo bajo (mismo criterio de riesgo aceptado que D6): el push es un
   canal de conveniencia, el Gerente sigue viendo el crédito vencido en el
   dashboard y en `/creditos` de todas formas.
5. **Librería de envío: `web-push` (Node, MIT)** — estándar de facto del
   ecosistema para VAPID/Web Push desde un backend Node, sin alternativa
   real más liviana. Se cierra como **D13** en
   `memory/decisiones-tecnicas.md` (primera tarea de ejecución de H1/H2).
6. **`/api/cron/creditos-vencidos` no usa `withAuth`** (no hay sesión de
   usuario en una llamada de Vercel Cron) — se autentica con un secreto
   compartido (`CRON_SECRET`, env var) contra el header `Authorization:
   Bearer <CRON_SECRET>` que Vercel agrega automáticamente a sus
   invocaciones de Cron Jobs cuando esa env var está configurada. Requiere
   agregar esta ruta a la lista de rutas públicas de `src/proxy.ts` (hoy
   solo `/login` lo es) — sin esto, el guard de sesión del proxy
   redirigiría el cron a `/login` antes de que la propia ruta pueda
   verificar `CRON_SECRET`. Hallazgo real de este sprint, no estaba en el
   roadmap.
7. **Ejecución de Playwright: manual/local por ahora, no integrado a
   GitHub Actions.** Correr E2E automáticamente en cada PR contra Neon dev
   real (decisión de negocio 2) arriesgaría interferir con sesiones de
   prueba manual del Product Owner en cualquier momento — se documenta
   como fuera de alcance explícito (ver abajo), a evaluar en un sprint
   futuro si el Product Owner lo pide.

## Historias de usuario

### H1 — Suscripción push desde el navegador (5 pts)
Como Gerente quiero activar notificaciones push desde mi navegador, para
recibir avisos de créditos vencidos sin depender de entrar a la app.

```gherkin
Dado que soy Gerente autenticado, mi navegador soporta Push API/Service
  Worker, y todavía no tengo una suscripción activa en este navegador
Cuando entro a `/creditos` y toco "Activar notificaciones"
Entonces el navegador me pide permiso de notificaciones y, al aceptar, se
  registra una PushSubscription (endpoint/p256dh/auth) asociada a mi
  usuario

Dado que ya tengo una suscripción activa en este navegador
Cuando entro a `/creditos`
Entonces el botón refleja el estado real ("Notificaciones activadas", no
  "Activar"), consultado desde pushManager.getSubscription(), no desde un
  flag propio del servidor

Dado que soy Operario
Cuando entro a `/creditos`
Entonces no veo ningún control de suscripción push — feature exclusiva de
  GERENTE (corolario de diseño 1), aunque `/creditos` sigue abierta a
  ambos roles

Dado que el navegador o el usuario rechaza el permiso de notificaciones
Cuando intento activar
Entonces veo un mensaje claro explicando que quedaron bloqueadas
  (revisar permisos del navegador/sitio), no un error genérico

Dado que ya tengo notificaciones activadas y quiero desactivarlas
Cuando toco "Desactivar notificaciones"
Entonces la suscripción se cancela en el navegador
  (pushManager.unsubscribe()) y se elimina la fila PushSubscription
  correspondiente en el servidor
```

### H2 — Notificación push al vencer un crédito (8 pts)
Como Gerente suscrito quiero recibir un push el día que un crédito pasa a
vencido, para actuar sin depender de entrar a mirar el dashboard.

```gherkin
Dado un Credito PENDIENTE cuya fechaLimite hace que hoy calcularNivelAlerta
  lo marque VENCIDO_RECIENTE por primera vez, y notificacionVencidoEnviada
  = false
Cuando corre el cron diario
Entonces se envía un push a cada PushSubscription de un Usuario GERENTE con
  estado ACTIVO, con el nombre del cliente y el saldo pendiente, y el
  Credito queda con notificacionVencidoEnviada = true

Dado un Credito ya marcado como notificado (notificacionVencidoEnviada =
  true)
Cuando el cron corre otra vez ese mismo día (reintento) o al día siguiente
Entonces no se envía un push duplicado por ese mismo crédito

Dado un Credito todavía POR_VENCER, o LIQUIDADO
Cuando corre el cron
Entonces no se considera para notificación — solo VENCIDO_RECIENTE recién
  cruzado (decisión de negocio 5)

Dado que ningún Usuario GERENTE tiene una PushSubscription activa
Cuando el cron detecta un crédito recién vencido
Entonces igual marca ese crédito como notificado, sin reintentar en días
  siguientes (corolario de diseño 4, entrega best-effort)

Dado una petición a `/api/cron/creditos-vencidos` sin el header
  `Authorization: Bearer <CRON_SECRET>` correcto
Cuando llega al servidor
Entonces se rechaza con 401, sin ejecutar ninguna consulta ni envío
```

### H3 — Limpieza de suscripciones caducadas (2 pts)
Como sistema quiero eliminar las PushSubscription que el navegador ya
revocó, para no seguir intentando enviarles push ni ensuciar la tabla.

```gherkin
Dado una PushSubscription cuyo endpoint el navegador del Gerente ya
  invalidó (desinstaló el sitio, borró datos del navegador, etc.)
Cuando el cron intenta enviarle un push y el servicio de push devuelve 404
  o 410
Entonces esa fila de PushSubscription se elimina de la base

Dado un error de envío distinto de 404/410 (timeout, 5xx transitorio)
Cuando ocurre
Entonces la suscripción NO se elimina — podría ser un fallo temporal, no
  una revocación real
```

### H4 — Cron diario en Vercel (3 pts)
Como sistema quiero un job programado que revise créditos vencidos una vez
al día, para no depender de que alguien entre a mirar el dashboard.

```gherkin
Dado el proyecto desplegado en Vercel (plan Hobby, 1 ejecución diaria por
  cron job)
Cuando se agrega `vercel.json` con un cron contra
  `/api/cron/creditos-vencidos`
Entonces Vercel invoca ese endpoint automáticamente una vez al día, en el
  horario configurado (08:00 América/Lima)

Dado que el cron corre
Cuando decide qué créditos notificar
Entonces reutiliza `calcularNivelAlerta()` de `server/services/credito.ts`
  — no duplica el criterio de niveles de alerta en un archivo nuevo

Dado que `src/proxy.ts` protege por defecto cualquier ruta sin sesión
Cuando Vercel Cron llama a `/api/cron/creditos-vencidos` (sin cookie de
  sesión)
Entonces la petición NO es redirigida a `/login` — la ruta está excluida
  del guard de sesión, y su propia verificación de CRON_SECRET la protege
```

### H5 — E2E Playwright: 5 flujos críticos (8 pts)
Como equipo quiero cobertura E2E automatizada de los flujos más críticos,
para detectar regresiones reales de extremo a extremo antes de un deploy.

```gherkin
Dado Playwright instalado y configurado contra Neon dev real (D12)
Cuando corro `npx playwright test`
Entonces los 5 flujos siguientes pasan en verde:
  1. Login: credenciales válidas de Gerente → llego al dashboard con sesión
     activa; credenciales inválidas → mensaje de error, sin sesión
  2. POS venta al contado: agrego productos al carrito, cierro con
     EFECTIVO → el inventario se descuenta y se genera un comprobante
  3. POS venta a crédito + abono: cierro una venta a crédito para un
     cliente registrado, luego registro un abono desde `/creditos` → el
     saldo pendiente se actualiza correctamente
  4. Mortalidad con cola offline: con el contexto de red del navegador
     forzado a offline, registro mortalidad → la operación se encola en
     IndexedDB; al restaurar la red, se sincroniza sola
  5. Alta y mudanza de Lote: doy de alta un lote en un galpón con
     capacidad, lo mudo a otro galpón → HistorialUbicacionLote refleja el
     cambio (fila vieja cerrada, fila nueva abierta)

Dado que los 5 flujos corren contra Neon dev real
Cuando terminan (pasen o fallen)
Entonces cada flujo limpia los datos que creó (o los deja identificables
  con un prefijo de prueba), para no ensuciar el ambiente compartido con
  el Product Owner
```

### H6 — Auditoría de performance (EXPLAIN ANALYZE) (3 pts)
Como equipo quiero auditar las queries de mayor riesgo del proyecto, para
confirmar que no queda otro índice faltante como el de Sprint 15.

```gherkin
Dado las queries identificadas como de mayor riesgo (Galpones/Lotes con
  joins anidados, Ventas con 3 relaciones + count, y cualquier otra que
  aparezca al revisar server/repositories/*.ts completo)
Cuando se corre EXPLAIN ANALYZE contra Neon dev con volumen real
Entonces se documenta el plan de ejecución de cada una (seq scan vs. index
  scan) en memory/estado-proyecto.md

Dado que una query muestra un problema resoluble con un índice o un ajuste
  puntual
Cuando se detecta
Entonces se corrige en este mismo sprint, con migración si hace falta

Dado que una query muestra un problema mayor (rediseño, N+1 real)
Cuando se detecta
Entonces se documenta como deuda técnica explícita en
  memory/estado-proyecto.md, sin tocar código de negocio en este sprint
  (decisión de negocio 3)
```

### H7 — UAT en campo + manual de usuario (3 pts)
Como Product Owner quiero validar la app completa con el Gerente y el
Operario en campo, y contar con un manual de usuario, para confirmar que
el sistema reemplaza de verdad el cuaderno físico (mision.md).

```gherkin
Dado la app desplegada y estable (Sprints 0-15 + este sprint)
Cuando el Gerente y el Operario siguen un guion de prueba guiado (ver
  "Guion de UAT" en plan.md)
Entonces cada hallazgo real (bug o mejora pedida) se documenta en
  memory/estado-proyecto.md, igual que el resto de sesiones de
  verificación en vivo del proyecto

Dado que S13-21 (verificación en iPhone real) no tiene dispositivo
  disponible (decisión del Product Owner, post-planificación)
Cuando se organiza el UAT
Entonces NO se agenda como parte de esta sesión — queda como deuda de
  largo plazo sin fecha, documentada en memory/, sin bloquear el cierre de
  Sprint 16

Dado el manual de usuario
Cuando se entrega
Entonces es un archivo Markdown en el repo (docs/manual-usuario.md), con
  capturas reales de la app ya desplegada, sin depender de herramientas de
  diseño externas ni de un PDF generado aparte
```

## Alcance de este sprint
- `memory/decisiones-tecnicas.md`: **D12** (Playwright contra Neon dev
  real) y **D13** (`web-push`) nuevas.
- `memory/stack-tecnologico.md`: sección "Web Push (VAPID)" pasa de
  "sin instalar" a real; sección "Testing" confirma Playwright instalado.
- Dependencias nuevas: `web-push` (+ `@types/web-push`), `@playwright/test`.
- Migración de schema: `Credito.notificacionVencidoEnviada Boolean
  @default(false)` (aditiva, no destructiva).
- `lib/webPush.ts` (nuevo) — wrapper de `web-push`, mismo criterio que
  `lib/rate-limit.ts` para Upstash.
- `lib/zod/pushSubscription.ts` (nuevo).
- `server/repositories/pushSubscription.ts` (nuevo).
- `server/repositories/credito.ts`: agrega funciones de lectura/escritura
  para el cron.
- `server/services/credito.ts`: agrega función pura de decisión (qué
  créditos notificar), reutilizando `calcularNivelAlerta`.
- `server/actions/pushSubscription.ts` (nuevo) — `suscribirPush`,
  `eliminarSuscripcionPush`, ambas vía `withAuth`, rol GERENTE.
- `src/app/api/cron/creditos-vencidos/route.ts` (nuevo, Route Handler GET).
- `vercel.json` (nuevo) — configuración del Cron Job.
- `src/proxy.ts`: `/api/cron` se agrega a las rutas públicas (sin guard de
  sesión) — su propia verificación de `CRON_SECRET` la protege.
- `src/app/sw.ts`: agrega `self.addEventListener("push", ...)` y
  `self.addEventListener("notificationclick", ...)`.
- `components/domain/creditos/suscripcion-push-toggle.tsx` (nuevo, Client
  Component, renderizado solo para GERENTE) + integración en
  `src/app/(app)/creditos/page.tsx`.
- Env vars nuevas: `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `@playwright/test` instalado + `playwright.config.ts` + `tests/e2e/*.spec.ts`
  (5 archivos, uno por flujo).
- Auditoría de performance: sin archivo de código nuevo garantizado — el
  resultado depende de lo que se encuentre (ver H6); cualquier migración de
  índice que salga de acá se documenta igual que la de Sprint 15.
- `docs/manual-usuario.md` (nuevo).
- `memory/estado-proyecto.md`: se actualiza con hallazgos del UAT, la
  auditoría de performance, y el cierre (o no) de S13-21.

## Fuera de alcance (explícitamente)
- **Notificaciones push para cualquier otro evento** (mortalidad alta,
  producción baja, etc.) — el roadmap solo pide créditos vencidos.
- **Recordatorio preventivo (`POR_VENCER`) o escalonado
  (`VENCIDO_CRITICO`)** — decisión de negocio 5, un solo push por crédito.
- **Retry automático de push fallidos al día siguiente** — corolario de
  diseño 4, entrega best-effort.
- **Playwright integrado a GitHub Actions/CI** — corolario de diseño 7,
  ejecución manual/local por ahora contra Neon dev real.
- **Cambiar el plan de Vercel a Pro** — se diseña explícitamente para
  Hobby (decisión de negocio 1); si el Product Owner decide pagar el
  upgrade más adelante, es una decisión nueva, no asumida acá.
- **Rediseño de queries que la auditoría de performance encuentre más allá
  de un fix chico** — decisión de negocio 3, queda como deuda documentada.
- **Cualquier cambio a la lógica de negocio de Créditos/Cobranza** más allá
  del campo `notificacionVencidoEnviada` — Sprint 11 sigue siendo la fuente
  de verdad del modelo de negocio.
- **Manual de usuario en PDF o con herramienta de diseño externa** —
  Markdown en el repo, decisión explícita de H7.

## Riesgos y notas

### R1 — Precisión del cron en Vercel Hobby
El plan Hobby no garantiza el minuto exacto de ejecución (puede correr
dentro de una ventana alrededor del horario configurado) ni descarta un
reintento en caso de fallo. Mitigado por diseño: `notificacionVencidoEnviada`
hace la lógica idempotente sin importar cuántas veces corra el mismo día,
y `calcularNivelAlerta` trabaja a nivel de día calendario (D5, América/Lima),
no de minuto exacto.

### R2 — Entrega best-effort de push (corolario de diseño 4)
Riesgo aceptado explícitamente, mismo criterio que D6: el push es un canal
de conveniencia, no la única fuente de verdad — el Gerente sigue viendo el
crédito vencido en el dashboard y en `/creditos`.

### R3 — E2E contra Neon dev real puede interferir con pruebas manuales del Product Owner
Mitigado corriendo los 5 flujos manualmente (no en cada push/PR, ver
corolario de diseño 7) y limpiando los datos de prueba que cada flujo crea
(ver `plan.md`, "Aislamiento de datos de prueba").

### R4 — Web Push en iOS/Safari depende de que la PWA esté instalada
Safari solo soporta Web Push para sitios agregados a la pantalla de inicio
(instalados como PWA), no en pestañas normales del navegador — conecta
directo con S13-21 (verificación en iPhone real, todavía pendiente). Si el
Gerente usa iPhone y no tiene la PWA instalada, "Activar notificaciones"
puede fallar o no estar disponible; se documenta como limitación conocida,
no como bug — S13-21 queda como deuda de largo plazo, sin dispositivo
disponible para verificarlo por ahora (decisión del Product Owner).

### R5 — Paso operativo antes del primer deploy: generar y cargar las claves VAPID
`web-push.generateVAPIDKeys()` se corre una sola vez (script local,
descartable); las 4 env vars resultantes (`VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) y
`CRON_SECRET` (un valor aleatorio propio, no generado por ninguna
librería) se cargan en Vercel (Production + Preview) antes de que el
primer deploy de este sprint pueda funcionar en producción — igual que
Upstash en Sprint 1/2.

## Criterio de aceptación general
Dado el repo con Sprint 15 ya desplegado
Cuando un Gerente activa notificaciones desde `/creditos`, un crédito real
  cruza a `VENCIDO_RECIENTE`, y corre el cron (manual o programado)
Entonces ese Gerente recibe un push real en su navegador con el cliente y
  el monto pendiente, y el crédito no vuelve a notificarse
Y un Operario no ve ningún control de suscripción push en `/creditos`
Y `npx playwright test` pasa en verde para los 5 flujos críticos contra
  Neon dev real, sin dejar datos de prueba huérfanos
Y la auditoría de performance deja documentado el plan de ejecución de las
  queries de mayor riesgo, con cualquier fix chico ya aplicado y cualquier
  hallazgo mayor documentado como deuda
Y el Gerente y el Operario completaron el guion de UAT, con feedback real
  documentado en `memory/estado-proyecto.md`
Y existe `docs/manual-usuario.md` con capturas reales de la app desplegada
Y `npm run typecheck && npm run lint && npm test` en verde, cobertura ≥90%
  en las funciones puras nuevas de `server/services/credito.ts`
