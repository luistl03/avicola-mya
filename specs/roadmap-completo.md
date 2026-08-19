# Roadmap completo — ERP Avícola PWA

## Estado actual del proyecto
**Última actualización:** Sprint 13 completado salvo un ítem — app instalable en Android real (manifest, iconos maskable, `beforeinstallprompt` con banner + botón manual de respaldo) y offline-ready para Mortalidad/Bitácora/Recolección vía Service Worker (`@serwist/turbopack`, D7 — no `next-pwa`, incompatible con Turbopack). 11 hallazgos reales encontrados y corregidos durante la verificación en dispositivo real (detalle completo en `memory/estado-proyecto.md` y `specs/sprint-13-pwa-instalacion/tasks.md`), entre ellos una carrera real de `beforeinstallprompt` contra la hidratación de React, desalojo LRU de caché por compartir balde, y un evento de instalación de un solo uso que no se limpiaba tras usarlo. Sin ninguna migración de schema. Verificado en vivo contra Neon/Upstash reales: guardar sin señal falla explícito sin perder ni duplicar datos, y el rate limit operativo responde exactamente como está documentado (60/min). Único ítem pendiente: S13-21 (verificación en iPhone real), en espera explícita del Product Owner, rama `feat/S13-pwa-instalacion` sin mergear a `main` todavía.
**Progreso:** 14 de 16 sprints (88%, con una verificación puntual en iPhone pendiente de Sprint 13)
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
| R1 — Operación básica | 0–7 | 🟢 Completo (8/8) | La granja registra producción y vende al contado. Reemplaza el cuaderno. |
| R2 — Finanzas | 8–11 | 🟢 Completo (4/4) | Créditos, cobranza, egresos, planilla. |
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

### ✅ Sprint 5 — Recolección e Inventario (29 pts) — COMPLETADO
**Goal:** operario ingresa conteo del día, sistema genera paquetes + sueltos con ledger auditable.
- Service puro calcularEmpaque(total), cobertura 100% (services/recoleccion.ts e inventario.ts)
- UI reactiva de despliegue dinámico de campos de peso
- Transacción: RegistroRecoleccion + N Paquete + N PaqueteOrigen + InventarioSueltos/MovimientoSueltos
  condicionales (primera transacción del proyecto con escritura en cascada real)
- Ledger MovimientoSueltos + reconstruirSaldo() (auditoría, sin pantalla propia todavía)
- Primer Contrato Offline-Ready real: id generado en cliente, idempotencia por
  create+captura de P2002 (no upsert)
**Specs:** `specs/sprint-05-recoleccion-inventario/`
**Detalle de ejecución (1 bug real encontrado y corregido en vivo — doble clic duplicaba un registro;
deuda pendiente: auditar idempotencia en el resto de los dialogs de mutación):** `memory/estado-proyecto.md`

### ✅ Sprint 6 — Ventana de gracia y reversión (28 pts) — COMPLETADO
**Goal:** un error de tipeo se corrige en 10 min sin llamar al gerente.
- Botón "Deshacer" por fila con countdown real (basado en `creadoEn` del servidor), clon del patrón que Mortalidad ya tenía desde Sprint 4
- Guard de elegibilidad todo-o-nada (bloquea la reversión completa si algún `Paquete` ya se vendió/rompió), atómico vía `updateMany` + comparación de conteo — primer guard del proyecto sobre un conjunto de filas, no una sola
- Reversión transaccional (`Paquete` → `ANULADO`, nunca `DELETE`; `InventarioSueltos`/`MovimientoSueltos` `REVERSION` condicionales)
- Ajuste manual del Gerente (`rol: "GERENTE"`, primera Server Action del proyecto restringida a un solo rol dentro de un módulo abierto a ambos) — implementado completo para el ledger de sueltos de Recolección; Mortalidad queda como deuda explícita, sin ledger equivalente para `avesVivas`
- Tests de carrera reales contra Neon (doble reversión concurrente, reversión vs. venta simulada, doble ajuste concurrente)
**Specs:** `specs/sprint-06-ventana-gracia-reversion/`
**Detalle de ejecución (schema real no coincidía con el brief inicial — faltaba una migración; una brecha de cobertura real corregida reescribiendo `reconstruirSaldo()`; una corrección de UX en vivo, el ajuste ya no pide galpón a mano):** `memory/estado-proyecto.md`

### ✅ Sprint 7 — Consolidación de residuos (24 pts) — COMPLETADO
**Goal:** sueltos acumulados se convierten en paquetes mixtos y bandejas.
- Pantalla de saldos por galpón/lote (`/consolidacion`, primera vista real de `reconstruirSaldo()`)
- Wizard "Paquete Mixto" (multi-origen, techo calculado automático, cantidad a armar elegida por el operario — mínimo 1, incremental o "Agregar todas", corrección real de diseño post-S7-15)
- Wizard "Armar Bandeja" (30u, mismo componente parametrizado, primer uso real de `BandejaSuelta`/`BandejaOrigen` desde Sprint 0)
- Guard anti-sobregiro agregado por origen distinto (`updateMany` + suma por clave, no por unidad de destino), extendido de Sprint 6 a N filas de `InventarioSueltos` con cantidades distintas
- Migración: `PaqueteOrigen.loteId`/`BandejaOrigen.loteId` + modelo nuevo `RegistroConsolidacion` (ancla de idempotencia, mismo rol que `RegistroRecoleccion`)
**Specs:** `specs/sprint-07-consolidacion-residuos/`
**Detalle de ejecución (hallazgo real de schema en la planificación — faltaba `loteId` y una entidad ancla; dos bugs reales de código corregidos por tests antes de producción; una corrección de UX en vivo — el wizard automático pasó a control manual del operario):** `memory/estado-proyecto.md`

### ✅ Sprint 8 — Clientes y Precio por Kilo (19 pts) — COMPLETADO
**Goal:** catálogo comercial listo, precio vigente es histórico.
- CRUD Cliente (GERENTE y OPERARIO) con idempotencia completa por id de cliente (Cliente no tiene ningún campo @unique, mismo tratamiento que Galpón)
- "Público General" (id fijo, sin crédito, no editable/no suspendible — guard por comparación de id, sin migración)
- PrecioKilo histórico (nueva fila, nunca UPDATE, alta restringida a GERENTE)
- Búsqueda de clientes por nombre/celular + filtro por TipoCliente, mismo patrón colapsable que Mortalidad/Recolección
- Cero migraciones de schema (primera vez desde Sprint 5) — Cliente/PrecioKilo ya tenían todo lo necesario desde Sprint 0
**Specs:** `specs/sprint-08-clientes-precio-kilo/`
**Detalle de ejecución (sin bugs de lógica de negocio; una corrección real de diseño de filtros pedida en vivo por el Product Owner, resuelta temprano; un hallazgo real de cobertura en ambas Server Actions; una corrección de aritmética en el rango de Decimal(10,2)):** `memory/estado-proyecto.md`

---

## 💰 RELEASE 2 — FINANZAS

### ✅ Sprint 9 — POS: Carrito y Cierre (31 pts) — COMPLETADO
**Goal:** se vende paquete/bandeja y el stock se descuenta correctamente.
- Ejecutado como **sprint único**, sin dividir en 9A/9B (decisión confirmada por el Product Owner — el roadmap lo marcaba con "⚠️ dividir")
- Selector de items DISPONIBLES (con recorte a los últimos creados + búsqueda por peso) y carrito cliente-side, orquestados por `PosWorkspace`
- Cierre de venta transaccional: `Venta`+`DetalleVenta` con `precioKiloAplicado` copiado del vigente al momento de la venta (congelado, verificado que no cambia si el precio se actualiza después)
- `Update` condicional anti-doble-venta (`updateMany ... WHERE estado='DISPONIBLE'`) — séptima transacción interactiva del proyecto, ancla `Venta` primero (mismo orden que `consolidarSueltos`, no el de `registrarMortalidadYDescontarAves` — el guard es sobre un estado de una sola dirección), verificada bajo una carrera concurrente real forzada contra Neon
- Descuento manual con guard (no supera el bruto) + metodoPago (EFECTIVO/YAPE/PLIN/TRANSFERENCIA) — 100% al contado este sprint, sin adelantar Créditos
- Selector de cliente con autocomplete real (el endpoint que Sprint 8 dejó pospuesto) + alta de cliente inline si no hay coincidencias
- Comprobante: recibo térmico de 80mm en PDF (jsPDF, dependencia nueva) con el logo real de la granja, descargable y compartible por WhatsApp (Web Share API)
**Specs:** `specs/sprint-09-pos-carrito-cierre/`
**Detalle de ejecución (hallazgo de diseño del orden de idempotencia, una violación de ADR-000 corregida antes de implementar, tres correcciones reales de UX/diseño pedidas en vivo — incluidas dos vueltas del diseño del comprobante):** `memory/estado-proyecto.md`

### ✅ Sprint 10 — Consolidación: Romper Paquete/Bandeja (26 pts) — COMPLETADO
**Goal:** se puede deshacer un Paquete o una Bandeja para reshapear
inventario cuando el tamaño armado no es el que hace falta vender.
**Corrección real de alcance, en plena ejecución (ver `specs/sprint-10-romper-paquete-sueltos/spec.md`,
"Corrección de diseño"):** el brief original de este sprint (título "POS:
Romper paquete y sueltos") asumía que se iba a vender huevo suelto por
unidad y que Romper viviría dentro de `/pos` para resolverlo en el momento
de una venta. El Product Owner confirmó, viendo el flujo ya implementado,
que la granja **nunca vende huevo por unidad** — solo Paquete (180u) o
Bandeja (30u) — así que "Venta de sueltos por unidad" no es una historia
real y se sacó del alcance por completo. Romper Paquete/Bandeja se
reubicó de `/pos` a `/consolidacion`, junto a los wizards "Armar
Bandeja"/"Armar Paquete Mixto" (Sprint 7) que ya existían ahí: el único
propósito real de romper una unidad es devolver sus huevos a sueltos para
poder rearmar un tamaño distinto con esos mismos wizards — no tiene
ninguna razón de negocio para vivir en la pantalla de ventas.
- Service repartirDevolucion (reparto proporcional, suma debe cerrar exacta)
- Flujo "Romper Paquete/Bandeja" en /consolidacion: ROTO + captura de peso
  + RoturaPaquete/RoturaBandeja
- Devolución al ledger con reparto persistido, listo para los wizards de
  Armar Bandeja/Armar Paquete Mixto ya existentes
**Specs:** `specs/sprint-10-romper-paquete-sueltos/`
**Detalle de ejecución (corrección de diseño real en plena ejecución — S10-9 a S10-12 implementados con el brief original y revertidos por completo tras confirmar que la granja no vende huevo por unidad; dos carreras concurrentes reales forzadas contra Neon; sin bugs de código sobrevivientes):** `memory/estado-proyecto.md`

### ✅ Sprint 11 — Créditos y cobranza (26 pts) — COMPLETADO
**Goal:** Gerente ve al entrar quién le debe y hace cuántos días.
- Venta a crédito, total o parcial (bloqueada para Público General)
- Panel de alertas por antigüedad (dashboard + `/creditos`, 3 niveles)
- Abonos parciales con su propio metodoPago
- Auto-liquidación al llegar a cero + guard sobrepago
- Estado de cuenta por cliente
**Sin migración de schema** — `Credito`/`HistorialAbonos` ya existían
completos desde Sprint 0, sin código encima hasta este sprint.
**Corrección real de diseño, en plena verificación (S11-19, ver
`specs/sprint-11-creditos-cobranza/plan.md`, "Hallazgo de diseño"):** el
diseño original de `registrarAbono` (transacción interactiva) seguía el
orden "guard primero, ancla después" de `registrarMortalidadYDescontarAves`
por analogía (`avesVivas`, un contador con margen) — esa analogía resultó
incompleta: a diferencia de `avesVivas`, `Credito.montoPagado` llegando
exactamente a `montoTotal` es el desenlace ESPERADO de todo crédito
(auto-liquidación), no un caso raro, y con ese orden un reintento
idempotente de justo ese abono se rechazaba en vez de detectarse como
éxito ya aplicado. Corregido a "ancla primero", mismo orden que
`cerrarVenta`/`romperPaquete`. Dos hallazgos reales más, en la
verificación clic a clic (S11-20): un `Credito` sin alerta todavía no
tenía ningún botón para recibir abonos (agregado a `EstadoCuentaCliente`);
las fechas límite se mostraban con un día de desfase (bug de zona
horaria, medianoche UTC formateada de más con `America/Lima` — corregido
formateando en UTC, y el cálculo de "hoy" para clasificar alertas pasó de
`new Date()` crudo a `hoyEnLima()`, D5).
**Specs:** `specs/sprint-11-creditos-cobranza/`
**Detalle de ejecución (dos hallazgos de diseño reales corregidos en plena verificación — orden de transacción de `registrarAbono`, y zona horaria de fechas-calendario; guard de sobrepago verificado bajo carrera real forzada; 460 tests, cobertura 100%/100% en services/actions nuevos; sin bugs de código sobrevivientes):** `memory/estado-proyecto.md`

### ✅ Sprint 12 — Egresos y Personal (19 pts) — COMPLETADO
**Goal:** Gerente registra gastos y planilla, aislados de la caja de ventas.
- CRUD Egreso por categoría (sin comprobante adjunto — D4): alta,
  edición sin límite de tiempo, anulación solo dentro de la ventana de
  gracia de 10 min
- Modelo Empleado (desacoplado de Usuario) — alta, edición, baja/reactivación
- SueldoMovimiento (SUELDO_BASE/ADELANTO/BONO/DESCUENTO) — ledger
  append-only, reversión con ventana de gracia
- Cálculo de neto mensual (solo informativo), por mes calendario
**Una migración** — a diferencia de Créditos (Sprint 11), `Egreso`/
`SueldoMovimiento` sí necesitaron schema nuevo: `Egreso` gana `creadoEn`/
`revertido`/`revertidoEn`, `SueldoMovimiento` gana `revertido`/
`revertidoEn`. No destructiva, `Egreso`/`Empleado`/`SueldoMovimiento` ya
existían completos desde Sprint 0, sin código encima hasta este sprint.
**Corrección real en plena ejecución, a pedido del Product Owner
(post-S12-20):** el banner explícito "no afecta la caja de ventas" que
pedía el brief original se implementó y luego se sacó de las tres
pantallas después de verlo en uso — el aislamiento real entre Egresos/
Personal y la caja de Ventas/Créditos sigue intacto a nivel de código,
solo cambió la comunicación visual. De paso se agregó un botón "Volver a
Personal" en el detalle de un empleado.
**Specs:** `specs/sprint-12-egresos-personal/`
**Detalle de ejecución (migración de schema, ventanas de gracia
verificadas con backdate real contra Neon para ambos guards, corrección
del banner en plena ejecución, historial de Precio por Kilo agregado la
misma sesión fuera de alcance; 553 tests, cobertura 100%/100%/100%/100%
en services nuevos; sin bugs de código sobrevivientes):** `memory/estado-proyecto.md`

---

## 🚀 RELEASE 3 — CAMPO REAL

### ✅ Sprint 13 — PWA e instalación (24 pts) — COMPLETADO salvo S13-21
**Goal:** la app se instala en el celular, pantallas operativas abren sin señal.
- `@serwist/turbopack` + manifest + iconos maskable (D7 — no next-pwa,
  incompatible con Turbopack)
- Estrategias de caché (NetworkFirst para las 3 pantallas de campo,
  balde propio por formato — documento y RSC —, `...defaultCache` para
  el resto)
- Precarga de catálogos al login (`PrecargarCatalogos`)
- Prompt instalación Android (banner + botón manual de respaldo en el
  Sidebar) + tutorial iOS ("Compartir → Añadir a inicio")
- Indicador de conectividad
**Sin ninguna migración de schema** — todo el sprint es infraestructura
de Service Worker/manifest.
**11 hallazgos reales durante la verificación en Android real**, entre
ellos una carrera real de `beforeinstallprompt` contra la hidratación de
React, desalojo LRU de caché por compartir balde con otras rutas, el
Service Worker registrándose recién después del login (así que
`beforeinstallprompt` no llegaba a tiempo), un evento de instalación de
un solo uso que no se limpiaba tras usarlo, y una advertencia nativa de
Chrome de "contraseña no segura" compitiendo por la misma superficie del
navegador que el diálogo de instalación. Verificado en vivo contra
Neon/Upstash reales que guardar sin señal falla explícito sin perder ni
duplicar datos, y que el rate limit operativo (60/min, existente desde
Sprint 1) responde tal como está documentado.
**Único ítem pendiente:** S13-21 (verificación en iPhone real), en
espera explícita del Product Owner — no bloqueante para seguir. Rama
`feat/S13-pwa-instalacion` sin mergear a `main` todavía.
**Specs:** `specs/sprint-13-pwa-instalacion/`
**Detalle completo (los 11 hallazgos, decisiones de negocio
confirmadas, verificación en vivo):** `memory/estado-proyecto.md`

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