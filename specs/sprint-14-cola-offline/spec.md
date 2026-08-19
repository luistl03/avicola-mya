# Sprint 14 — Cola offline y sincronización

## Sprint Goal
El Operario puede registrar Mortalidad, Bitácora y Recolección durante 4+
horas sin señal — cada guardado se encola localmente en vez de fallar — y al
recuperar señal la cola se sincroniza sola sin perder ni duplicar ningún
registro. Esto cierra textualmente el criterio de éxito explícito del
proyecto (`memory/mision.md`): *"El Operario puede trabajar 4+ horas sin
señal sin perder ni duplicar datos."*

**Dividido en 14A/14B** (37 pts, marcado ⚠️ ALTO RIESGO en
`specs/roadmap-completo.md`) — decisión de negocio 2 más abajo. Este
documento cubre el sprint completo; `tasks.md` distingue qué tareas son 14A
y cuáles 14B.

## Punto de partida real (confirmado leyendo código, no asumido)

- **Recolección (Sprint 5) y Consolidación (Sprint 7) ya cumplen el
  Contrato Offline-Ready completo** (`memory/convenciones.md`):
  `RegistroRecoleccion` y `RegistroConsolidacion` ya tienen
  `creadoEnCliente DateTime?` en `prisma/schema.prisma`, ya lo capturan en
  el cliente (`registrar-recoleccion-dialog.tsx`: `new Date()` al armar el
  payload) y ya lo persisten. Son la referencia de implementación de este
  sprint, no algo por construir de cero.
- **Mortalidad y Bitácora NO tienen `creadoEnCliente` todavía.** Su
  timestamp de servidor se llama `fecha` (no `creadoEn`) — `RegistroMortalidad.fecha`
  y `BitacoraGlobal.fecha`, ambos `DateTime @default(now())`. Este sprint
  agrega `creadoEnCliente DateTime?` a los dos modelos **sin renombrar
  `fecha`** — ver "Divergencia de nombre" en `plan.md` para el motivo.
- **Las 3 entidades ya tienen idempotencia por id de cliente** (auditoría
  post-Sprint 5, `memory/convenciones.md` sección "Idempotencia por id de
  cliente"): id generado una sola vez por apertura del diálogo, `create`
  con `id` explícito, `catch` de `P2002` que compara campos y devuelve el
  registro existente si coinciden o rechaza explícito si no. Este sprint
  **reutiliza esa lógica tal cual** — no la reimplementa.
- **El punto exacto donde la cola se engancha ya está marcado en el
  código**, dejado a propósito en Sprint 13: los 3 dialogs de campo
  (`registrar-mortalidad-dialog.tsx`, `nueva-nota-bitacora-dialog.tsx`,
  `registrar-recoleccion-dialog.tsx`) tienen un `try/catch` alrededor de la
  llamada a su Server Action que hoy solo devuelve
  `"Sin conexión. Guarda de nuevo cuando recuperes señal."` Ese `catch` es
  donde este sprint reemplaza el mensaje de error por un encolado real.
- **El Service Worker (Sprint 13, `src/app/sw.ts`) ya cachea las 3
  pantallas de campo** para que el Operario pueda NAVEGAR sin señal — capa
  distinta de este sprint, que resuelve que pueda GUARDAR sin señal. No se
  tocan las estrategias de caché existentes.
- **Ninguna de las 3 entidades tiene un campo `Decimal` en su payload de
  creación** (confirmado en `lib/zod/recoleccion.ts`, `mortalidad.ts`,
  `bitacora.ts`): `pesos` de Recolección son `number`, no hay montos. La
  cláusula del Contrato Offline-Ready sobre convertir `Decimal` a `string`
  antes de encolar (`memory/convenciones.md`) **no aplica a este sprint en
  la práctica** — se deja documentada la regla general en el schema de
  Dexie para cuando un módulo futuro con dinero (Egresos, Créditos) la
  necesite de verdad.
- **`/api/sync` ya está anticipado en `memory/arquitectura.md`** (árbol de
  carpetas, comentario `# cola offline (batch, idempotente)`) — este
  sprint es el que lo materializa.
- **Nada en el flujo de logout limpia `localStorage`/IndexedDB**
  (confirmado grepeando `server/actions/auth.ts` y `server/auth/index.ts`).
  IndexedDB está aislada por origen, no por sesión — la cola sobrevive un
  logout "gratis", sin código nuevo para eso específicamente. Sí hace falta
  verificarlo en vivo (tarea 14B, no asumirlo solo por la lectura de código).

## Decisiones de negocio confirmadas por el Product Owner

**1. Alcance — las 3 pantallas de campo.** La cola cubre Mortalidad,
Bitácora y Recolección. Las 3 comparten el mismo punto de enganche (el
`catch` ya marcado) y las 3 son parte del criterio de éxito del proyecto.

**2. División 14A/14B — por capacidad (básico vs. edge cases).**
- **14A** — cola local + interceptor de encolado + `POST /api/sync` camino
  feliz (batch idempotente, sin conflictos) + sincronización automática al
  reconectar, para las 3 pantallas. Al cerrar 14A, un Operario que pierde
  señal, guarda algo, y recupera señal, ve su registro sincronizado sin
  hacer nada.
- **14B** — pantalla de pendientes con reintento manual, errores
  permanentes visibles e indefinidos (nunca se descartan solos),
  verificación en vivo de que la cola sobrevive logout. Al cerrar 14B, el
  Operario tiene visibilidad y control total sobre lo que todavía no
  sincronizó.

**3. Conflictos (mismo id de cliente, datos distintos en el servidor al
sincronizar).** Se rechaza y queda en estado `ERROR` visible — mismo
comportamiento que ya implementan hoy las 3 Server Actions (`P2002` +
comparación campo a campo: si coincide, éxito idempotente silencioso; si
no coincide, error explícito). No hay lógica de merge nueva — dado que las
3 entidades son solo altas (nunca ediciones), un conflicto real de datos
solo puede pasar si algo manipuló el id fuera del flujo normal del
diálogo.

**4. Ventana de gracia offline — ancla a `fecha`/`creadoEn` (reloj del
servidor, al momento de sincronizar).** Mismo criterio que ya usan los 4
módulos existentes con ventana de 10 minutos (Mortalidad, Recolección,
Egresos, Personal) — **sin ningún caso especial para registros que
llegaron por la cola**. Como `fecha`/`creadoEn` son `@default(now())` al
`INSERT`, esto ya funciona así por construcción en cuanto `/api/sync`
inserte el registro: un Operario que capturó algo a las 9:58am sin señal y
recién sincroniza a las 10:15am tiene una ventana de gracia fresca de 10
minutos **desde las 10:15am**, no desde las 9:58am. No es una tarea de
código — es una decisión que confirma el comportamiento que ya existe, y
que se verifica en vivo (14A) en vez de asumirse.

**5. Pantalla de pendientes — visible a cualquier usuario autenticado en
ese dispositivo.** La cola vive en IndexedDB del navegador — es local al
dispositivo, no al rol. Gerente y Operario acceden por igual a las 3
pantallas de campo (`RUTAS_POR_ROL` no las restringe), así que quien esté
usando ese celular ve lo que ese celular tiene pendiente. Sincronización
automática al recuperar señal (14A) + botón de reintento manual (14B) —
mismo criterio de visibilidad que `ConnectivityIndicator` (Sprint 13, ya
visible a ambos roles).

**6. Errores permanentes — quedan en `ERROR` visible indefinidamente.** Sin
descarte automático tras N reintentos. El usuario decide a mano:
reintentar (si el problema ya se resolvió — ej. el lote fue reactivado) o
descartar con confirmación explícita. Nunca se pierde un dato en silencio
— mismo criterio que "nunca `DELETE` físico" del resto del proyecto. Cada
ítem de la cola se procesa de forma independiente: un error permanente en
un ítem no bloquea el envío de los demás.

**Riesgo aceptado y documentado, no resuelto este sprint — atribución de
autoría si cambia el usuario logueado entre capturar y sincronizar.** Como
la cola es del dispositivo y no del usuario, y `withAuth` usa el
`usuarioId` de la sesión **activa al momento de sincronizar** (no de quien
capturó el dato offline), un registro cargado por el Operario A sin señal
y sincronizado después de que el Operario B inició sesión en el mismo
celular queda auditado a nombre de B. Es un caso extremo (compartir
dispositivo entre turnos sin cerrar el que capturó los datos primero) y no
se resuelve en este sprint — queda documentado acá y en "Riesgos" más
abajo. Si en el futuro se vuelve un problema real, la solución es guardar
`usuarioId` en el ítem de la cola al encolar y que `/api/sync` lo respete
en vez de tomar el de la sesión activa — cambio de diseño no trivial,
fuera de alcance de este sprint.

## Historias de usuario

### 14A — camino feliz

#### H1 — Cola local en IndexedDB (Dexie) (5 pts)
**Como** Operario, **quiero** que lo que guardo sin señal quede resguardado
en mi celular, **para** no perderlo si cierro la pestaña o el navegador se
reinicia antes de recuperar señal.

```gherkin
Dado que estoy sin señal
Cuando guardo un registro de Mortalidad/Bitácora/Recolección
Entonces queda en IndexedDB con estado PENDIENTE
Y sigue ahí si cierro y vuelvo a abrir la app sin haber sincronizado
```

#### H2 — Migración: `creadoEnCliente` en Mortalidad y Bitácora (3 pts)
**Como** sistema, **quiero** que Mortalidad y Bitácora capturen el reloj
del celular igual que Recolección, **para** completar el Contrato
Offline-Ready en las 3 entidades que la cola va a manejar.

```gherkin
Dado un registro de Mortalidad o Bitácora nuevo
Cuando se crea, con o sin cola de por medio
Entonces guarda tanto creadoEnCliente (reloj del celular) como fecha (reloj del servidor)
```

#### H3 — Interceptor de fallo de red: encolar en vez de solo avisar (5 pts)
**Como** Operario, **quiero** que un guardado sin señal se guarde localmente
en vez de solo mostrarme un error, **para** no tener que recordar
reintentarlo a mano.

```gherkin
Dado que estoy sin señal
Cuando guardo un registro en cualquiera de las 3 pantallas de campo
Entonces veo una confirmación de que quedó guardado localmente (no un error)
Y el diálogo se cierra igual que un guardado exitoso online
```

#### H4 — `POST /api/sync`: batch idempotente sobre las Server Actions existentes (8 pts)
**Como** sistema, **quiero** un único endpoint que reciba un lote de ítems
pendientes y los procese reutilizando la validación/idempotencia/auditoría
que ya existe, **para** no duplicar lógica de negocio entre el flujo online
y el offline.

```gherkin
Dado un lote de ítems pendientes con ids distintos
Cuando se envían a POST /api/sync
Entonces cada ítem se procesa de forma independiente
Y un ítem que falla no impide que los demás se procesen
Y reenviar el mismo lote una segunda vez no duplica nada (mismo id de cliente)
```

#### H5 — Sincronización automática al recuperar señal (3 pts)
**Como** Operario, **quiero** que la cola se vacíe sola en cuanto vuelve la
señal, **para** no tener que acordarme de hacer nada.

```gherkin
Dado que tengo ítems PENDIENTE en la cola
Cuando el navegador dispara el evento "online"
Entonces la cola intenta sincronizar sin que yo toque nada
Y cada ítem pasa a OK o ERROR según el resultado real del servidor
```

### 14B — edge cases y visibilidad

#### H6 — Pantalla de pendientes + reintento manual (8 pts)
**Como** Gerente u Operario, **quiero** ver qué hay pendiente de sincronizar
en este dispositivo y poder forzar un reintento, **para** tener confianza
de que nada se quedó sin enviar.

```gherkin
Dado que tengo ítems PENDIENTE o ERROR en la cola de este dispositivo
Cuando abro la pantalla de pendientes
Entonces veo cada ítem con su tipo, estado y motivo si falló
Y puedo tocar "Reintentar" sin esperar al evento automático de reconexión
```

#### H7 — Errores permanentes visibles y descarte manual explícito (3 pts)
**Como** Gerente u Operario, **quiero** que un ítem que no puede
sincronizar (ej. el lote ya no existe) quede visible en vez de
desaparecer solo, **para** decidir yo qué hacer con ese dato.

```gherkin
Dado un ítem en estado ERROR por un motivo permanente
Cuando pasa el tiempo sin que yo haga nada
Entonces sigue visible en la pantalla de pendientes, sin descartarse solo
Cuando elijo "Descartar" y confirmo
Entonces el ítem desaparece de la cola local (nunca se descarta sin confirmación explícita)
```

#### H8 — Cola sobrevive logout (verificación, 2 pts)
**Como** Operario, **quiero** que cerrar sesión no borre lo que todavía no
sincronizó, **para** no perder datos por un logout accidental o al final de
un turno.

```gherkin
Dado que tengo ítems PENDIENTE en la cola
Cuando cierro sesión y alguien vuelve a iniciar sesión en el mismo dispositivo
Entonces los ítems PENDIENTE siguen en la cola
Y sincronizan con la sesión activa en ese momento (ver riesgo de atribución documentado arriba)
```

## Alcance de este sprint
- Cola local en IndexedDB (Dexie) para Mortalidad, Bitácora y Recolección.
- Interceptor de fallo de red en los 3 dialogs existentes.
- `POST /api/sync`, batch idempotente, reutiliza las Server Actions ya
  existentes sin duplicar su lógica.
- Migración de schema: `creadoEnCliente` en `RegistroMortalidad` y
  `BitacoraGlobal`.
- Sincronización automática al reconectar + pantalla de pendientes con
  reintento manual y descarte explícito de errores permanentes.

## Fuera de alcance (explícitamente)
- Cualquier pantalla que no sea Mortalidad, Bitácora o Recolección (POS,
  Créditos, Egresos no tienen cola offline en este sprint).
- Resolución de conflictos con merge/edición — las 3 entidades son solo
  altas, no hay flujo de edición offline que resolver.
- Cambiar la ventana de gracia de 10 minutos existente — este sprint
  confirma que ya funciona anclada a `fecha`/`creadoEn`, no la modifica.
- Resolver el riesgo de atribución de autoría entre cambio de sesión en un
  mismo dispositivo (documentado arriba, aceptado explícitamente).
- Notificaciones push de sincronización completada (eso es Sprint 16, Web
  Push).
- Cualquier cambio a las estrategias de caché del Service Worker
  (`src/app/sw.ts`) — la navegación offline de las 3 pantallas ya funciona
  desde Sprint 13, este sprint no la toca.

## Qué hereda Sprint 14 de Sprint 13
- Los 3 `catch` ya marcados con el comentario de "cola offline real es
  Sprint 14" en los 3 dialogs.
- El indicador de conectividad (`ConnectivityIndicator`,
  `useSyncExternalStore` sobre `navigator.onLine`/eventos `online`/
  `offline`) — el interceptor y la sincronización automática reutilizan el
  mismo mecanismo de detección, no uno nuevo.
- El Service Worker cacheando las 3 pantallas para que abran sin señal.

## Riesgos y notas

### R1 — `auth()` dentro de un Route Handler, no solo Server Actions
`withAuth` (`server/auth/with-auth.ts`) usa `headers()`/`auth()` de Next —
hasta ahora solo se invocó desde Server Actions. `/api/sync` es un Route
Handler (`app/api/sync/route.ts`), un contexto distinto. Auth.js v5 soporta
ambos, pero **se verifica en código real en la primera tarea de 14A**
(spike explícito en `tasks.md`), no se asume solo por leer la
documentación de Auth.js.

### R2 — Carga de escritura sobre Neon (plan gratuito, D6)
Un batch de sincronización después de varias horas offline puede traer
decenas de ítems de golpe. D6 (`memory/decisiones-tecnicas.md`) ya acepta
el riesgo del plan gratuito de Neon — este sprint lo mitiga parcialmente
procesando el batch en un único Route Handler (una sola conexión pooled
por lote, no una por ítem) y limitando el tamaño de lote por request (ver
"Tamaño de lote" en `plan.md`), pero no lo elimina. Vale la pena una
mención explícita en la tabla de riesgos del proyecto si el volumen real
de la granja crece.

### R3 — Verificación en dispositivo real, misma limitación que sprints anteriores
Igual que Sprint 13, la verificación de "4+ horas sin señal" real no se
puede automatizar por completo — se simula cortando red en DevTools/modo
avión y, si hace falta, con una espera real corta (no 4 horas literales)
más una revisión de que la lógica de ventana de gracia no depende de
tiempo transcurrido offline sino de `fecha`/`creadoEn` del servidor
(decisión 4).

### R4 — Atribución de autoría entre cambio de sesión (ver decisión de negocio, arriba)
Riesgo aceptado explícitamente, no resuelto este sprint.

## Criterio de aceptación general
- Los 3 dialogs de campo guardan sin señal sin mostrar un error — quedan
  encolados y sincronizan solos al recuperar señal.
- Reenviar el mismo ítem dos veces (doble sync, reintento manual sobre uno
  ya en OK) nunca duplica ni corrompe un registro.
- Un ítem con un error permanente queda visible indefinidamente hasta que
  el usuario decide reintentar o descartar explícitamente.
- La ventana de gracia de 10 minutos de Mortalidad/Recolección sigue
  funcionando igual para registros que llegaron por la cola, anclada al
  reloj del servidor al sincronizar.
- `npm run typecheck && npm run lint && npm test` en verde, cobertura
  100%/100% en cualquier `services`/`repositories` nuevo (siguiendo el
  estándar de Sprints 5-12).
- Ninguna migración rompe datos existentes — `creadoEnCliente` nace
  `NULL`-able en filas viejas, igual que `RegistroRecoleccion`/
  `RegistroConsolidacion`.
