# Modelo de Datos

La fuente de verdad es `prisma/schema.prisma` en el código del proyecto.
Este documento resume las reglas y decisiones que hay que tener presentes
al leer o modificar ese schema — no repite el schema completo para no
duplicar la fuente de verdad en dos lugares que se puedan desincronizar.

## Resumen: 26 modelos, agrupados por módulo

1. **Usuarios y seguridad**: Usuario, SesionActiva, AuditLog
2. **Galpones y lotes**: Galpon, Lote, HistorialUbicacionLote
3. **Bitácora**: BitacoraGlobal (sin vínculo a galpón — ver D2)
4. **Mortalidad**: RegistroMortalidad
5. **Recolección e inventario**: Paquete, PaqueteOrigen, BandejaSuelta,
   BandejaOrigen, InventarioSueltos, MovimientoSueltos, RegistroRecoleccion
6. **Clientes**: Cliente
7. **Punto de venta**: PrecioKilo, Venta, DetalleVenta, RoturaPaquete
8. **Créditos**: Credito, HistorialAbonos
9. **Egresos y personal**: Egreso, Empleado, SueldoMovimiento
10. **Notificaciones**: PushSubscription

## Reglas que todo cambio al schema debe respetar

- **Dinero siempre `Decimal`**, nunca `Float` — ver `convenciones.md`.
- **`onDelete: Restrict`** por defecto en cualquier entidad de negocio
  (Usuario, Cliente, Galpon, Lote, Paquete, BandejaSuelta, Venta, Credito).
  Nunca se borra un registro que ya tiene historial encima — se usa
  `estado` (soft delete/anulación).
- **`onDelete: Cascade`** solo en tablas que son registros hijos sin
  sentido propio fuera de su padre (HistorialUbicacionLote, PaqueteOrigen,
  BandejaOrigen, DetalleVenta, HistorialAbonos).
- **Ningún `DELETE` físico** en producción sobre entidades de negocio —
  siempre cambio de `estado` o registro de tipo `ANULADO`.
- **IDs siempre UUID**, nunca autoincrement — es requisito del contrato
  offline-ready (ver `convenciones.md`).

## Campos calculados: nunca se guardan valores que se desactualizan solos
Cuando un valor se puede derivar por completo de otros campos + la fecha
actual (edad, antigüedad, "días desde"), **no se persiste** — se calcula
al leer, en una función pura de `server/services/`. Guardarlo significaría
o bien un job que lo recalcule solo (no existe en este proyecto) o un
dato que queda mintiendo apenas pasa el tiempo. Ejemplo real:
`Lote.edadInicialSemanas` (Sprint 3, agregado post-cierre a pedido del
Product Owner) guarda la edad de las aves en semanas *al momento de
`fechaIngreso`* — la "edad actual" NUNCA se guarda, la calcula
`calcularEdadEnSemanas()` (`server/services/lote.ts`) a partir de ese
valor + `fechaIngreso` + una `fechaReferencia` que decide quien llama
(hoy si el lote está ACTIVO; la `fechaSalida` de su última
`HistorialUbicacionLote` si está INACTIVO, para que la edad quede
"congelada" en el momento de finalizar y no siga subiendo después).

## Decisiones que ya moldearon este schema (ver `decisiones-tecnicas.md`)

- **D2**: no existe modelo `BitacoraGalpon`. `BitacoraGlobal` es siempre
  general, búsqueda por texto libre.
- **D3**: no existe modelo `Granja` ni campo `granjaId` en ninguna tabla.
  Instancia única.
- **D4**: `Egreso` no tiene campo de archivo adjunto.

## Índices que no son obvios y por qué existen

- `Credito(estado, fechaLimite)` — el panel de alertas del Gerente filtra
  exactamente por esta combinación en cada login.
- `HistorialUbicacionLote(loteId, fechaSalida)` — encuentra la ubicación
  ACTUAL de un lote (`fechaSalida = null`) sin recorrer todo el historial.
- `Paquete(estado)` / `BandejaSuelta(estado)` — el POS filtra
  constantemente por `DISPONIBLE`, es la query más frecuente del sistema.
- `MovimientoSueltos(galponId, loteId, creadoEn)` — soporta la función
  `reconstruirSaldo()` que audita descuadres de inventario.
- `RegistroRecoleccion(creadoEn, revertido)` — soporta el botón de
  corrección de 10 minutos (ver Sprint 6 del plan SCRUM).
- `InventarioSueltos` usa `@@unique([galponId, loteId])` en vez de índice
  simple — debe existir un único contador vivo por esa combinación,
  nunca filas duplicadas.

## Restricciones que Prisma no puede expresar (requieren SQL manual)

Estas se agregan en la migración generada por `prisma migrate dev`,
editando el archivo `.sql` antes de aplicarlo — tarea S0-5 del Sprint 0:

- `CHECK (cantidad >= 0)` en `InventarioSueltos.cantidad`.
- Índice único parcial en `HistorialUbicacionLote` que garantice que un
  mismo `loteId` no tenga dos filas con `fechaSalida IS NULL` a la vez
  (solo puede haber una ubicación abierta por lote).

## Cómo evolucionar este documento

Cuando se agregue o modifique un modelo en `schema.prisma`, se actualiza
este resumen en el mismo PR — no después. Si la migración necesita SQL
manual nuevo, se documenta en la sección de arriba.