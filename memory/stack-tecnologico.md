# Stack Tecnológico

## Frontend + Backend
- **Next.js 16+** (App Router). Server Components y Server Actions — la lógica
  vive en el servidor, no en el cliente, para no sobrecargar celulares antiguos.
- **TypeScript strict** — sin `any`, sin `@ts-ignore`.
- **Tailwind v4** + **shadcn/ui** — componentes base, no editar manualmente los
  de `components/ui/`.
- Tema de alto contraste, tipografía base 18px, targets táctiles ≥48px
  (pensado para uso con guantes/sol directo en campo).

## Base de datos
- **Neon PostgreSQL** (serverless, con Connection Pooling).
  - `DATABASE_URL` → conexión pooled, para la app en runtime.
  - `DIRECT_URL` → conexión directa, solo para migraciones de Prisma.
- **Prisma ORM v6** (fijado explícitamente — Prisma 7 mueve `url`/`directUrl`
  fuera de `schema.prisma` hacia `prisma.config.ts` y rompe el flujo actual)
  con tipado estricto — toda query se autoverifica en tiempo de compilación.

## Autenticación y seguridad
- **Auth.js v5** con `CredentialsProvider` (usuario + contraseña, no email).
- **Bcrypt** (cost factor 12) para hash de contraseñas.
- **JWT** firmado en servidor, cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- **Upstash Redis** — rate limiting (no sirve un contador en memoria en
  entorno serverless) y potencialmente estado de sesión revocada si se
  necesita en el futuro consultar desde el Edge (ver `arquitectura.md`).

## Validación
- **Zod** — todo input de Server Action se valida antes de tocar Prisma.
  El schema Zod es el contrato explícito entre cliente y servidor.

## Offline / PWA
- **next-pwa** o **Serwist** — Service Workers, manifest, estrategias de caché.
- **Dexie** (wrapper de IndexedDB) — cola local de operaciones pendientes.
- **Web Push (VAPID)** — notificaciones push para alertas de crédito vencido.

## Testing
- **Vitest** — unit tests de `services/` (lógica pura) e integración de
  Server Actions.
- **Playwright** — E2E de los flujos críticos.

## Infraestructura
- **Vercel** — hosting, preview deployments automáticos por PR, Vercel Cron
  para jobs programados (detección de créditos vencidos).
- **GitHub Actions** — CI: typecheck, lint, `prisma validate`, tests.

## Presupuesto
Stack elegido para operar en $0 USD en las capas gratuitas de cada servicio
mientras el volumen de la granja sea bajo/medio. Escalar planes (Neon Launch,
Upstash paga, Vercel Pro) solo si el uso real lo justifica.