# Roadmap completo — ERP Avícola PWA

## Estado actual del proyecto
**Última actualización:** Sprint 4 completado, verificado contra Neon real y clic a clic con Claude in Chrome (pendiente verificación en celular físico — ver `memory/estado-proyecto.md`).
**Progreso:** 5 de 16 sprints (31%)
**Deploy activo:** https://avicola-mya.vercel.app
**Repo:** https://github.com/luistl03/avicola-mya

Para el detalle completo de lo hecho en Sprint 0 (decisiones tomadas
durante la ejecución, problemas resueltos, versiones fijadas), ver
`memory/estado-proyecto.md` — ese archivo es la bitácora viva del
proyecto y debe leerse ANTES de continuar con cualquier sprint nuevo.

Este archivo es el mapa de los 16 sprints. El detalle línea por línea de
cada uno (historias, criterios Gherkin) vive en `specs/sprint-XX-nombre/`
cuando esa carpeta ya fue generada. Si `specs/sprint-XX-nombre/spec.md`
no existe todavía, generarlo ANTES de ejecutar ese sprint, usando este
resumen + `memory/` como base — no inventar alcance nuevo.

## Roadmap por Releases

| Release | Sprints | Estado | Entrega de valor |
|---|---|---|---|
| R1 — Operación básica | 0–7 | 🟡 En curso (5/8) | La granja registra producción y vende al contado. Reemplaza el cuaderno. |
| R2 — Finanzas | 8–11 | ⬜ Pendiente | Créditos, cobranza, egresos, planilla. |
| R3 — Campo real | 12–13 | ⬜ Pendiente | Funciona sin señal. Instalable. |
| R4 — Inteligencia | 14–15 | ⬜ Pendiente | Dashboard, reportes, push. |

Total: 16 sprints de 2 semanas ≈ 32 semanas a dedicación full-time.
Velocidad de referencia: 1 dev full-time 26–34 pts/sprint,
1 dev part-time (20h/sem) 16–21 pts/sprint. Ver `memory/definition-of-ready.md`.

---

## 🏁 RELEASE 1 — OPERACIÓN BÁSICA

### ✅ Sprint 0 — Cimientos técnicos (32 pts) — COMPLETADO
**Goal:** repo desplegado en Vercel, schema completo migrado en Neon, seed cargado.
- create-next-app, shadcn/ui + tema alto contraste
- Neon (branch dev/main) + Prisma schema completo (26 modelos)
- Migración + SQL manual (CHECK, índice único parcial)
- seed.ts, prisma singleton, deploy Vercel, CI, ADR-000 + Vitest
**Specs:** `specs/sprint-00-cimientos/`
**Detalle de ejecución:** `memory/estado-proyecto.md`

### ✅ Sprint 1 — Autenticación y sesiones (26 pts) — COMPLETADO
**Goal:** login con usuario+contraseña, sesión revocable, rate limiting activo.
- Auth.js v5 + CredentialsProvider + bcrypt
- Modelo SesionActiva, idle check server-side, IdleTimer cliente (28min aviso, 30min logout)
- Pantalla /login mobile-first (con el logo real de Avícola M&A)
- Rate limiting Upstash: /api/auth/* 5/min→ban 15min; operativas 60/min
  (verificado en vivo contra Upstash real, local y producción, al cerrar
  Sprint 2)
**Specs:** `specs/sprint-01-autenticacion/`
**Detalle de ejecución (5 bugs reales encontrados y corregidos):** `memory/estado-proyecto.md`

### ✅ Sprint 2 — RBAC, auditoría y shell (29 pts) — COMPLETADO
**Goal:** Operario no accede a nada de Gerente, toda mutación queda auditada.
- `proxy.ts` (ya existía desde Sprint 1 con guard de sesión binario + rate
  limiting — no se creó `middleware.ts`): guard por rol agregado → 403
- **withAuth(action, {rol})** — wrapper que envuelve toda Server Action
  (auth + revocación/idle + rol + Zod + AuditLog). Máximo apalancamiento
  del proyecto, lo van a usar todos los sprints siguientes.
- Servicio AuditLog, Shell (Sidebar/BottomNav por rol) — reemplazó el botón
  de logout placeholder montado directo en `layout.tsx` en Sprint 1
- CRUD usuarios completo (crear con rol elegido por el Gerente, editar,
  activar/desactivar con revocación de sesiones), tests RBAC (65 tests)
**Specs:** `specs/sprint-02-rbac-auditoria/`
**Detalle de ejecución (3 bugs reales encontrados y corregidos, más el
cierre de la deuda de Sprint 1):** `memory/estado-proyecto.md`

### ✅ Sprint 3 — Galpones, Lotes y Mudanzas (29 pts) — COMPLETADO
**Goal:** Gerente configura estructura física, muda lotes sin perder historia.
- Migración: `Galpon.estado` (soft-delete, no existía desde Sprint 0)
- CRUD Galpón (con guard de capacidad/ocupación), alta de Lote con ubicación inicial
- Mudanza transaccional (cerrar fechaSalida + abrir nueva, valida capacidad y estado del destino)
- Finalizar lote → INACTIVO (cierra su ubicación en la misma transacción), vista de ubicación actual
- Tests de integridad: 44 tests nuevos (unit + integración) + verificación en vivo contra Neon
  real del índice único parcial de S0-5 (sigue vigente)
**Specs:** `specs/sprint-03-galpones-lotes-mudanzas/`
**Detalle de ejecución (sin bugs de código; deuda pendiente de verificación en navegador real):** `memory/estado-proyecto.md`

### ✅ Sprint 4 — Mortalidad y Bitácora (24 pts) — COMPLETADO
**Goal:** operario registra bajas y notas de turno desde el celular.
- RegistroMortalidad + decremento atómico de avesVivas (primera transacción
  interactiva del proyecto, verificada sobre el pooler de Neon)
- Bitácora con categoría (ALIMENTACION/VACUNACION/OBSERVACION), sin vínculo a galpón (D2)
- Muro cronológico con scroll infinito (paginación por cursor), filtro por categoría/fecha
- Guard: avesVivas nunca negativo (guard anti-carrera real, forzado y verificado contra Neon)
- Primeras pantallas mobile-first para el Operario (`<Sheet side="bottom">`), sin restricción de rol
**Specs:** `specs/sprint-04-mortalidad-bitacora/`
**Detalle de ejecución (sin bugs de negocio; un ajuste real de UI marcado por el linter de React):** `memory/estado-proyecto.md`

### Sprint 5 — Recolección e Inventario (29 pts) ⚠️ NÚCLEO, riesgo alto
**Goal:** operario ingresa conteo del día, sistema genera paquetes + sueltos con ledger auditable.
- Service puro calcularEmpaque(total) con tests exhaustivos
- UI reactiva de despliegue dinámico de campos de peso
- Transacción: RegistroRecoleccion + N Paquete + N PaqueteOrigen + MovimientoSueltos
- Ledger MovimientoSueltos + reconstruirSaldo() (auditoría)
- Cobertura ≥90% exigida en services/recoleccion.ts e inventario.ts

### Sprint 6 — Ventana de gracia y reversión (28 pts)
**Goal:** un error de tipeo se corrige en 10 min sin llamar al gerente.
- Botón "Corregir último registro" con countdown (basado en creadoEn del servidor)
- Guard de elegibilidad (bloquea si algo ya se vendió/rompió)
- Reversión transaccional (paquetes → ANULADO, nunca DELETE)
- Ajuste manual del Gerente pasado el plazo
- Tests de carrera (reversión concurrente con venta)

### Sprint 7 — Consolidación de residuos (24 pts)
**Goal:** sueltos acumulados se convierten en paquetes mixtos y bandejas.
- Pantalla de saldos por galpón/lote
- Wizard "Paquete Mixto" (multi-origen, suma exacta 180)
- Wizard "Armar Bandeja" (30u, multi-origen)
- Guard anti-sobregiro (update condicional)

### Sprint 8 — Clientes y Precio por Kilo (19 pts) — sprint liviano
**Goal:** catálogo comercial listo, precio vigente es histórico.
- CRUD Cliente, "Público General" (id fijo, sin crédito, no editable)
- PrecioKilo histórico (nueva fila, nunca UPDATE)
- Búsqueda de clientes optimizada

---

## 💰 RELEASE 2 — FINANZAS

### Sprint 9 — POS: carrito y cierre (31 pts) ⚠️ dividir en 9A/9B
**Goal:** se vende paquete/bandeja y el stock se descuenta correctamente.
- Selector de items DISPONIBLES, carrito cliente-side
- Cierre de venta: Venta + DetalleVenta con precioKiloAplicado copiado
- Update condicional anti-doble-venta (SET...WHERE estado='DISPONIBLE')
- Descuento manual + metodoPago (EFECTIVO/YAPE/PLIN/TRANSFERENCIA)
- Comprobante en pantalla + compartir por WhatsApp

### Sprint 10 — POS: Romper paquete y sueltos (26 pts)
**Goal:** se vende cualquier cantidad, rompiendo paquete en vivo.
- Service repartirDevolucion (reparto proporcional, suma debe cerrar exacta)
- Flujo "Romper Paquete": ROTO + captura de peso + RoturaPaquete
- Devolución al ledger con reparto persistido
- Venta de sueltos por unidad

### Sprint 11 — Créditos y cobranza (26 pts)
**Goal:** Gerente ve al entrar quién le debe y hace cuántos días.
- Venta a crédito (bloqueada para Público General)
- Panel de alertas (tarjetas rojas por antigüedad)
- Abonos parciales con su propio metodoPago
- Auto-liquidación al llegar a cero + guard sobrepago
- Estado de cuenta por cliente

### Sprint 12 — Egresos y Personal (19 pts)
**Goal:** Gerente registra gastos y planilla, aislados de la caja de ventas.
- CRUD Egreso por categoría (sin comprobante adjunto — D4)
- Modelo Empleado (desacoplado de Usuario)
- SueldoMovimiento (SUELDO_BASE/ADELANTO/BONO/DESCUENTO)
- Cálculo de neto mensual (solo informativo)
- Banner explícito: no afecta flujo de caja de ventas

---

## 🚀 RELEASE 3 — CAMPO REAL

### Sprint 13 — PWA e instalación (24 pts)
**Goal:** la app se instala en el celular, pantallas operativas abren sin señal.
- next-pwa/Serwist + manifest + iconos maskable
- Estrategias de caché (NetworkFirst/CacheFirst/StaleWhileRevalidate)
- Precarga de catálogos al login
- Prompt instalación Android + tutorial iOS ("Compartir → Añadir a inicio")
- Indicador de conectividad

### Sprint 14 — Cola offline y sincronización (37 pts) ⚠️ ALTO RIESGO, dividir en 14A/14B
**Goal:** operario trabaja 4h sin señal, al volver no se pierde ni duplica nada.
- Capa IndexedDB (Dexie): cola PENDIENTE/ENVIANDO/OK/ERROR
- Interceptor de fallo de red → encolar
- POST /api/sync batch idempotente (upsert por UUID cliente)
- Ventana de gracia offline: creadoEnCliente vs creadoEn (servidor)
- Resolución de conflictos, cola sobrevive logout, pantalla de pendientes

---

## 📊 RELEASE 4 — INTELIGENCIA

### Sprint 15 — Dashboard y reportes (26 pts)
- Producción diaria/mensual, mortalidad, tendencia de ventas por método de pago
- Ranking de clientes, gasto por categoría, exportación CSV/Excel

### Sprint 16 — Push, hardening y UAT (32 pts)
- PushSubscription + Web Push (VAPID) para créditos vencidos
- Cron diario Vercel (detección de vencimientos)
- E2E Playwright de 5 flujos críticos
- Auditoría de performance (EXPLAIN ANALYZE)
- UAT con Gerente + Operario en campo, manual de usuario

---

## Ruta rápida — MVP en 8 sprints (si hay deadline)

| Sprint | Contenido comprimido |
|---|---|
| 0 | Cimientos + schema completo ✅ |
| 1 | Auth + RBAC + withAuth (sin auditoría/rate-limit avanzado) |
| 2 | Galpones + Lotes + Mudanza |
| 3 | Mortalidad + Bitácora |
| 4 | Recolección + Inventario + ledger |
| 5 | Consolidación + Clientes + Precio |
| 6 | POS completo (carrito + romper paquete) |
| 7 | Créditos + Dashboard mínimo + PWA instalable (sin cola offline) |

## Decisiones técnicas cerradas — resumen rápido
Ver detalle completo en `memory/decisiones-tecnicas.md`.
D1: peso manual · D2: bitácora sin galpón · D3: instancia única, sin multi-granja ·
D4: sin adjuntos en Egreso · D5: America/Lima fija · D6: plan gratuito Neon (riesgo aceptado)

## Cómo trabajar sprint a sprint desde la terminal
1. Leer `memory/estado-proyecto.md` primero — tiene el contexto de ejecución real.
2. Verificar si `specs/sprint-XX-nombre/` ya existe con spec.md/plan.md/tasks.md.
3. Si no existe, pedirle a Claude Code que lo genere usando la sección
   correspondiente de este roadmap + `memory/` como contexto.
4. Ejecutar solo ese sprint. No adelantar tareas de sprints futuros en la misma sesión.
5. Al cerrar, verificar contra `memory/definition-of-done.md` y actualizar
   `memory/estado-proyecto.md` con lo aprendido.