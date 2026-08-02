# Sprint 0 — Cimientos técnicos

## Sprint Goal
El repo está desplegado en Vercel, con el schema completo migrado en
Neon y el seed cargado. Un SELECT desde la app devuelve datos reales.

## Por qué este sprint no tiene historias de usuario
Es un sprint 100% técnico — no hay una funcionalidad visible para el
Gerente ni el Operario todavía. El "usuario" de este sprint es el
propio desarrollo: sin esto, ningún sprint siguiente puede empezar.

## Bloqueo obligatorio antes de iniciar
Las 6 decisiones técnicas (D1–D6) en `memory/decisiones-tecnicas.md`
deben estar cerradas antes de tocar la tarea S0-5 (migración inicial).
**Estado: ✅ ya cerradas** — confirmadas por el Product Owner.

## Alcance de este sprint
- Proyecto Next.js inicializado con la configuración técnica base.
- Base de datos Neon creada, con el schema completo (26 modelos)
  migrado en un branch de desarrollo.
- Seed con datos mínimos para poder trabajar (Gerente, Público General,
  precio inicial, galpones y lote de prueba).
- CI corriendo en cada PR.
- Deploy funcionando en Vercel con preview automático.

## Fuera de alcance
- Cualquier pantalla o funcionalidad de negocio — eso empieza en
  Sprint 1 (Autenticación).
- Rate limiting y Upstash Redis — se configuran recién en Sprint 1.

## Criterio de aceptación general
Dado el repo recién clonado
Cuando se corre `npm install` y `npx prisma migrate deploy`
Entonces la base de datos de desarrollo queda con las 26 tablas creadas
Y el seed puede ejecutarse sin errores
Y `npm run dev` levanta la app localmente sin errores de conexión a BD

## Riesgo principal
El schema es la decisión más costosa de revertir de todo el proyecto.
No se debe iniciar S0-5 sin las decisiones D1–D6 firmadas (ya lo están).
Si durante S0-4 aparece la necesidad de una decisión técnica nueva no
contemplada, se detiene la tarea, se documenta en
`memory/decisiones-tecnicas.md` como decisión nueva, y recién se continúa.