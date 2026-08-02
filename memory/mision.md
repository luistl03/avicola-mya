# Misión del Proyecto

## Qué problema resuelve
Reemplazar el cuaderno físico y las hojas de cálculo sueltas que usa la granja
para llevar producción, ventas y finanzas. Hoy esa información vive dispersa,
se pierde, y no hay forma de auditar descuadres de inventario o cobranza atrasada.

## Para quién
- **Gerente**: dueño/administrador de la granja. Necesita visibilidad total:
  finanzas, créditos vencidos, reportes, configuración de la estructura física.
- **Operario**: trabajador de campo. Necesita rapidez y simplicidad: registrar
  producción, mortalidad, ventas — desde el celular, muchas veces sin señal.

No hay un tercer rol de "Vendedor" separado: cualquier Operario puede operar
también el Punto de Venta.

## Alcance (qué SÍ)
- Gestión de galpones, lotes y su historial de ubicación.
- Registro diario de producción (huevos), mortalidad y bitácora de turno.
- Inventario de tres tipos: paquetes cerrados (180u), bandejas (30u), sueltos.
- Punto de venta con múltiples métodos de pago, crédito y cobranza.
- Control de egresos y planilla informativa de personal.
- Funcionamiento sin conexión a internet en zonas de la granja sin señal.
- Reportes y alertas para el Gerente.

## Fuera de alcance (qué NO, por ahora)
- No es una app orientada a clientes externos (no hay catálogo público, no hay
  autoservicio de compra).
- No integra facturación electrónica ni SUNAT en la v1.
- No hay multi-granja / multi-tenant — es una instancia para una sola granja.
- No hay integración con balanza física por Bluetooth/USB en la v1 — el peso
  se digita manualmente después de leerlo en la báscula (ver D1 en
  `decisiones-tecnicas.md`).

## Cómo se mide el éxito
- El Gerente y el Operario dejan de usar el cuaderno físico por completo.
- Cero descuadres de inventario no explicados (el ledger de movimientos permite
  reconstruir cualquier saldo desde cero).
- El Operario puede trabajar 4+ horas sin señal sin perder ni duplicar datos.