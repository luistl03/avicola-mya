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
- **Serwist** (`@serwist/turbopack`) — Service Workers, manifest,
  estrategias de caché. Elegido sobre `next-pwa` por incompatibilidad de
  ese último con Turbopack, el bundler estable por defecto de Next 16
  desde Sprint 0 (D7, `decisiones-tecnicas.md`, Sprint 13).
- **Dexie** (wrapper de IndexedDB) — cola local de operaciones pendientes.
  (Sprint 14, sin instalar todavía.)
- **Web Push (VAPID)** — notificaciones push para alertas de crédito vencido.
  (Sprint 16, sin instalar todavía.)

## Comprobantes (Sprint 9)
- **jsPDF** — genera el comprobante de venta del POS como PDF **enteramente
  en el navegador**, sin backend ni servicio externo nuevo (mantiene el
  presupuesto $0 de más abajo). Se evaluó generación en servidor
  (Puppeteer/Playwright, o un servicio de PDF-as-a-service) y se descartó:
  Puppeteer no corre bien en el runtime gratuito de Vercel sin configurar
  binarios aparte, y un servicio externo de pago no se justifica para un
  documento de texto simple (encabezado + tabla de ítems + totales). Ver
  `specs/sprint-09-pos-carrito-cierre/plan.md` ("Decisión de diseño:
  generación de PDF") para la comparación completa.
- **Web Share API** (`navigator.share`/`navigator.canShare`, nativa del
  navegador, sin dependencia nueva) — comparte el PDF ya generado
  directamente a WhatsApp u otra app en los dispositivos que la soportan.
  **No es universal** (varía por navegador/SO) y el protocolo `wa.me` no
  soporta adjuntar archivos, solo texto — hay un camino de descarga simple
  como respaldo cuando no está disponible.

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