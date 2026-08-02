# Decisiones Técnicas (D1–D6) — CERRADAS

Estas decisiones fueron confirmadas por el Product Owner (Gerente) antes de
iniciar la migración del Sprint 0. Cambiar cualquiera de estas después de
tener datos reales en producción tiene un costo alto — si se necesita
revisar alguna, se documenta como decisión nueva, no se sobreescribe esta.

## D1 — Captura de peso en balanza ✅ CERRADO
**Decisión:** digitación manual. El operario lee el peso en la báscula
física y lo escribe en el campo correspondiente de la pantalla. No hay
integración por Bluetooth/USB/API con la balanza.
**Impacto:** confirma el diseño de UI ya definido en los Sprints 5, 7, 9
y 10 — campos de peso como input numérico simple, sin lógica de hardware.

## D2 — Bitácora sin vínculo a galpón ✅ CERRADO
**Decisión:** un registro de `BitacoraGlobal` es siempre una nota general
de toda la granja, sin selección de galpones específicos. La búsqueda se
hace por texto libre (`ILIKE` sobre `contenido`), no por filtro estructurado
de ubicación.
**Impacto:** se elimina la necesidad del modelo `BitacoraGalpon` del schema.
La tarea **S4-4 del Sprint 4 queda descartada** (chips de selección de
galpón). Reduce la fricción del operario al escribir una nota — no tiene
que pensar en qué galpón marcar antes de guardar.

## D3 — Instancia única (no multi-granja) ✅ CERRADO
**Decisión:** el sistema es para una sola granja, para siempre. No hay
tabla `Granja` ni aislamiento de datos por tenant.
**Impacto:** simplifica el schema completo — sin `granjaId` repartido en
cada tabla, sin lógica de aislamiento de datos entre tenants. Si en algún
momento futuro esto cambiara, sería una migración estructural mayor, no
contemplada en el diseño actual.

## D4 — Sin adjuntos/comprobantes ✅ CERRADO
**Decisión:** no se suben fotos ni comprobantes a los registros de Egreso.
**Impacto:** el modelo `Egreso` no incluye campo de archivo adjunto
(`comprobanteUrl` queda descartado). No se necesita Vercel Blob Storage
ni ninguna solución de almacenamiento de archivos como dependencia del
stack — reduce una integración completa del proyecto.

## D5 — Zona horaria ✅ CERRADO
**Decisión:** `America/Lima` fija en toda la aplicación (servidor y
cliente). No se implementa selector de zona horaria — es una instancia
de una sola granja en Perú.
**Impacto:** afecta cualquier cálculo de plazos (ventana de gracia de
10 min, fecha límite de créditos, cron de detección de vencimientos).
Todos los timestamps se muestran y calculan en esta zona horaria.

## D6 — Backups: plan gratuito de Neon (riesgo aceptado) ✅ CERRADO
**Decisión:** se usa el plan gratuito de Neon para backups/PITR
(Point-in-Time Recovery) en la v1, en vez de contratar un plan pago
desde el inicio.
**Riesgo aceptado explícitamente:** el plan gratuito tiene una ventana
de recuperación más corta que los planes pagos. Si ocurre una corrupción
de datos o borrado accidental, hay menos días hacia atrás disponibles
para restaurar. Esto es aceptable para el volumen actual de la granja,
pero **debe re-evaluarse** cuando:
  - el volumen de créditos/dinero gestionado crezca significativamente, o
  - el número de usuarios activos aumente, o
  - haya presupuesto disponible para upgrade.
**Acción de seguimiento:** agregar este ítem a la tabla de riesgos del
plan SCRUM (`memory/` o el documento de riesgos), no dejarlo solo aquí.

---

## Historial de revisión
Si alguna de estas decisiones cambia en el futuro, se agrega una sección
nueva abajo con fecha, motivo del cambio y qué se migró — nunca se
edita el registro original de arriba.