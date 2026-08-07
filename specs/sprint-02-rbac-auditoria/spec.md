# Sprint 2 — RBAC, auditoría y shell

> **Nota de actualización (post-cierre, sesión de diseño de frontend):** el
> esquema de rutas con prefijo compartido (`/gestion/*` para Gerente,
> `/operacion/*` para ambos roles) descrito en este documento **se
> abandonó** en favor de URLs planas por pantalla (`/usuarios`, sin
> prefijo) — decisión ya reflejada en el código real y documentada ahí
> mismo: ver el comentario en `server/auth/rbac.ts` (`RUTAS_POR_ROL`, regla
> por ruta exacta con `startsWith`, no por prefijo) y
> `components/layout/nav-items.ts`. Ese archivo es la fuente de verdad
> vigente — este spec.md queda como registro histórico de la intención
> original de Sprint 2; los escenarios Gherkin de abajo que mencionan
> `/gestion`/`/operacion` no reflejan las rutas reales del proyecto.

## Sprint Goal
Un Operario no puede acceder a ninguna ruta ni ejecutar ninguna acción
reservada al Gerente, y toda mutación de datos queda registrada en
`AuditLog` de forma automática — sin que cada Server Action tenga que
acordarse de escribirlo a mano.

## Contexto previo (leer antes de ejecutar)
- Sprint 1 quedó cerrado (commit `4cf67ee`) con Auth.js v5 + JWT, `SesionActiva`
  y `src/proxy.ts` ya funcionando — ver `memory/estado-proyecto.md`.
- `src/proxy.ts` **ya existe**, no se crea `middleware.ts`. Hoy hace dos cosas
  a mano dentro de `auth(async (req) => {...})`: (1) rate limiting Upstash
  para `/api/auth/*` y rutas operativas, (2) guard binario de sesión
  (redirect a `/login` si `!req.auth`). **No hay guard por rol todavía.**
- El JWT ya trae `token.rol`/`session.user.rol` embebido desde Sprint 1
  (`src/server/auth/config.ts`) — no hace falta tocar los callbacks `jwt`/
  `session` para tener el rol disponible en `proxy.ts`.
- **Hallazgo real al leer el código antes de planificar este sprint:** hoy
  nada en el código valida `SesionActiva.revocada` ni
  `estaExpiradaPorInactividad()` antes de ejecutar una Server Action. Esas
  dos funciones (`server/repositories/sesion.ts`, `server/services/sesion.ts`)
  solo se usan desde `logout()` y `registrarActividad()` — el cierre de
  sesión a los 30 min de inactividad hoy depende **enteramente** de un
  `setTimeout` en el cliente (`components/domain/auth/idle-timer.tsx`) que
  llama a `logout()`; si esa pestaña se queda en background (el navegador
  puede throttlear timers) o si un Gerente desactiva a un Operario con una
  sesión abierta, no hay ningún chequeo server-side que lo detecte hasta
  que esa misma pestaña decida llamar a `logout()` por su cuenta. `withAuth()`
  (H2 de este sprint) es lo que cierra ese hueco.
- `components/domain/auth/logout-button.tsx` está montado directo en
  `src/app/layout.tsx` desde S1-8 como placeholder explícito ("Placeholder
  mínimo hasta el shell real... de Sprint 2"). Este sprint lo reemplaza —
  no debe quedar duplicado (un logout en el Shell nuevo Y el botón viejo).
- Los modelos `AuditLog` y `SesionActiva` ya existen y están migrados desde
  Sprint 0 (`prisma/schema.prisma:53` y `:68`). Este sprint no debería
  necesitar tocar el schema salvo que aparezca un gap no previsto.
- Componentes shadcn instalados hoy: solo `button`, `card`, `input`, `label`
  (`src/components/ui/`). El CRUD de usuarios y el Shell van a necesitar
  más (tabla, select, algún overlay para el formulario, badge de estado) —
  se instalan en este sprint, no estaban en el alcance de Sprint 0/1.
- **Nota:** `CLAUDE.md` y `memory/estado-proyecto.md` referencian
  `memory/definition-of-done.md`, pero ese archivo **no existe** en el
  repo todavía (verificado antes de escribir esta spec). La verificación
  final de este sprint (`tasks.md`) usa como criterio lo que sí está
  confirmado en `CLAUDE.md` ("Reglas no negociables") y en el patrón ya
  aplicado en Sprint 1, hasta que ese archivo se cree.

## Decisión de diseño: dónde vive cada chequeo (rol / revocación / idle)
El roadmap y `memory/estado-proyecto.md` piden evaluar esto explícitamente,
no asumir que la restricción de Edge de `memory/arquitectura.md` (ADR-000)
sigue aplicando — `proxy.ts` corre en Node.js en Next 16.2.12, así que
**sí podría** consultar Prisma. Decisión tomada para este sprint:

- **Guard por rol → en `proxy.ts`.** Se resuelve leyendo `req.auth.user.rol`
  (ya viene en el JWT, sin tocar la base de datos). Barato, corre en cada
  navegación sin costo de conexión a Neon.
- **Revocación + idle-timeout → en `withAuth()`, no en `proxy.ts`.** Sí
  requieren leer `SesionActiva` en la base de datos. Consultar Neon en
  *cada* request que matchea el `matcher` de `proxy.ts` (todas las páginas,
  no solo las mutaciones) es un costo y un riesgo de conexión innecesario
  contra el plan gratuito (D6 en `decisiones-tecnicas.md`, ya se vio
  `P1017` en vivo durante Sprint 1). Las Server Actions son la única
  superficie que efectivamente muta datos — es ahí donde importa que la
  sesión no esté revocada/expirada, no en cada `GET` de navegación.
- **Consecuencia aceptada:** una sesión revocada (p. ej. un Operario
  desactivado mientras tenía una pestaña abierta) puede seguir *viendo*
  páginas ya renderizadas o navegar entre rutas de su rol un momento más,
  pero no puede ejecutar ninguna Server Action — `withAuth()` la corta ahí.
  Es el mismo tipo de trade-off que ya aceptó D6; se documenta acá como
  riesgo conocido, no como bug.

## Historias de usuario

### H1 — Guard por rol en `proxy.ts` (5 pts)
Como sistema quiero bloquear con `403` cualquier ruta de `(app)` que no
corresponda al rol de la sesión, para que un Operario nunca llegue ni
siquiera a renderizar una pantalla de Gerente.

```gherkin
Dado un Operario autenticado
Cuando intenta acceder a cualquier ruta bajo /gestion
Entonces recibe 403 (no un simple redirect silencioso)

Dado un Gerente autenticado
Cuando accede a una ruta bajo /gestion o /operacion
Entonces la petición continúa sin interrupción

Dado un Operario autenticado
Cuando accede a una ruta bajo /operacion o /dashboard
Entonces la petición continúa sin interrupción
```
**Asunción a confirmar con el Product Owner antes de ejecutar:** el Gerente
sí puede entrar a `/operacion/*` (visibilidad total, ver `memory/mision.md`
— "Gerente... necesita visibilidad total"); el Operario NO puede entrar a
`/gestion/*`. El roadmap dice "Operario no accede a nada de Gerente", no
al revés.

### H2 — `withAuth(action, { rol })` (8 pts)
Como desarrollador quiero un wrapper único que envuelva toda Server Action
mutable, para no repetir en cada action la verificación de sesión, rol,
validación Zod y escritura de auditoría. Es la pieza de mayor apalancamiento
del proyecto — todos los sprints siguientes la usan.

```gherkin
Dado que no hay sesión válida
Cuando se invoca una Server Action envuelta en withAuth
Entonces la acción no ejecuta su lógica y devuelve un error de "no autenticado"

Dado una sesión cuya SesionActiva tiene revocada = true
Cuando se invoca una Server Action envuelta en withAuth
Entonces la acción no ejecuta su lógica y devuelve un error de "sesión inválida"

Dado una sesión cuya SesionActiva lleva ≥30 min sin actividad (estaExpiradaPorInactividad)
Cuando se invoca una Server Action envuelta en withAuth
Entonces la acción no ejecuta su lógica, la sesión queda marcada revocada, y devuelve error

Dado un usuario autenticado con rol OPERARIO
Cuando invoca una Server Action configurada con { rol: "GERENTE" }
Entonces la acción no ejecuta su lógica y devuelve un error de "no autorizado"

Dado un input que no cumple el schema Zod configurado
Cuando se invoca la Server Action
Entonces la acción no ejecuta su lógica y devuelve los errores de validación

Dado que todas las verificaciones anteriores pasan
Cuando la lógica de la acción se ejecuta exitosamente
Entonces se crea un registro en AuditLog con usuarioId, entidad, entidadId,
  accion, estadoAntes/estadoDespues (si la acción los provee) e ip
```

### H3 — Servicio de auditoría (3 pts)
Como Gerente quiero que cada mutación relevante quede registrada para poder
reconstruir "quién hizo qué y cuándo" ante un descuadre o una disputa.
El modelo `AuditLog` ya existe desde Sprint 0 — esta historia es el
repository/service que `withAuth()` usa internamente (H2).

```gherkin
Dado que withAuth ejecuta exitosamente una acción configurada con
  entidad="Usuario" y accion="DESACTIVAR"
Cuando la acción termina
Entonces existe una fila en AuditLog con esa entidad, accion, el usuarioId
  de quien la ejecutó y timestamp de creadoEn

Dado que la propia escritura del AuditLog falla
Cuando eso ocurre
Entonces no se revierte la mutación de negocio ya confirmada (riesgo
  aceptado y documentado en plan.md, no bloqueante para este sprint)
```

### H4 — Shell por rol: Sidebar/BottomNav (8 pts)
Como Gerente u Operario quiero una navegación clara que solo muestre las
secciones de mi rol, y un logout accesible desde ahí — reemplazando el
botón placeholder que quedó suelto en `layout.tsx` desde Sprint 1.

```gherkin
Dado un Gerente autenticado
Cuando entra a la app
Entonces ve en la navegación los enlaces de /gestion y /operacion

Dado un Operario autenticado
Cuando entra a la app
Entonces ve en la navegación únicamente los enlaces de /operacion (y el
  dashboard si aplica), sin ningún enlace a /gestion

Dado cualquier usuario autenticado
Cuando busca cerrar sesión
Entonces lo hace desde el Shell (Sidebar o BottomNav), no desde el botón
  suelto que existía en layout.tsx antes de este sprint

Dado un viewport móvil (operario en campo)
Cuando navega la app
Entonces la navegación se muestra como BottomNav táctil (≥48px), no como
  sidebar de escritorio
```

### H5 — CRUD de usuarios (Gerente crea/edita/desactiva) (5 pts)
Como Gerente quiero dar de alta, editar y desactivar cuentas de Operario
para gestionar el acceso del personal sin tocar la base de datos a mano.

```gherkin
Dado que soy Gerente autenticado
Cuando creo un usuario con nombre de usuario, contraseña, nombre y rol
Entonces se crea con estado ACTIVO y su contraseña queda hasheada con bcrypt

Dado que soy Gerente autenticado
Cuando intento crear un usuario con un nombre de usuario ya existente
Entonces la acción falla con un error claro, sin crear una fila duplicada

Dado un usuario ACTIVO con sesiones abiertas
Cuando el Gerente lo desactiva
Entonces su estado pasa a INACTIVO Y todas sus SesionActiva no revocadas
  quedan revocadas de inmediato (no solo bloqueado en el próximo login)

Dado que soy Gerente autenticado
Cuando intento desactivar mi propio usuario
Entonces la acción es rechazada explícitamente

Dado que solo queda un Gerente ACTIVO en el sistema
Cuando alguien intenta desactivarlo (incluido él mismo)
Entonces la acción es rechazada — nunca puede quedar el sistema sin
  ningún Gerente activo

Dado un Operario autenticado
Cuando intenta invocar cualquier Server Action de gestión de usuarios
Entonces es rechazado por withAuth (rol GERENTE requerido), sin importar
  si llega desde la UI o de forma directa
```
**Decisión de alcance confirmada por el Product Owner (durante S2-7):** al
crear un usuario, el Gerente elige explícitamente el rol (GERENTE u
OPERARIO) — no queda fijo en OPERARIO como se había planteado
originalmente. Ampliación del alcance de este sprint respecto de la
redacción literal del roadmap ("crea/edita/desactiva Operarios"). La
Server Action de creación (S2-8) sigue exigiendo rol GERENTE para
invocarla, independientemente de qué rol se le asigne al usuario creado —
y las guards de H5 (no autodesactivarse, no dejar el sistema sin ningún
Gerente activo) siguen aplicando igual sobre usuarios con rol GERENTE.
También se incluye la posibilidad de que el Gerente **resetee la
contraseña** de un usuario dentro de "editar" (mismo patrón que Sprint 1
usó para "cambio de contraseña propia"), porque hoy no existe ningún otro
mecanismo de recuperación si alguien olvida su contraseña (la pantalla de
cambio de contraseña propia sigue fuera de alcance, ver Sprint 1).

### H6 — Tests de RBAC (3 pts)
Como equipo queremos evidencia automatizada de que un Operario no puede
alcanzar rutas ni acciones de Gerente, para no depender de verificación
manual en cada sprint futuro que agregue rutas de gestión.

```gherkin
Dado un Operario autenticado
Cuando hace una petición a una ruta bajo /gestion
Entonces proxy.ts responde 403 (test de integración)

Dado un Operario autenticado
Cuando invoca directamente una Server Action envuelta en withAuth con
  { rol: "GERENTE" } (sin pasar por la UI)
Entonces la acción devuelve error de autorización y no ejecuta su lógica
  (test de integración, no solo de UI)

Dado una SesionActiva revocada o expirada por inactividad
Cuando se invoca cualquier Server Action envuelta en withAuth
Entonces la acción es rechazada (test de integración de withAuth)
```

## Alcance de este sprint
- Guard por rol en `src/proxy.ts` (extiende el guard binario existente,
  no lo reemplaza).
- `withAuth(config, handler)` en `server/auth/` — auth + revocación/idle +
  rol + Zod + AuditLog automático.
- Repository + service de `AuditLog`.
- Shell: `Sidebar` (desktop) + `BottomNav` (mobile), filtrado por rol,
  con el logout integrado — reemplaza `logout-button.tsx` suelto en
  `layout.tsx`.
- Instalación de componentes shadcn adicionales necesarios (tabla, select,
  un overlay para formularios, badge).
- CRUD de usuarios: repository, service (con las guards de negocio de H5),
  Zod schemas, Server Actions vía `withAuth`, pantallas en
  `app/(app)/gestion/usuarios/`.
- Tests de integración de RBAC (proxy.ts + withAuth) y de las guards de
  negocio del CRUD de usuarios (autodesactivación, último Gerente).

## Fuera de alcance
- Pantalla de cambio de contraseña propia (autoservicio) — sigue fuera,
  igual que en Sprint 1.
- Gestión de sesiones activas visibles para el Gerente (ver todas las
  `SesionActiva` de un usuario, revocar una en particular desde la UI) —
  no está en el roadmap actual; H5 solo revoca automáticamente al
  desactivar, no expone una pantalla de sesiones.
- Separación de branches dev/main de Neon — riesgo operativo heredado de
  Sprint 1 (`memory/estado-proyecto.md`, sección "Riesgo operativo"), sigue
  sin ser responsabilidad de este sprint, pero se reitera como riesgo abajo
  porque este sprint sí crea/edita/desactiva usuarios reales.
- Cuenta real de Upstash (rate limiting sigue en modo "no configurado" —
  deuda heredada de Sprint 1, no se resuelve acá).

## Riesgos y notas
### R1 — proxy.ts en Node.js, no Edge (confirmado en Sprint 1)
Ver "Decisión de diseño" arriba — ya resuelto en el diseño de este sprint,
se deja la referencia acá porque `memory/estado-proyecto.md` lo pide
explícito como nota de riesgo.

### R2 — Neon compartido entre local y producción
`DATABASE_URL`/`DIRECT_URL` local apunta al mismo Neon que Vercel
producción (sin branches dev/main separados). Este sprint crea/edita/
desactiva usuarios reales por primera vez desde una UI (no solo el seed) —
**probar el CRUD de usuarios con cuidado**: un usuario de prueba creado en
local es visible en producción y viceversa. No usar nombres de usuario que
choquen con personal real de la granja durante las pruebas.

### R3 — Botón de logout placeholder debe desaparecer, no duplicarse
`components/domain/auth/logout-button.tsx` y su montaje directo en
`src/app/layout.tsx` (S1-8) se retiran de `layout.tsx` cuando el Shell
(H4) queda listo. El componente en sí puede reusarse *dentro* del Shell
si su diseño sirve, pero no debe quedar accesible desde dos lugares a la
vez.

### R4 — Revocación/idle sin aplicar server-side hoy (hallazgo de esta planificación)
Ver "Contexto previo" arriba. Antes de este sprint, ninguna acción valida
`SesionActiva.revocada` ni el idle-timeout server-side — depende
enteramente de un timer en el cliente. `withAuth()` (H2) es lo que cierra
este hueco; hasta que se complete, tratar esto como una deuda de seguridad
real heredada de Sprint 1, no una hipótesis.

### R5 — Cobertura de rutas nuevas bajo `(app)`
El Shell (H4) y el CRUD de usuarios (H5) son las primeras pantallas reales
bajo `app/(app)/gestion/` — hasta ahora esa carpeta no tenía contenido.
Verificar que el `matcher` de `proxy.ts` (ya ajustado en S1-6 para excluir
imágenes estáticas) siga sin bloquear ningún asset nuevo que el Shell
introduzca (iconos de `lucide-react` son componentes React, no assets de
`public/`, así que no debería aplicar, pero se deja como punto de
verificación explícito).

## Criterio de aceptación general
Dado el repo con Sprint 1 ya desplegado
Cuando un Operario autenticado intenta acceder a una ruta o ejecutar una
  Server Action reservada a Gerente (incluida cualquier ruta de gestión de
  usuarios)
Entonces es rechazado tanto a nivel de navegación (403 en proxy.ts) como a
  nivel de acción (withAuth), sin depender únicamente de que la UI oculte
  el enlace
Y toda Server Action que muta datos, ejecutada por cualquier rol, deja un
  registro en AuditLog con quién, qué entidad, qué acción y cuándo
Y el Gerente puede crear, editar y desactivar cuentas de Operario desde la
  UI, con las guards de negocio de H5 aplicadas
Y el botón de logout placeholder de Sprint 1 ya no existe suelto en
  layout.tsx — vive dentro del Shell nuevo
