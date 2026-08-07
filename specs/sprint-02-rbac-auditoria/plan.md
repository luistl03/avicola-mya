# Plan técnico — Sprint 2

> **Nota de actualización (post-cierre):** el esquema de rutas con prefijo
> (`/gestion`, `/operacion`) planeado acá se reemplazó por URLs planas
> (`/usuarios`) antes de cerrar el sprint — ver el comentario en
> `server/auth/rbac.ts` para el motivo y el mapeo real vigente. Este plan
> queda como registro de la intención original, no como referencia de las
> rutas actuales.

## Punto de partida real del código (verificado antes de planificar)
- `src/proxy.ts` hoy: rate limiting Upstash + guard binario de sesión
  (`!req.auth` → redirect a `/login`). El JWT ya trae `rol` en
  `req.auth.user.rol` (`src/server/auth/config.ts`, callback `session`).
  No hay guard por rol.
- `server/repositories/sesion.ts` expone `buscarSesionPorJti`,
  `actualizarUltimaActividad`, `revocarSesion` (todas por `jti`, no por
  `usuarioId`) y `crearSesion`. **No existe** una función para revocar
  *todas* las sesiones de un `usuarioId` (necesaria para H5 — desactivar
  usuario debe revocar sus sesiones abiertas). Se agrega en este sprint.
- `server/services/sesion.ts` expone `estaExpiradaPorInactividad` y
  `debeMostrarAvisoIdle`, puras, ya testeadas (`tests/unit/services/sesion.test.ts`).
  `withAuth()` las reutiliza tal cual, no las reimplementa.
- No existe ningún repository/service de `Usuario` más allá de
  `buscarUsuarioPorUsuario` (usado solo por el login). No existe
  `server/repositories/auditLog.ts` ni ningún wrapper `withAuth`.
- `src/components/ui/` solo tiene `button`, `card`, `input`, `label`.
  `components.json` existe (shadcn ya inicializado en Sprint 0) — agregar
  componentes es `npx shadcn@latest add <componente>`, no escribirlos a mano.
- `src/app/layout.tsx` monta `LogoutButton` e `IdleTimer` condicionados a
  `session` — el Shell nuevo reemplaza el bloque de `LogoutButton`, el
  `IdleTimer` se mantiene tal cual (no es parte de este sprint).

## Diseño de `withAuth()` — la pieza central del sprint

### Firma propuesta
```ts
// server/auth/with-auth.ts
type WithAuthConfig<TInput> = {
  schema: ZodType<TInput>;
  rol?: Rol | Rol[];          // ausente = cualquier usuario autenticado
  entidad: string;             // para AuditLog, p. ej. "Usuario"
  accion: string;              // para AuditLog, p. ej. "CREAR" | "DESACTIVAR"
};

type HandlerCtx = { usuarioId: string; rol: Rol };

type HandlerResult<TOutput> = {
  data: TOutput;
  entidadId: string;           // fila afectada, para AuditLog.entidadId
  estadoAntes?: unknown;       // opcional — solo si el caller lo provee
  estadoDespues?: unknown;
};

type ActionResult<TOutput> =
  | { ok: true; data: TOutput }
  | { ok: false; error: string; campos?: Record<string, string[]> };

function withAuth<TInput, TOutput>(
  config: WithAuthConfig<TInput>,
  handler: (input: TInput, ctx: HandlerCtx) => Promise<HandlerResult<TOutput>>
): (rawInput: unknown) => Promise<ActionResult<TOutput>>
```

### Orden de verificación dentro de `withAuth` (todas antes de tocar `handler`)
1. `auth()` — si no hay sesión, `{ ok: false, error: "No autenticado" }`.
2. `buscarSesionPorJti(session.sesionId)` — si no existe o `revocada`,
   `{ ok: false, error: "Sesión inválida" }`.
3. `estaExpiradaPorInactividad(sesion.ultimaActividad, new Date())` — si es
   `true`, llamar `revocarSesion()` (limpieza) y devolver el mismo error
   que revocada. Esto es lo que cierra el hueco descrito en R4 de
   `spec.md`: aunque el `IdleTimer` del cliente no haya disparado el
   logout todavía, la próxima Server Action lo corta igual.
4. Rol — si `config.rol` está definido y `session.user.rol` no está
   incluido, `{ ok: false, error: "No autorizado" }`. Esto es
   **independiente** del guard de `proxy.ts` (H1): una Server Action puede
   invocarse sin pasar por una navegación de página, así que no puede
   confiar en que `proxy.ts` ya filtró la ruta.
5. `config.schema.safeParse(normalizar(rawInput))` — `normalizar` convierte
   `FormData` a objeto plano si `rawInput instanceof FormData` (mismo
   patrón manual que ya usa `server/actions/auth.ts` para `login`), o lo
   deja igual si ya es un objeto. Si falla, devuelve los errores de campo.
6. Ejecuta `handler(input, { usuarioId, rol })`.
7. Si el handler no lanza, escribe `AuditLog` (servicio de H3) con
   `entidad`, `entidadId`, `accion` del config, `estadoAntes`/`estadoDespues`
   si el handler los devolvió, `usuarioId` de la sesión, `ip` desde
   `headers()` de `next/headers`.
8. Devuelve `{ ok: true, data: handlerResult.data }`.

### Trade-off aceptado: AuditLog no es atómico con la mutación de negocio
El `handler` (que internamente llama a su propio `service`/`repository` y
puede envolver su mutación en `prisma.$transaction` si toca más de una
tabla, por convención) se ejecuta y confirma su propia transacción antes
de que `withAuth` escriba el `AuditLog`. Si el proceso muere entre el paso
6 y el paso 7, la mutación de negocio queda aplicada sin su fila de
auditoría. Meter el `AuditLog` dentro de la misma transacción que el
`handler` rompería la regla de capas (`services` nunca importa Prisma; el
`handler` de `withAuth` vive en `server/actions/`, no en `server/services/`,
así que técnicamente podría envolver todo en una transacción — pero eso
acoplaría cada action a pasar su `tx` manualmente a su propio
repository/service, complejidad no justificada para v1). Se documenta como
riesgo aceptado, igual que D6 — revisar si en algún sprint futuro un
descuadre de auditoría real lo justifica.

### Uso esperado desde una Server Action concreta
```ts
// server/actions/usuario.ts
export const crearUsuario = withAuth(
  { schema: crearUsuarioSchema, rol: "GERENTE", entidad: "Usuario", accion: "CREAR" },
  async (input, ctx) => {
    const usuario = await crearUsuarioService(input); // repository+bcrypt adentro
    return { data: usuario, entidadId: usuario.id, estadoDespues: usuario };
  }
);
```

## Guard por rol en `proxy.ts` (H1)

### Mapeo de rutas
```ts
// server/auth/rbac.ts (o lib/rbac.ts — decidir junto al Shell, ambos lo usan)
export const RUTAS_POR_ROL: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: "/gestion", roles: ["GERENTE"] },
  { prefijo: "/operacion", roles: ["GERENTE", "OPERARIO"] },
];
```
`proxy.ts` recorre `RUTAS_POR_ROL`, encuentra el primer prefijo que matchea
`pathname`, y si `req.auth.user.rol` no está en `roles`, responde
`NextResponse.json({ error: "No autorizado" }, { status: 403 })` en vez de
redirigir (a diferencia del guard de sesión de H5-Sprint1, que sí
redirige a `/login` — acá ya hay sesión válida, así que un 403 explícito
es más correcto que reenviar a login). Rutas sin prefijo conocido
(`/dashboard`, `/`) no tienen restricción adicional más allá del guard de
sesión ya existente.

### Por qué esto no rompe el guard de sesión existente
El guard de sesión de S1-5/S1-9 vive en el mismo `auth(async (req) => {...})`
de `proxy.ts` — el guard por rol se agrega como un chequeo adicional
**después** de confirmar `req.auth` truthy, dentro de la misma función, no
como un middleware nuevo envolvente. Esto evita repetir el bug de S1-9
(un middleware envolvente adicional mata la rama `authorized` — ver
`memory/estado-proyecto.md`); acá no se agrega ningún middleware nuevo,
solo más lógica dentro del que ya existe.

## Diseño de `AuditLog` (H3)
```
server/repositories/auditLog.ts   # único lugar con prisma.auditLog.create(...)
server/services/auditLog.ts       # si hace falta lógica pura (probablemente
                                   # no en este sprint — evaluar si vale la
                                   # pena la capa vacía o si withAuth llama
                                   # directo al repository)
```
Dado que registrar auditoría es una escritura directa sin lógica de negocio
que testear en aislamiento, es válido que `withAuth` llame directo al
repository (`crearAuditLog(...)`) sin pasar por un service — no inventar
una capa vacía solo por seguir el patrón de las tres capas al pie de la
letra. Si en un sprint futuro aparece lógica real (p. ej. filtros de
consulta, retención), se agrega el service en ese momento.

## Shell por rol (H4)
- `components/layout/sidebar.tsx` (desktop, ≥768px) y
  `components/layout/bottom-nav.tsx` (mobile, <768px) — mismo patrón que
  ya usa el resto del proyecto para "targets táctiles ≥48px" en mobile
  (`memory/stack-tecnologico.md`).
- Ambos reciben el `rol` de la sesión (leído en `layout.tsx`, ya se lee
  `session` ahí) y filtran sus items de navegación contra
  `RUTAS_POR_ROL` (reusa el mismo mapeo de H1 para no duplicar qué rutas
  ve cada rol en dos lugares distintos).
- El logout se integra como item del Shell (reusa la Server Action
  `logout()` ya existente de `server/actions/auth.ts`, no se reescribe).
- `src/app/layout.tsx` cambia: se quita el bloque
  `<div className="flex justify-end p-4"><LogoutButton /></div>` y se
  monta `<Sidebar />`/`<BottomNav />` (responsive vía CSS, no dos árboles
  condicionados en JS) cuando `session` existe. `IdleTimer` se mantiene
  igual.
- Componentes shadcn a instalar antes de esto: `npx shadcn@latest add
  sheet` (si el Sidebar mobile usa un drawer) — a confirmar durante S2-4
  si realmente hace falta o si BottomNav fijo alcanza sin drawer.

## CRUD de usuarios (H5)

### Capas
```
lib/zod/usuario.ts              # crearUsuarioSchema, editarUsuarioSchema
server/repositories/usuario.ts  # crear, actualizar, cambiarEstado, contarGerentesActivos
server/services/usuario.ts      # guards puras: puedeDesactivar(usuarioObjetivo, usuarioActual, totalGerentesActivos)
server/actions/usuario.ts       # crearUsuario/editarUsuario/desactivarUsuario vía withAuth
app/(app)/gestion/usuarios/     # page.tsx (listado + tabla), nuevo/page.tsx o modal
```

### Guards de negocio (puras, testeables sin BD — mismo espíritu que
`estaExpiradaPorInactividad`)
```ts
// server/services/usuario.ts
export function puedeDesactivarUsuario(params: {
  usuarioObjetivoId: string;
  usuarioActualId: string;
  usuarioObjetivoRol: Rol;
  totalGerentesActivos: number;
}): { permitido: true } | { permitido: false; motivo: string } {
  if (params.usuarioObjetivoId === params.usuarioActualId) {
    return { permitido: false, motivo: "No podés desactivar tu propio usuario" };
  }
  if (params.usuarioObjetivoRol === "GERENTE" && params.totalGerentesActivos <= 1) {
    return { permitido: false, motivo: "Debe quedar al menos un Gerente activo" };
  }
  return { permitido: true };
}
```
`server/repositories/usuario.ts` agrega `contarGerentesActivos()` (simple
`prisma.usuario.count({ where: { rol: "GERENTE", estado: "ACTIVO" } })`)
para que el service pueda decidir sin acoplarse a Prisma.

### Desactivar usuario revoca sus sesiones — nueva función de repository
```ts
// server/repositories/sesion.ts — se agrega en este sprint
export function revocarSesionesPorUsuario(usuarioId: string, ahora: Date) {
  return prisma.sesionActiva.updateMany({
    where: { usuarioId, revocada: false },
    data: { revocada: true, revocadaEn: ahora },
  });
}
```
**Corrección hecha durante S2-8, respecto de lo escrito arriba en un borrador
anterior de este plan:** el `prisma.$transaction([...])` que combina el
cambio de `estado` del usuario + `revocarSesionesPorUsuario` NO vive en la
Server Action — eso pondría un `import { prisma }` dentro de
`server/actions/usuario.ts`, violando ADR-000 ("repositories, único lugar
que importa Prisma"). Vive como `desactivarUsuarioYRevocarSesiones(id, ahora)`
en `server/repositories/usuario.ts` (reusa `revocarSesionesPorUsuario` de
`sesion.ts` como uno de los dos elementos del array de `$transaction`); la
action solo la invoca. Sigue cumpliendo la convención de `convenciones.md`
(mutación de dos tablas → `$transaction`), solo cambia en qué capa vive.

### Password
`crearUsuarioService`/reset de contraseña reusan `bcrypt.hash(password, 12)`
— mismo cost factor que ya fija `memory/stack-tecnologico.md` (verificar
contra `server/auth/autorizar.ts`, que hoy solo hace `bcrypt.compare`, no
hay `bcrypt.hash` en el código todavía — se agrega en este sprint).

### Rol al crear (decisión confirmada durante S2-7, amplía spec.md)
`crearUsuarioSchema` (S2-6) incluye `rol: "GERENTE" | "OPERARIO"` como
input explícito del formulario — el Gerente elige, no queda fijo en
OPERARIO. No cambia ninguna otra pieza del diseño: la Server Action sigue
exigiendo `{ rol: "GERENTE" }` en su propio `withAuth` para poder
invocarse (quién puede crear, no qué rol se le asigna al creado), y
`contarGerentesActivos()`/`puedeDesactivarUsuario` siguen aplicando igual
si el usuario creado/afectado resulta ser GERENTE.

## Componentes shadcn a instalar (H-transversal a H4/H5)
Evaluar durante S2-4 cuáles hacen falta realmente antes de instalarlos
todos de una — candidatos según lo que piden H4/H5:
- `table` — listado de usuarios.
- `select` — elegir rol al crear/editar.
- `dialog` o `sheet` — formulario de crear/editar sin navegar a otra
  pantalla (a decidir cuál calza mejor con el patrón mobile-first).
- `badge` — mostrar estado ACTIVO/INACTIVO en la tabla.

## Orden de ejecución (hay dependencias entre tareas)
1. **S2-1** — Mapeo `RUTAS_POR_ROL` + guard por rol en `proxy.ts` (H1).
   Independiente de todo lo demás, puede ir primero.
2. **S2-2** — `server/repositories/auditLog.ts` (H3). Independiente,
   puede ir en paralelo con S2-1.
3. **S2-3** — `withAuth()` (H2). Depende de S2-2 (necesita
   `crearAuditLog`) y reusa `buscarSesionPorJti`/`estaExpiradaPorInactividad`
   ya existentes de Sprint 1.
4. **S2-4** — Instalar componentes shadcn adicionales. Independiente,
   puede ir en paralelo con S2-1/S2-2/S2-3.
5. **S2-5** — `revocarSesionesPorUsuario` en `server/repositories/sesion.ts`.
   Pequeño, previo a S2-8 (lo necesita `desactivarUsuario`).
6. **S2-6** — Zod schemas de usuario (`lib/zod/usuario.ts`). Previo a S2-7/S2-8.
7. **S2-7** — Repository + service de `Usuario` (crear/actualizar/
   cambiarEstado, `contarGerentesActivos`, guards puras). Depende de S2-6.
8. **S2-8** — Server Actions de usuario vía `withAuth` (depende de S2-3,
   S2-5, S2-7).
9. **S2-9** — Pantallas CRUD de usuarios (depende de S2-4 y S2-8).
10. **S2-10** — Shell Sidebar/BottomNav + retirar `LogoutButton` de
    `layout.tsx` (depende de S2-1 para el mapeo de rutas y de S2-4 para
    componentes shadcn si aplica).
11. **S2-11** — Tests de integración RBAC (proxy.ts + withAuth) y de las
    guards de H5. Al final, cubre S2-1 a S2-10.

## Comandos de referencia
```bash
npx shadcn@latest add table select dialog badge
# (ajustar la lista real según lo que S2-4 confirme necesario)
npx prisma studio    # verificar filas de Usuario/AuditLog/SesionActiva durante pruebas
```

## Estructura de archivos esperada (según `memory/arquitectura.md`)
```
src/
  proxy.ts                          # + guard por rol (extiende, no reemplaza)
  server/
    auth/
      rbac.ts                       # RUTAS_POR_ROL, compartido proxy.ts + Shell
      with-auth.ts                  # withAuth()
    actions/usuario.ts
    services/usuario.ts
    repositories/usuario.ts         # + contarGerentesActivos
    repositories/sesion.ts          # + revocarSesionesPorUsuario
    repositories/auditLog.ts
  lib/
    zod/usuario.ts
  components/
    layout/
      sidebar.tsx
      bottom-nav.tsx
  app/
    (app)/
      gestion/
        usuarios/
          page.tsx                  # listado (tabla)
          # formulario de alta/edición: dialog/sheet sobre el listado,
          # o ruta separada — decidir en S2-9 según lo que confirme S2-4
tests/
  integration/rbac/proxy-guard.test.ts
  integration/rbac/with-auth.test.ts
  unit/services/usuario.test.ts     # puedeDesactivarUsuario
  integration/usuario/               # crear/editar/desactivar
```

## Definition of Done aplicable a este sprint
`memory/definition-of-done.md` no existe todavía en el repo (ver nota en
`spec.md`) — hasta que se cree, este sprint se verifica contra las reglas
no negociables de `CLAUDE.md` y el mismo estándar que cerró Sprint 1:
- Ningún componente ni service de este sprint importa Prisma directamente
  — solo `server/repositories/usuario.ts`, `sesion.ts`, `auditLog.ts`.
- Toda Server Action nueva (`crearUsuario`, `editarUsuario`,
  `desactivarUsuario`) pasa por `withAuth` — no se escribe ninguna
  verificación de sesión/rol a mano fuera del wrapper.
- Toda mutación que toque más de una tabla (`desactivarUsuario`: `Usuario`
  + `SesionActiva`) va dentro de `prisma.$transaction`.
- TypeScript strict, cero `any`, cero `@ts-ignore`.
- `npm run typecheck && npm run lint && npm test` y `npx prisma validate`
  en verde antes de cerrar el sprint (sin cambios de schema esperados).
- Guard por rol y `withAuth` verificados con tests de integración reales
  (no solo unitarios de las funciones puras), igual que Sprint 1 verificó
  login/logout/idle contra un servidor real, no solo contra tests.
