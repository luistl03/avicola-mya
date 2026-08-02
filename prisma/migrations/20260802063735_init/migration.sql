-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('GERENTE', 'OPERARIO');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoLote" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "CategoriaBitacora" AS ENUM ('ALIMENTACION', 'VACUNACION', 'OBSERVACION');

-- CreateEnum
CREATE TYPE "TipoMortalidad" AS ENUM ('MUERTE', 'DESCARTE');

-- CreateEnum
CREATE TYPE "TipoPaquete" AS ENUM ('PURO', 'MIXTO');

-- CreateEnum
CREATE TYPE "EstadoPaquete" AS ENUM ('DISPONIBLE', 'VENDIDO', 'ROTO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoBandeja" AS ENUM ('DISPONIBLE', 'VENDIDO');

-- CreateEnum
CREATE TYPE "TipoMovimientoSueltos" AS ENUM ('RECOLECCION', 'CONSOLIDACION_SALIDA', 'ROTURA_PAQUETE_ENTRADA', 'VENTA_SUELTO', 'REVERSION', 'AJUSTE_GERENTE');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('MAYORISTA', 'MINORISTA', 'EVENTUAL');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoDetalleVenta" AS ENUM ('PAQUETE', 'BANDEJA', 'SUELTO');

-- CreateEnum
CREATE TYPE "EstadoCredito" AS ENUM ('PENDIENTE', 'LIQUIDADO');

-- CreateEnum
CREATE TYPE "CategoriaEgreso" AS ENUM ('ALIMENTOS', 'INSUMOS_VACUNAS', 'SERVICIOS', 'MANTENIMIENTO', 'VARIOS');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "TipoSueldoMovimiento" AS ENUM ('SUELDO_BASE', 'ADELANTO', 'BONO', 'DESCUENTO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celular" TEXT,
    "email" TEXT,
    "rol" "Rol" NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionActiva" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocada" BOOLEAN NOT NULL DEFAULT false,
    "revocadaEn" TIMESTAMP(3),

    CONSTRAINT "SesionActiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "estadoAntes" JSONB,
    "estadoDespues" JSONB,
    "usuarioId" TEXT NOT NULL,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Galpon" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "capacidadMaxima" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Galpon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "avesIniciales" INTEGER NOT NULL,
    "avesVivas" INTEGER NOT NULL,
    "estado" "EstadoLote" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialUbicacionLote" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "fechaEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaSalida" TIMESTAMP(3),

    CONSTRAINT "HistorialUbicacionLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitacoraGlobal" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,
    "categoria" "CategoriaBitacora" NOT NULL,
    "contenido" TEXT NOT NULL,

    CONSTRAINT "BitacoraGlobal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroMortalidad" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoMortalidad" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroMortalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paquete" (
    "id" TEXT NOT NULL,
    "peso" DECIMAL(6,3) NOT NULL,
    "tipo" "TipoPaquete" NOT NULL,
    "estado" "EstadoPaquete" NOT NULL DEFAULT 'DISPONIBLE',
    "registroRecoleccionId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaqueteOrigen" (
    "id" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "PaqueteOrigen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandejaSuelta" (
    "id" TEXT NOT NULL,
    "peso" DECIMAL(6,3) NOT NULL,
    "estado" "EstadoBandeja" NOT NULL DEFAULT 'DISPONIBLE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BandejaSuelta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandejaOrigen" (
    "id" TEXT NOT NULL,
    "bandejaId" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "BandejaOrigen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioSueltos" (
    "id" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventarioSueltos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoSueltos" (
    "id" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "tipo" "TipoMovimientoSueltos" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "referenciaId" TEXT,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoSueltos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroRecoleccion" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "galponId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "cantidadTotal" INTEGER NOT NULL,
    "creadoEnCliente" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RegistroRecoleccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celular" TEXT,
    "direccion" TEXT,
    "tipo" "TipoCliente" NOT NULL,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioKilo" (
    "id" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "PrecioKilo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCobrado" DECIMAL(10,2) NOT NULL,
    "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "metodoPago" "MetodoPago" NOT NULL,
    "montoContado" DECIMAL(10,2),
    "montoCredito" DECIMAL(10,2),

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleVenta" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "tipo" "TipoDetalleVenta" NOT NULL,
    "paqueteId" TEXT,
    "bandejaId" TEXT,
    "galponId" TEXT,
    "loteId" TEXT,
    "cantidadUnidades" INTEGER,
    "pesoKg" DECIMAL(6,3) NOT NULL,
    "precioKiloAplicado" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "DetalleVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoturaPaquete" (
    "id" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "pesoExtraido" DECIMAL(6,3) NOT NULL,
    "unidadesExtraidas" INTEGER NOT NULL,
    "unidadesDevueltas" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoturaPaquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credito" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "montoPagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCredito" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "Credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialAbonos" (
    "id" TEXT NOT NULL,
    "creditoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" "MetodoPago" NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "HistorialAbonos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Egreso" (
    "id" TEXT NOT NULL,
    "categoria" "CategoriaEgreso" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "Egreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celular" TEXT,
    "cargo" TEXT,
    "usuarioId" TEXT,
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SueldoMovimiento" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoSueldoMovimiento" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT,

    CONSTRAINT "SueldoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");

-- CreateIndex
CREATE INDEX "Usuario_estado_idx" ON "Usuario"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "SesionActiva_jti_key" ON "SesionActiva"("jti");

-- CreateIndex
CREATE INDEX "SesionActiva_usuarioId_idx" ON "SesionActiva"("usuarioId");

-- CreateIndex
CREATE INDEX "SesionActiva_jti_revocada_idx" ON "SesionActiva"("jti", "revocada");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "AuditLog_creadoEn_idx" ON "AuditLog"("creadoEn");

-- CreateIndex
CREATE INDEX "Galpon_nombre_idx" ON "Galpon"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Lote_codigo_key" ON "Lote"("codigo");

-- CreateIndex
CREATE INDEX "Lote_estado_idx" ON "Lote"("estado");

-- CreateIndex
CREATE INDEX "Lote_fechaIngreso_idx" ON "Lote"("fechaIngreso");

-- CreateIndex
CREATE INDEX "HistorialUbicacionLote_loteId_fechaSalida_idx" ON "HistorialUbicacionLote"("loteId", "fechaSalida");

-- CreateIndex
CREATE INDEX "HistorialUbicacionLote_galponId_idx" ON "HistorialUbicacionLote"("galponId");

-- CreateIndex
CREATE INDEX "BitacoraGlobal_fecha_idx" ON "BitacoraGlobal"("fecha");

-- CreateIndex
CREATE INDEX "BitacoraGlobal_categoria_idx" ON "BitacoraGlobal"("categoria");

-- CreateIndex
CREATE INDEX "RegistroMortalidad_loteId_fecha_idx" ON "RegistroMortalidad"("loteId", "fecha");

-- CreateIndex
CREATE INDEX "Paquete_estado_idx" ON "Paquete"("estado");

-- CreateIndex
CREATE INDEX "Paquete_tipo_idx" ON "Paquete"("tipo");

-- CreateIndex
CREATE INDEX "Paquete_registroRecoleccionId_idx" ON "Paquete"("registroRecoleccionId");

-- CreateIndex
CREATE INDEX "PaqueteOrigen_paqueteId_idx" ON "PaqueteOrigen"("paqueteId");

-- CreateIndex
CREATE INDEX "BandejaSuelta_estado_idx" ON "BandejaSuelta"("estado");

-- CreateIndex
CREATE INDEX "BandejaOrigen_bandejaId_idx" ON "BandejaOrigen"("bandejaId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioSueltos_galponId_loteId_key" ON "InventarioSueltos"("galponId", "loteId");

-- CreateIndex
CREATE INDEX "MovimientoSueltos_galponId_loteId_creadoEn_idx" ON "MovimientoSueltos"("galponId", "loteId", "creadoEn");

-- CreateIndex
CREATE INDEX "RegistroRecoleccion_creadoEn_revertido_idx" ON "RegistroRecoleccion"("creadoEn", "revertido");

-- CreateIndex
CREATE INDEX "RegistroRecoleccion_loteId_idx" ON "RegistroRecoleccion"("loteId");

-- CreateIndex
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- CreateIndex
CREATE INDEX "Cliente_estado_idx" ON "Cliente"("estado");

-- CreateIndex
CREATE INDEX "PrecioKilo_vigenteDesde_idx" ON "PrecioKilo"("vigenteDesde");

-- CreateIndex
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");

-- CreateIndex
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");

-- CreateIndex
CREATE INDEX "Venta_metodoPago_idx" ON "Venta"("metodoPago");

-- CreateIndex
CREATE INDEX "DetalleVenta_ventaId_idx" ON "DetalleVenta"("ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "RoturaPaquete_paqueteId_key" ON "RoturaPaquete"("paqueteId");

-- CreateIndex
CREATE UNIQUE INDEX "Credito_ventaId_key" ON "Credito"("ventaId");

-- CreateIndex
CREATE INDEX "Credito_estado_fechaLimite_idx" ON "Credito"("estado", "fechaLimite");

-- CreateIndex
CREATE INDEX "Credito_clienteId_idx" ON "Credito"("clienteId");

-- CreateIndex
CREATE INDEX "HistorialAbonos_creditoId_idx" ON "HistorialAbonos"("creditoId");

-- CreateIndex
CREATE INDEX "Egreso_fecha_idx" ON "Egreso"("fecha");

-- CreateIndex
CREATE INDEX "Egreso_categoria_idx" ON "Egreso"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE INDEX "SueldoMovimiento_empleadoId_fecha_idx" ON "SueldoMovimiento"("empleadoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_usuarioId_idx" ON "PushSubscription"("usuarioId");

-- AddForeignKey
ALTER TABLE "SesionActiva" ADD CONSTRAINT "SesionActiva_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialUbicacionLote" ADD CONSTRAINT "HistorialUbicacionLote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialUbicacionLote" ADD CONSTRAINT "HistorialUbicacionLote_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BitacoraGlobal" ADD CONSTRAINT "BitacoraGlobal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroMortalidad" ADD CONSTRAINT "RegistroMortalidad_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroMortalidad" ADD CONSTRAINT "RegistroMortalidad_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroMortalidad" ADD CONSTRAINT "RegistroMortalidad_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paquete" ADD CONSTRAINT "Paquete_registroRecoleccionId_fkey" FOREIGN KEY ("registroRecoleccionId") REFERENCES "RegistroRecoleccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaqueteOrigen" ADD CONSTRAINT "PaqueteOrigen_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "Paquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaqueteOrigen" ADD CONSTRAINT "PaqueteOrigen_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandejaOrigen" ADD CONSTRAINT "BandejaOrigen_bandejaId_fkey" FOREIGN KEY ("bandejaId") REFERENCES "BandejaSuelta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandejaOrigen" ADD CONSTRAINT "BandejaOrigen_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioSueltos" ADD CONSTRAINT "InventarioSueltos_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioSueltos" ADD CONSTRAINT "InventarioSueltos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoSueltos" ADD CONSTRAINT "MovimientoSueltos_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoSueltos" ADD CONSTRAINT "MovimientoSueltos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoSueltos" ADD CONSTRAINT "MovimientoSueltos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRecoleccion" ADD CONSTRAINT "RegistroRecoleccion_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRecoleccion" ADD CONSTRAINT "RegistroRecoleccion_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroRecoleccion" ADD CONSTRAINT "RegistroRecoleccion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioKilo" ADD CONSTRAINT "PrecioKilo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "Paquete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_bandejaId_fkey" FOREIGN KEY ("bandejaId") REFERENCES "BandejaSuelta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_galponId_fkey" FOREIGN KEY ("galponId") REFERENCES "Galpon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoturaPaquete" ADD CONSTRAINT "RoturaPaquete_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "Paquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credito" ADD CONSTRAINT "Credito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialAbonos" ADD CONSTRAINT "HistorialAbonos_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "Credito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialAbonos" ADD CONSTRAINT "HistorialAbonos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Egreso" ADD CONSTRAINT "Egreso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SueldoMovimiento" ADD CONSTRAINT "SueldoMovimiento_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones manuales (Prisma no las puede expresar) — ver memory/modelo-datos.md
-- CheckConstraint
ALTER TABLE "InventarioSueltos" ADD CONSTRAINT "InventarioSueltos_cantidad_check" CHECK ("cantidad" >= 0);

-- Partial unique index: un mismo loteId no puede tener dos filas con fechaSalida IS NULL (una única ubicación abierta a la vez)
CREATE UNIQUE INDEX "HistorialUbicacionLote_loteId_abierta_key" ON "HistorialUbicacionLote"("loteId") WHERE "fechaSalida" IS NULL;
