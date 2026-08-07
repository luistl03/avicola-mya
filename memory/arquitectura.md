# ADR-000: Arquitectura del Proyecto

## Decisión: Arquitectura en Capas (no MVC)

Este proyecto usa un patrón de **Arquitectura en Capas** adaptado a Server
Actions de Next.js. No es MVC clásico: en MVC el Controller habla directo con
el Model. Acá hay una capa intermedia (`services`) que aísla la lógica de
negocio de la persistencia.

### Las tres capas

```
Componente (Vista)
      ↓
server/actions/<modulo>.ts     ← "frontera": recibe input, valida Zod,
                                   verifica sesión + rol, llama al service
      ↓
server/services/<modulo>.ts    ← lógica de negocio PURA. Sin Prisma.
                                   Recibe datos, devuelve decisiones.
                                   100% testeable sin levantar BD.
      ↓
server/repositories/<modulo>.ts ← ÚNICO lugar que importa y usa Prisma.
```

### Regla de oro
- Un **componente** nunca importa Prisma.
- Un **service** nunca importa Prisma.
- Solo **repositories** toca la base de datos.

Esto es lo que permite testear algo como "romper paquete y repartir la
devolución proporcionalmente entre galpones de origen" con un test unitario
puro, sin necesidad de una base de datos real corriendo.

## Estructura de carpetas del código

```
src/
  app/
    (public)/login/page.tsx
    (app)/                        # protegido por middleware
      layout.tsx                  # shell + sidebar + idle-timer
      dashboard/
      # Nota (post-Sprint 2): el prefijo compartido operacion//gestion/
      # de este árbol ilustrativo se abandonó por URLs planas por
      # pantalla (p. ej. /usuarios, no /gestion/usuarios) — el control de
      # acceso por rol vive en server/auth/rbac.ts (RUTAS_POR_ROL, regla
      # por ruta exacta), no en el prefijo de carpeta. Ver
      # memory/estado-proyecto.md, sección "Identidad visual, shell y UX
      # de mobile", para el motivo completo.
      usuarios/                   # GERENTE (Sprint 2)
      # resto de pantallas (Sprint 3+): galpones/ lotes/ clientes/
      # creditos/ egresos/ personal/ reportes/ configuracion/
      # recoleccion/ mortalidad/ bitacora/ consolidacion/ pos/ — todas
      # rutas planas, sin prefijo
    api/
      auth/[...nextauth]/route.ts
      sync/route.ts               # cola offline (batch, idempotente)
      health/route.ts             # keep-alive de Neon
  components/
    ui/                           # shadcn — no editar a mano
    domain/                       # componentes de negocio reutilizables
    layout/
  server/
    actions/<modulo>.ts
    services/<modulo>.ts
    repositories/<modulo>.ts
    auth/
  lib/
    prisma.ts  zod/  offline/  utils/  constants.ts
prisma/
  schema.prisma  migrations/  seed.ts
tests/
  unit/  integration/  e2e/
```

## Middleware y Edge Runtime — restricción importante

`middleware.ts` corre en **Edge Runtime**, que no soporta Prisma con conexión
directa a Postgres. Por eso:

- El **middleware** valida ÚNICAMENTE la firma y el rol embebidos en el JWT
  (sin consultar la base de datos) → responde `403` instantáneo si el rol
  no corresponde a la ruta.
- La **revocación de sesión** (`SesionActiva`) se verifica en el wrapper
  `withAuth()` dentro de las Server Actions, que corren en Node runtime y
  sí pueden usar Prisma con normalidad.

No se intenta consultar la BD desde el middleware. Si en el futuro se
necesita revocación instantánea a nivel de navegación (no solo de acción),
la alternativa es guardar el estado de revocación en Upstash Redis, que sí
tiene SDK compatible con Edge — pero esto no es necesario para la v1.

## Git
- Trunk-based: `main` protegida + ramas `feat/S3-mudanza-lotes`.
- Conventional Commits: `feat(recoleccion): calcular paquetes y residuo`.
- PR obligatorio con CI en verde. Squash merge.