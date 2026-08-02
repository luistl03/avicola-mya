# Convenciones Técnicas

## Naming
- Modelos y campos de Prisma: `camelCase`, sin guiones bajos salvo que sea
  imprescindible para legibilidad.
- Rutas de carpetas en `app/`: `kebab-case`.
- Componentes React: `PascalCase`.
- Archivos de `services/` y `repositories/`: nombre del módulo en singular
  (`recoleccion.ts`, no `recolecciones.ts`).

## TypeScript
- `strict: true` en `tsconfig.json`.
- Prohibido `any` y `@ts-ignore` — si algo no tipa, se resuelve el tipo,
  no se silencia.

## Server Actions
- Toda Server Action pasa por el wrapper `withAuth(action, { rol })`
  (ver Sprint 2 del plan SCRUM) — valida sesión, rol, Zod y escribe en
  `AuditLog` automáticamente.
- El schema Zod de entrada vive junto a la action o en `lib/zod/<modulo>.ts`
  si se reutiliza en más de un lugar.

## Base de datos
- Campos monetarios: siempre `Decimal`, nunca `Float`.
- Nunca `DELETE` físico en entidades de negocio (Lote, Paquete, Cliente,
  Usuario) — se usa el campo `estado` (soft delete/anulación).
- Toda mutación que afecte más de una tabla va dentro de
  `prisma.$transaction([...])`.

## Git
- Conventional Commits: `feat(modulo): descripción`, `fix(modulo): descripción`,
  `test(modulo): descripción`, `docs: descripción`.
- Una rama por historia/tarea: `feat/S{sprint}-{slug-corto}`.
- Squash merge a `main`. `main` protegida, requiere CI verde.

## Contrato Offline-Ready (obligatorio desde Sprint 5 en adelante)
Toda entidad que un Operario pueda crear en campo sin señal debe cumplir:
1. ID generado en el cliente (`crypto.randomUUID()`), nunca autoincrement.
2. La Server Action/endpoint correspondiente es **idempotente**
   (upsert por id, nunca `create` puro).
3. Dos timestamps: `creadoEnCliente` (reloj del celular) y `creadoEn`
   (reloj del servidor, fuente de verdad para plazos como la ventana
   de gracia de 10 minutos).
4. El payload es JSON puro serializable — los `Decimal` de Prisma se
   convierten a `string` antes de encolarse en IndexedDB.