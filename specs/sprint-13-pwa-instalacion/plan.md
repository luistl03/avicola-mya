# Plan técnico — Sprint 13

## Punto de partida real del código (verificado antes de planificar)
- `package.json`: Next 16.2.12, React 19.2.4, sin ninguna dependencia de
  PWA. Scripts (`dev`/`build`/`start`) usan Turbopack por defecto (Next 16
  no necesita flag `--turbopack`, es el default).
- `public/`: `avicolamya-imagotipo.png`, `avicolamya-isotipo.png`, más los
  SVG placeholder de `create-next-app` (`file.svg`, `globe.svg`, etc. —
  sin uso real, no se tocan). Sin `manifest.json`, sin `icons/`, sin
  `sw.js`.
- `src/proxy.ts`: matcher actual
  `"/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"`
  — no excluye `.webmanifest` ni rutas sin extensión de archivo (como
  `/serwist/[path]`).
- `src/app/layout.tsx`: `RootLayout` ya es un Server Component async que
  lee `auth()` y `cookies()`, renderiza `<AppSidebar>`/`<IdleTimer>` solo
  si hay `usuario` — mismo punto de montaje para los componentes cliente
  nuevos de este sprint (`InstallPromptAndroid`, `IosInstallBanner`,
  `PrecargarCatalogos`).
- `src/components/layout/sidebar.tsx`: `SidebarFooter` ya muestra
  nombre/rol del usuario — el indicador de conectividad y el botón
  "Instalar app" se agregan ahí, mismo bloque.
- `src/lib/constants.ts`: sin ninguna constante de PWA todavía — este
  sprint agrega `INSTALL_PROMPT_COOLDOWN_DIAS = 30` (decisión 3). **No**
  agrega una constante para el valor de 24h de decisión 6 — desde que
  S13-5 reemplazó la regla `NetworkFirst` propia por `defaultCache` (que
  ya trae ese valor hardcodeado internamente en la librería), no queda
  ningún código propio que la consuma; una constante sin consumidor real
  sería solo documentación suelta, no una fuente de verdad compartida
  (ver S13-8 en `tasks.md`).
- `memory/decisiones-tecnicas.md`: D1-D6 cerradas, sin ninguna sobre
  librería PWA — este sprint agrega D7 (ver `spec.md`).
- `memory/stack-tecnologico.md`: sección "Offline / PWA" dice "next-pwa o
  Serwist" — este sprint la cierra.

## Elección de librería (D7): por qué Serwist y no next-pwa, en código
`next-pwa` engancha su lógica de generación del Service Worker al
`webpack()` de `next.config.js` (`config.plugins.push(new GenerateSW(...))`
o similar, según la versión) — no tiene ningún punto de integración para
Turbopack, porque Turbopack no ejecuta la config de `webpack()` en
absoluto. La única forma de usar `next-pwa` en este proyecto sería correr
`next build --webpack` en producción mientras `next dev` sigue en
Turbopack — dos bundlers distintos entre entornos, con el riesgo real de
"funciona en dev, se rompe en build" (o viceversa) que Sprint 0 evitó a
propósito al aceptar Turbopack estable por defecto en vez de quedarse en
Webpack.

`@serwist/turbopack` (Serwist 9, soporte de Turbopack backporteado
diciembre 2025) no depende del hook de `webpack()` — genera el Service
Worker vía una ruta de Next (`app/serwist/[path]/route.ts`) que usa
`esbuild` para compilar `app/sw.ts` en tiempo de build/dev, sin importar
qué bundler compila el resto de la app. Mismo bundler (Turbopack) en dev y
en build, cero configuración condicional por entorno.

## Dependencias nuevas
```bash
npm install serwist
npm install -D @serwist/turbopack esbuild sharp
```
**Instalar versiones exactas compatibles con Next 16.2.12** (mismo
criterio que Prisma en Sprint 0 — nunca `@latest` a ciegas): confirmar en
`npm view @serwist/turbopack versions` y en la matriz de compatibilidad de
`serwist.pages.dev/docs/next/turbo` cuál es la última versión que declara
soporte para Next 16 antes de fijarla en `package.json`, S13-1. `sharp`
es solo `devDependency` — se usa una vez para generar los iconos
(S13-3), no en runtime.

## Corrección de `src/proxy.ts` (H6 — prerequisito de todo lo demás)
```ts
export const config = {
  // Excluye assets internos de Next, archivos estáticos de public/ por
  // extensión, el manifest de la PWA y la ruta de servicio del Service
  // Worker (Serwist) — sin esto, un dispositivo sin sesión (incluido el
  // primer chequeo de instalabilidad de Chrome desde /login) recibe un
  // 302 a /login en vez del manifest/SW real. Mismo bug que ya pasó una
  // vez con el logo (Sprint 1/2, ver memory/estado-proyecto.md).
  matcher: [
    "/((?!_next/static|_next/image|serwist|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|webmanifest)$).*)",
  ],
};
```
**Verificación obligatoria de esta tarea (no dar por buena solo por
lectura):** `curl -I http://localhost:3000/manifest.webmanifest` y
`curl -I http://localhost:3000/serwist/<lo que exponga la ruta real>` **sin
ninguna cookie de sesión** — ambos deben responder `200` con el
content-type correcto, nunca `302`/`307` a `/login`. Repetir después de
S13-4 (cuando la ruta de Serwist ya exista), no antes — hasta entonces el
`curl` del SW da 404 legítimo (la ruta no existe todavía), no hay que
confundir eso con que el guard esté mal.

## `app/manifest.ts` (convención nativa de Next — no `public/manifest.json` estático)
```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avícola M&A",
    short_name: "Avícola M&A",
    description: "Sistema de gestión interna — Avícola M&A",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff", // mismo valor que --background en globals.css :root
    theme_color: "#f4900f", // --primary, ver memory/estado-proyecto.md "Paleta de color"
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```
Next genera automáticamente `/manifest.webmanifest` y el `<link rel="manifest">`
correspondiente — no hace falta declararlo a mano en `metadata` de
`layout.tsx`. `theme_color`/`background_color` **confirmados en S13-1**
leyendo `globals.css` directo (no asumidos): `--background: oklch(1 0 0)`
(light) = `#ffffff` puro, `--primary: oklch(0.743 0.167 62.74)` (light) =
`#f4900f` (coincide con el valor ya documentado en
`memory/estado-proyecto.md`, sección "Paleta de color"). Son los valores
de **light mode** — el manifest usa un único par estático, sin variante
dark (el spec de Web App Manifest permite `theme_color` por media query en
navegadores recientes, pero no se usa acá: agregar esa variante es una
mejora incremental fuera del alcance de este sprint, no un requisito de
instalabilidad).

## Generación de iconos (`scripts/generar-iconos-pwa.ts`) — implementado en S13-3
**Ejecutado. Desvío real confirmado antes de escribir el código, no
asumido:** `avicolamya-isotipo.png` es un PNG 500x500 **sin canal alfa**
(fondo blanco horneado hasta casi el borde — `trim()` midió el símbolo
real en 470x441, ~94%/88% del lienzo, sin margen suficiente para la safe
zone maskable). El pseudocódigo original de abajo (tachado, se deja como
registro de lo planeado) asumía un recorte transparente para componer
sobre `--primary` — sin alfa, eso dejaba un cuadrado blanco visible dentro
del naranja. La versión real usa fondo **blanco** para los maskable (sin
costura, mismo blanco que el propio isotipo) y recorta el símbolo a su
bounding box real antes de reescalarlo dentro del 80% — ver el código
completo y el detalle de verificación en `scripts/generar-iconos-pwa.ts`
y en `tasks.md` (S13-3).

<details>
<summary>Pseudocódigo original de planificación (superado, no usado tal cual)</summary>

```ts
import sharp from "sharp";

const FUENTE = "public/avicolamya-isotipo.png";

async function generar() {
  // Iconos "any" — el isotipo tal cual, reescalado.
  await sharp(FUENTE).resize(192, 192).toFile("public/icons/icon-192.png");
  await sharp(FUENTE).resize(512, 512).toFile("public/icons/icon-512.png");

  // Maskable — isotipo centrado al 80% del lienzo (safe zone) sobre fondo
  // --primary sólido, para que Android pueda recortarlo a círculo sin
  // perder el símbolo (ver R2 en spec.md).
  for (const size of [192, 512] as const) {
    const contenido = Math.round(size * 0.8);
    const simbolo = await sharp(FUENTE).resize(contenido, contenido).toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: "#f4900f" },
    })
      .composite([{ input: simbolo, gravity: "center" }])
      .png()
      .toFile(`public/icons/icon-${size}-maskable.png`);
  }

  // apple-touch-icon — iOS ignora el manifest para el ícono de home screen,
  // necesita este archivo puntual referenciado desde metadata (ver abajo).
  await sharp(FUENTE).resize(180, 180).toFile("public/apple-touch-icon.png");
}

generar();
```
</details>

## `src/app/layout.tsx` (modifica): metadata de iOS + `appleWebApp`
```ts
export const metadata: Metadata = {
  title: "Avícola M&A",
  description: "Sistema de gestión interna — Avícola M&A",
  icons: {
    icon: "/avicolamya-imagotipo.png",
    apple: "/apple-touch-icon.png", // NUEVO
  },
  appleWebApp: {
    // NUEVO — iOS no lee el manifest para esto, necesita meta tags propios
    capable: true,
    statusBarStyle: "default",
    title: "Avícola M&A",
  },
};
```

## `app/sw.ts` + `app/serwist/[path]/route.ts` + `next.config.ts` — implementados en S13-5
**Implementado. Cinco desvíos reales respecto al pseudocódigo original de
abajo, confirmados leyendo el código fuente instalado de `serwist`,
`@serwist/build` y `@serwist/turbopack` antes de escribir nada (no
asumidos):**
1. `createSerwistRoute` no acepta `revision` como opción de nivel superior
   (`z.strictObject`, lo rechazaría en runtime) y no exporta `HEAD` — solo
   `dynamic`, `dynamicParams`, `revalidate`, `generateStaticParams`, `GET`.
2. `useNativeEsbuild` por defecto depende de la plataforma (`win32` →
   nativo, cualquier otra → `esbuild-wasm`, no instalado) — fijado
   explícito a `true` para no depender de la plataforma de build.
3. `swSrc` es relativo a `cwd` (raíz del repo, no `app/`) — el proyecto
   usa `src/app/`, así que es `"src/app/sw.ts"`.
4. `defaultCache` (`@serwist/turbopack/worker`) ya trae reglas
   `NetworkFirst` a 24h para HTML/RSC/RSC-prefetch de cualquier página
   same-origin — resuelve sola el riesgo R1 (RSC vs. documento HTML) sin
   necesitar una regla `PANTALLAS_DE_CAMPO` propia; se eliminó esa regla
   del diseño original.
5. **Hallazgo de seguridad real:** el constructor de `Serwist` adjunta
   automáticamente el `PrecacheFallbackPlugin` de `fallbacks` a cualquier
   estrategia sin su propio `handlerDidError` — sin protección, una Server
   Action (POST) fallida por falta de red devolvería la página `/offline`
   completa en vez de un error de red real, rompiendo `useActionState`
   del lado del cliente. Corregido dándole a la regla `NetworkOnly` de
   POST su propio `handlerDidError: async () => undefined` (confirmado
   leyendo `Strategy.ts`: si ningún `handlerDidError` devuelve una
   `Response`, el error original se re-lanza tal cual).

Código real completo en `src/app/sw.ts`, `src/app/serwist/[path]/route.ts`,
`next.config.ts`. Verificado con `npm run build` real (no `npm run dev` —
confirmado leyendo el código de `defaultCache` que en dev **todo** el
array se reemplaza por una sola regla `NetworkOnly`, el caché real solo
existe en build de producción): `(serwist) Using esbuild to bundle the
service worker`, `54 precache entries (2797.61 KiB)`, `/manifest.webmanifest`
como ruta estática, `/serwist/[path]` con `generateStaticParams`
pre-renderizando `/serwist/sw.js` y `/serwist/sw.js.map`. Detalle completo
de la verificación en `tasks.md` (S13-5).

<details>
<summary>Pseudocódigo original de planificación (superado, no usado tal cual)</summary>

## `app/sw.ts` (Service Worker, fuente que compila `@serwist/turbopack`)
```ts
import { defaultCache } from "@serwist/turbopack/worker";
import { Serwist, NetworkFirst, CacheFirst, NetworkOnly } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope;

const RUNTIME_CACHE_MAX_AGE_SEGUNDOS = 86_400; // 24h — decisión 6, mismo valor que lib/constants.ts

// Rutas de las 3 pantallas de campo (decisión 1) — cubre tanto el
// documento HTML completo como el fetch de navegación interna RSC de Next
// (mismo pathname, la diferencia está en headers/query del request, no en
// la URL — Serwist matchea por URL, así que una sola entrada por pantalla
// alcanza siempre que el matcher no excluya por método/header; ver R1 en
// spec.md, verificación obligatoria en vivo antes de cerrar H3).
const PANTALLAS_DE_CAMPO = ["/mortalidad", "/bitacora", "/recoleccion"];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST, // build assets (JS/CSS), generado por @serwist/turbopack
  skipWaiting: false, // activación en el próximo reload, sin interrumpir una sesión en curso — ver "Fuera de alcance", actualización silenciosa
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Server Actions y cualquier POST de mutación: nunca cacheadas — si no
    // hay red, fallan explícito (H3, "Fuera de alcance" de spec.md).
    {
      matcher: ({ request }) => request.method !== "GET",
      handler: new NetworkOnly(),
    },
    // Las 3 pantallas de campo — NetworkFirst con caché de respaldo.
    {
      matcher: ({ url }) => PANTALLAS_DE_CAMPO.includes(url.pathname),
      handler: new NetworkFirst({
        cacheName: "pantallas-campo",
        networkTimeoutSeconds: 4,
        plugins: [{ cacheExpiration: { maxAgeSeconds: RUNTIME_CACHE_MAX_AGE_SEGUNDOS } }],
      }),
    },
    // Resto de defaults de Serwist (fuentes, imágenes optimizadas por
    // next/image, _next/static ya cubierto por precache) — CacheFirst para
    // lo que nunca cambia entre deploys.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
```
**Nota real de implementación a verificar en S13-4, no asumida acá:** la
forma exacta de declarar `runtimeCaching`/`fallbacks`/el nombre del import
de `defaultCache` puede diferir entre la versión final instalada de
`serwist`/`@serwist/turbopack` y este pseudocódigo — confirmar contra la
documentación real de la versión fijada (`serwist.pages.dev/docs/next/turbo`)
antes de darlo por bueno, mismo criterio que Sprint 12 aplicó cuando el
pseudocódigo de su propio `plan.md` no coincidía con los helpers reales del
proyecto (`esErrorP2002` → `esErrorDeUnicidad` local).

## `app/serwist/[path]/route.ts` (ruta de servicio, generada según la guía de `@serwist/turbopack`)
```ts
import { createSerwistRoute } from "@serwist/turbopack";

export const { GET, HEAD } = createSerwistRoute({
  swSrc: "app/sw.ts",
  // revision: identifica la versión del SW para forzar actualización —
  // usar el SHA del commit si está disponible en el entorno de build de
  // Vercel (VERCEL_GIT_COMMIT_SHA), con fallback a un valor fijo en local.
  revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
});
```
</details>

## `app/offline/page.tsx` (fallback de navegación, nuevo)
Página estática simple (Server Component, sin fetch a Prisma): ícono +
"Sin conexión" + texto explicando que Mortalidad/Bitácora/Recolección
siguen disponibles sin señal + 3 links a esas rutas. Usa `<PageHeader>`
igual que cualquier pantalla del Shell para mantener consistencia visual,
sin acciones.

## Cómo funciona la precarga de catálogos al login (decisión 1)
No hay ningún endpoint nuevo de "catálogos" — Mortalidad/Bitácora/
Recolección son Server Components que ya hacen su propio fetch de Prisma
(galpones activos, lotes activos) y pasan esos datos como props a los
diálogos cliente. Cachear el documento HTML completo de esas 3 URLs
**incluye** esos catálogos en el momento en que se cachearon. La precarga
entonces es, literalmente, "pedile al navegador que visite esas 3 URLs
apenas hay sesión", dejando que la regla `NetworkFirst` del Service Worker
(ya activo) las guarde solas — no hace falta ninguna API nueva.

### `components/domain/pwa/precargar-catalogos.tsx` (nuevo, client component) — ajustado en S13-17
**Desvío real, encontrado en la verificación en vivo de S13-17 (no un
bug de diseño, un hallazgo del propio riesgo R1 ya anticipado):** el
pseudocódigo original de abajo (tachado) solo hacía un `fetch()` plano
por pantalla, que cachea el documento HTML completo en el bucket `others`
de `defaultCache` — cubre la recarga dura / URL directa, pero **no** el
formato que Next usa para la navegación interna vía `<Link>`
(fetch con header `RSC: 1`, que cae en el bucket `pages-rsc`, distinto).
Sin ese segundo formato precacheado, un clic en el Sidebar sin señal
queda colgado esperando una respuesta de red que nunca llega — confirmado
en vivo con el servidor apagado de verdad (no simulado). Corregido
agregando un segundo `fetch()` por pantalla con el header `RSC: 1`. Código
real completo en `precargar-catalogos.tsx`; el pseudocódigo de abajo
queda como registro histórico de lo que faltaba.

<details>
<summary>Pseudocódigo original de planificación (incompleto — solo cubría la recarga dura, no la navegación interna)</summary>

```tsx
"use client";

import { useEffect } from "react";

const PANTALLAS_DE_CAMPO = ["/mortalidad", "/bitacora", "/recoleccion"];

// Se monta una sola vez por sesión de login (RootLayout, rama `usuario`).
// No usa router.prefetch() de Next (ese solo trae el flight data del
// bundle, no garantiza que pase por el runtime caching del SW de la misma
// forma que un fetch real) — fetch directo, con credentials, deja que sea
// el propio Service Worker (ya interceptando todo GET) quien decida
// cachear la respuesta según su regla NetworkFirst.
export function PrecargarCatalogos() {
  useEffect(() => {
    if (!navigator.onLine) return; // sin sentido intentar precargar sin red
    for (const ruta of PANTALLAS_DE_CAMPO) {
      fetch(ruta, { credentials: "include" }).catch(() => {
        // Silencioso a propósito — un fallo acá no es un error visible
        // para el usuario, es simplemente "no se pudo precargar todavía".
      });
    }
  }, []);
  return null;
}
```
</details>

## `components/domain/pwa/connectivity-indicator.tsx` (nuevo, client component) — implementado en S13-9
**Desvío real respecto al pseudocódigo original, encontrado por el propio
linter, no un bug:** la versión `useState` + `setOnline` dentro de un
`useEffect` (abajo, tachada) dispara `react-hooks/set-state-in-effect`
(`npm run lint` real, no anticipado en la planificación) — "Subscribe for
updates from some external system, calling setState in a callback
function when external state changes", exactamente el caso de uso de
`useSyncExternalStore`. Mismo tipo de hallazgo real que ya documentó
Sprint 4 para `BitacoraMuro` (`memory/convenciones.md`). Reescrito con
`useSyncExternalStore` (código real completo en
`src/components/domain/pwa/connectivity-indicator.tsx`) — sin `useEffect`
ni `useState`, sin el warning.

Receta de color (`bg-emerald-500`/`bg-muted-foreground`) — dos valores
puntuales, no amerita una clase nueva en `globals.css` (regla de
"convenciones.md" aplica a recetas con nombre/semántica reusada en más de
un lugar; acá es un solo punto de estado binario, mismo criterio que ya
distingue el proyecto para etiquetas de clasificación simple).

<details>
<summary>Pseudocódigo original de planificación (superado, no usado tal cual — rechazado por el linter)</summary>

```tsx
"use client";

import { useEffect, useState } from "react";

export function ConnectivityIndicator() {
  // Inicializa en true (asume online) para el primer render del servidor —
  // navigator no existe en SSR; se corrige en el primer efecto del cliente.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const marcarOnline = () => setOnline(true);
    const marcarOffline = () => setOnline(false);
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);
    return () => {
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/70">
      <span
        className={online ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-muted-foreground"}
        aria-hidden
      />
      {!online && <span>Sin conexión</span>}
    </div>
  );
}
```
</details>

## `components/domain/pwa/install-prompt-android.tsx` + `install-app-button.tsx` — implementados en S13-11
**Dos desvíos reales respecto al pseudocódigo original de abajo (tachado,
registro histórico), ambos mejoras de diseño encontradas al implementar,
no bugs de código real todavía existente:**
1. La nota de diseño que dejó pendiente `plan.md` ("`useSyncExternalStore`
   con una suscripción no-op es un atajo, evaluar en vivo") se resolvió
   **sin esperar a la verificación en dispositivo real** — se reemplazó
   por un store mínimo de verdad (`Set<Escucha>` a nivel de módulo,
   `suscribirseAInstalacion`/`obtenerInstalacionDisponible`/
   `establecerEvento`) que notifica a los suscriptores cada vez que el
   evento se captura o se limpia, mismo patrón `useSyncExternalStore` que
   ya usó `connectivity-indicator.tsx` (S13-9). `InstallAppButton` ahora
   se re-renderiza de verdad en el momento exacto en que
   `beforeinstallprompt` llega, no en el próximo render disparado por
   otra razón.
2. **Bug real del pseudocódigo original, encontrado al revisarlo antes de
   copiarlo:** el listener de `appinstalled` se registraba con una función
   flecha inline (`window.addEventListener("appinstalled", () => {...})`)
   sin guardar la referencia — el cleanup del efecto solo hacía
   `removeEventListener("beforeinstallprompt", handler)`, dejando el
   listener de `appinstalled` sin remover nunca (fuga menor, listener
   duplicado si el componente se desmontara y remontara). Corregido
   guardando la referencia (`alInstalar`) y removiendo ambos listeners en
   el cleanup.

Código real completo en
`src/components/domain/pwa/install-prompt-android.tsx` y
`install-app-button.tsx`. Mismo patrón visual (`fixed inset-x-4 bottom-4`)
que `IdleTimer` para el aviso flotante — un solo lenguaje en todo el
proyecto, no dos.

### Corrección real, en plena verificación de S13-20 (Android real)
El Product Owner probó contra la preview de Vercel en su Android real (no
el desktop de S13-14) y el menú nativo de Chrome ofrecía "Instalar y
crear acceso directo" (criterios de instalabilidad cumplidos), pero ni el
banner propio ni `InstallAppButton` aparecían nunca. Causa raíz:
condición de carrera real de `beforeinstallprompt` — el listener se
agregaba dentro de un `useEffect`, que corre después de la hidratación de
React; en un celular real (hidratación más lenta que en desktop), Chrome
puede disparar el evento antes de que ese efecto llegue a ejecutarse, y
el evento no se vuelve a disparar una segunda vez — se pierde para
siempre. **Corregido** con un script inline `next/script`
`strategy="beforeInteractive"` en `src/app/layout.tsx` (confirmado como
el primer `<script>` de `<body>` en el HTML real, antes de cualquier
bundle de React) que captura el evento en `window.__bipEvento` sin
importar el timing — `InstallPromptAndroid` ya no agrega su propio
listener de `beforeinstallprompt`, consume ese valor global (chequeo
directo al montar + evento custom `bip-capturado` para capturas
posteriores). Detalle completo en `tasks.md` (S13-20).

<details>
<summary>Pseudocódigo original de planificación (superado, no usado tal cual)</summary>

## `components/domain/pwa/install-prompt-android.tsx` (nuevo, client component)
```tsx
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { INSTALL_PROMPT_COOLDOWN_DIAS } from "@/lib/constants";

const STORAGE_KEY = "pwa-install-prompt-cerrado-en";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Exportado para que install-app-button.tsx (footer del Sidebar, botón
// manual de respaldo) dispare el mismo evento capturado sin duplicar el
// listener — módulo compartido, no un Context nuevo (un solo consumidor
// más además de este componente no amerita esa infraestructura).
let eventoCapturado: BeforeInstallPromptEvent | null = null;
export function dispararInstalacion() {
  void eventoCapturado?.prompt();
}
export function hayInstalacionDisponible() {
  return eventoCapturado !== null;
}

function dentroDelCooldown(): boolean {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (!guardado) return false;
  const diasTranscurridos = (Date.now() - Number(guardado)) / 86_400_000;
  return diasTranscurridos < INSTALL_PROMPT_COOLDOWN_DIAS;
}

export function InstallPromptAndroid() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const handler = (evento: Event) => {
      evento.preventDefault(); // suprime el mini-infobar nativo de Chrome
      eventoCapturado = evento as BeforeInstallPromptEvent;
      if (!dentroDelCooldown()) setMostrar(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      eventoCapturado = null;
      setMostrar(false);
    });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!mostrar) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <p className="text-sm">Instalá Avícola M&A en tu celular para abrirla más rápido.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
            setMostrar(false);
          }}
        >
          Ahora no
        </Button>
        <Button size="sm" onClick={() => { void dispararInstalacion(); setMostrar(false); }}>
          Instalar
        </Button>
      </div>
    </div>
  );
}
```

## `components/domain/pwa/install-app-button.tsx` (nuevo — botón manual del footer del Sidebar)
```tsx
"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { dispararInstalacion, hayInstalacionDisponible } from "@/components/domain/pwa/install-prompt-android";

// useSyncExternalStore con un store trivial (sin suscripción real, solo
// re-chequea en cada render disparado por otro estado del árbol) — el
// evento beforeinstallprompt no tiene su propio mecanismo de suscripción
// más allá del listener global ya registrado en InstallPromptAndroid.
export function InstallAppButton() {
  const disponible = useSyncExternalStore(() => () => {}, hayInstalacionDisponible, () => false);
  if (!disponible) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => void dispararInstalacion()}>
      Instalar app
    </Button>
  );
}
```
</details>

## `components/domain/pwa/ios-install-banner.tsx` + `ios-install-button.tsx` — implementados en S13-12
**Desvío real respecto al pseudocódigo original de abajo (tachado,
registro histórico), anticipado antes de escribir código gracias a los
hallazgos de S13-9/S13-11 (no hizo falta que el linter lo volviera a
encontrar):** el pseudocódigo original llamaba `setMostrar(true)`
directo dentro de un `useEffect` — mismo patrón que ya disparó
`react-hooks/set-state-in-effect` en `connectivity-indicator.tsx` (S13-9).
Reescrito desde el principio con `useSyncExternalStore` (sin `useEffect`
en ningún momento), con dos necesidades distintas resueltas con dos
mecanismos distintos:
- **`puedeInstalarEnIos()`** (¿es iOS Safari sin instalar? — estable
  durante la sesión, no cambia con el tiempo): `useSyncExternalStore` con
  suscripción no-op — el no-op acá es correcto (a diferencia del que
  `plan.md` había marcado como "atajo a confirmar" para
  `InstallAppButton` en S13-11, donde el valor SÍ cambiaba con el tiempo);
  solo se usa para diferir la lectura de `navigator`/`localStorage` al
  cliente sin romper SSR.
- **`obtenerBannerVisible()`** (¿el banner está visible ahora mismo? —
  cambia: arranca en `true` la primera vez, pasa a `false` al cerrarlo,
  puede volver a `true` si `ios-install-button.tsx` lo reabre):
  store real (`Set<Escucha>`, mismo patrón que
  `install-prompt-android.tsx`/`install-app-button.tsx` de S13-11),
  compartido entre ambos componentes vía `suscribirseABannerIos`/
  `reabrirBannerIos`.

Código real completo en
`src/components/domain/pwa/ios-install-banner.tsx` y
`ios-install-button.tsx`.

<details>
<summary>Pseudocódigo original de planificación (superado, no usado tal cual — mismo patrón ya rechazado por el linter en S13-9)</summary>

```tsx
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "pwa-ios-banner-visto";

function esIosSafariSinInstalar(): boolean {
  const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as { standalone?: boolean }).standalone === true;
  return esIos && !esStandalone;
}

export function IosInstallBanner() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (esIosSafariSinInstalar() && !localStorage.getItem(STORAGE_KEY)) {
      setMostrar(true);
    }
  }, []);

  const cerrar = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setMostrar(false);
  };

  if (!mostrar) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <p className="mb-2 text-sm font-medium">Instalá Avícola M&A en tu iPhone</p>
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Tocá el ícono de Compartir (el cuadrado con la flecha hacia arriba)</li>
        <li>Elegí &quot;Añadir a inicio&quot;</li>
        <li>Confirmá el nombre y tocá &quot;Añadir&quot;</li>
      </ol>
      <Button size="sm" variant="outline" onClick={cerrar}>Entendido</Button>
    </div>
  );
}
```

### `components/domain/pwa/ios-install-button.tsx` (botón manual "Cómo instalar" del footer)
Mismo patrón que `InstallAppButton` pero sin depender de ningún evento del
navegador — solo reabre el banner (`localStorage.removeItem` +
`setMostrar(true)` vía un estado compartido simple, o simplemente vuelve a
montar `IosInstallBanner` forzado). Visible únicamente si
`esIosSafariSinInstalar()` es verdadero (mismo chequeo, se oculta solo en
Android o si ya está instalado en iOS).
</details>

## Registro del Service Worker: `<SerwistProvider>` — pieza faltante encontrada al llegar a esta tarea
**Hallazgo real, no contemplado en la planificación original:** ningún
componente diseñado hasta S13-7 (`PrecargarCatalogos`,
`InstallPromptAndroid`, `IosInstallBanner`, etc.) llama a
`navigator.serviceWorker.register(...)` — sin eso, el Service Worker de
`app/sw.ts` nunca se activa en el navegador, por más que exista y se sirva
correctamente desde `/serwist/sw.js`. `@serwist/turbopack` exporta
`SerwistProvider`/`useSerwist` desde su subpath `/react`
(`node_modules/@serwist/turbopack/src/index.react.tsx`, leído antes de
diseñar esto) — un Client Component que registra el SW automáticamente y
expone dos comportamientos configurables importantes:
- `cacheOnNavigation` (default `true`): intercepta `history.pushState`/
  `replaceState` para pedirle al SW que cachee la URL de cada navegación
  interna (mensaje `CACHE_URLS`) — refuerza exactamente el comportamiento
  ya esperado en `spec.md`/S13-19 ("una pantalla de gestión visitada a
  mano queda cacheada, no por precarga proactiva"). Se deja en su default.
- `reloadOnOnline` (default `true`): dispara `location.reload()` apenas el
  navegador vuelve a estar online. **Riesgo real de pérdida de datos para
  este sprint:** un Operario llenando el formulario de Mortalidad cuando
  la señal parpadea (vuelve por un instante) perdería todo lo tipeado sin
  guardar — exactamente el escenario que H3 (`spec.md`) protege
  explícitamente ("ningún dato se pierde en silencio"). **Se fija
  `reloadOnOnline={false}`** — decisión técnica, no de negocio (ninguna
  de las 6 preguntas originales cubría este comportamiento porque no se
  conocía hasta leer el código fuente de esta pieza), documentada acá en
  vez de preguntada de nuevo, mismo criterio que otros ajustes técnicos de
  esta sesión (elección de `defaultCache`, `handlerDidError` de la regla
  POST).

## `src/app/layout.tsx` (modifica — monta los componentes nuevos)
```tsx
import { SerwistProvider } from "@serwist/turbopack/react";
```
```tsx
{usuario ? (
  <TooltipProvider>
    <SidebarProvider defaultOpen={sidebarAbierto}>
      <AppSidebar rol={usuario.rol} nombre={usuario.nombre} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  </TooltipProvider>
) : (
  children
)}
{usuario ? (
  <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
    <IdleTimer />
    <PrecargarCatalogos />
    <InstallPromptAndroid />
    <IosInstallBanner />
  </SerwistProvider>
) : null}
```
El registro del SW (y por lo tanto el prompt de instalación/precarga)
queda gateado a "usuario ya logueado" — coherente con las decisiones 3/4
(`spec.md`, "después de loguearse") y con que las 3 pantallas de campo que
se precargan también requieren sesión; no tiene sentido registrar el SW
en `/login` para una herramienta interna sin usuarios anónimos reales.

Los 4 componentes flotantes (`IdleTimer`, el prompt de instalación, y el
banner de iOS) comparten el mismo `fixed inset-x-4 bottom-4` — **si dos
llegaran a estar visibles al mismo tiempo se superpondrían** (ej. el aviso
de sesión por expirar y el prompt de instalación, ambos poco frecuentes
pero no mutuamente excluyentes por diseño). Se acepta el riesgo tal cual
Sprint 3-12 aceptaron riesgos de baja probabilidad documentados
explícitamente (ver R2 de Sprint 12 como precedente) — si en la
verificación en vivo se solapan de forma molesta, es un ajuste de
`z-index`/posición (ej. apilarlos con `gap` en un contenedor común), no un
rediseño.

## `components/layout/sidebar.tsx` (modifica — footer)
```tsx
<SidebarFooter className="gap-3 border-t border-sidebar-border p-4">
  {!colapsado && (
    <div className="flex flex-col overflow-hidden gap-1">
      <span className="truncate text-sm font-medium text-sidebar-foreground">{nombre}</span>
      <span className="text-xs text-sidebar-foreground/70">{ROL_LABEL[rol]}</span>
      <ConnectivityIndicator />
    </div>
  )}
  {!colapsado && (
    <div className="flex flex-col gap-2">
      <InstallAppButton />
      <IosInstallButton />
    </div>
  )}
  <div className={colapsado ? "flex justify-center" : undefined}>
    <LogoutButton iconOnly={colapsado} />
  </div>
</SidebarFooter>
```
`ConnectivityIndicator`/`InstallAppButton`/`IosInstallButton` se ocultan
en modo colapsado (`!colapsado`) — mismo criterio que ya aplica al
bloque nombre/rol, un ícono de rail angosto no tiene espacio para texto.

**Agregado real, encontrado en la verificación en vivo de S13-13 (no
contemplado en la planificación original):** el `<Link href={item.href} />`
que ya usa `SidebarMenuButton` (dentro del `.map()` de `NAV_ITEMS`) gana
`prefetch={item.href === "/mortalidad" || item.href === "/bitacora" ||
item.href === "/recoleccion"}` — confirmado con
`navigator.serviceWorker`/Cache Storage reales que, sin esto, el prefetch
automático de `<Link>` de Next (activado por defecto, dispara para
cualquier link visible en viewport) cachea el RSC de **todas** las
pantallas del Sidebar apenas se renderiza, incluidas las de gestión —
contradice la decisión de negocio 1 ("ninguna pantalla de gestión se
precarga"). Limitar `prefetch` a las 3 pantallas de campo deja que Next
siga prefetcheando esas (mismo comportamiento rápido de navegación que
ya tenían) sin extender ese prefetch automático al resto.

## `lib/constants.ts` (modifica) — implementado en S13-8
```ts
/** Días que el prompt de instalación de Android espera antes de volver a
 * ofrecerse solo, después de que el usuario lo cierra sin instalar
 * (Sprint 13, decisión de negocio 3). Usada por install-prompt-android.tsx. */
export const INSTALL_PROMPT_COOLDOWN_DIAS = 30;
```
**Sin `RUNTIME_CACHE_MAX_AGE_SEGUNDOS`** — desvío real respecto al diseño
original: desde que S13-5 reemplazó la regla `NetworkFirst` propia por
`defaultCache` (que ya hardcodea 24h internamente en la librería), no
queda ningún código de este proyecto que consuma esa constante. El valor
de la decisión 6 (24h) sigue cumplido — lo aplica `defaultCache`, no una
constante local — pero agregar una constante sin ningún `import` real
sería documentación suelta, no una fuente de verdad compartida (mismo
principio que el resto del proyecto evita: no crear abstracciones sin un
consumidor real).

## `memory/decisiones-tecnicas.md` (modifica — agrega D7, no reescribe D1-D6)
Ver el texto completo de D7 en `spec.md` — se agrega tal cual, respetando
"Historial de revisión" (nunca se edita una decisión cerrada existente).

## `memory/stack-tecnologico.md` (modifica — sección "Offline / PWA")
```md
## Offline / PWA
- **Serwist** (`@serwist/turbopack`) — Service Workers, manifest,
  estrategias de caché. Elegido sobre `next-pwa` por incompatibilidad de
  ese último con Turbopack (D7, `decisiones-tecnicas.md`).
- **Dexie** (wrapper de IndexedDB) — cola local de operaciones pendientes.
  (Sprint 14, sin instalar todavía.)
- **Web Push (VAPID)** — notificaciones push para alertas de crédito
  vencido. (Sprint 16, sin instalar todavía.)
```

## Orden de ejecución (hay dependencias entre tareas)
1. `memory/decisiones-tecnicas.md` (D7) + `memory/stack-tecnologico.md` —
   documentar la decisión antes de instalar nada.
2. Instalar dependencias (`serwist`, `@serwist/turbopack`, `esbuild`,
   `sharp`), con versiones confirmadas contra Next 16.2.12.
3. `scripts/generar-iconos-pwa.ts` → correr → confirmar los 5 PNG
   generados en `public/icons/` + `public/apple-touch-icon.png`.
4. `app/manifest.ts` — depende de 3 (necesita los iconos ya generados).
5. `app/sw.ts` + `app/serwist/[path]/route.ts` + `next.config.ts`
   (`withSerwist`) — depende de 2.
6. `src/proxy.ts` (matcher corregido, H6) — depende de 4 y 5 (necesita
   saber las rutas reales a excluir).
7. Verificación H6: `curl` sin cookie contra `/manifest.webmanifest` y la
   ruta real del SW — antes de seguir, confirmar que ninguna redirige a
   `/login`.
8. `app/offline/page.tsx` — independiente, antes de referenciarla en
   `fallbacks` de `app/sw.ts` (ajustar 5 si hace falta).
9. `lib/constants.ts` (constantes nuevas) — independiente.
10. `components/domain/pwa/connectivity-indicator.tsx` — independiente.
11. `components/domain/pwa/precargar-catalogos.tsx` — independiente.
12. `components/domain/pwa/install-prompt-android.tsx` +
    `install-app-button.tsx` — depende de 9.
13. `components/domain/pwa/ios-install-banner.tsx` +
    `ios-install-button.tsx` — independiente.
14. `src/app/layout.tsx` (monta los 4 componentes + metadata
    `appleWebApp`) — depende de 10-13.
15. `src/components/layout/sidebar.tsx` (footer) — depende de 10, 12, 13.
16. Verificación de instalabilidad técnica — depende de 4-15. **Ajustado
    en S13-16, hallazgo real:** Lighthouse (v13.4.1, la que instala `npx`
    hoy) eliminó por completo la categoría "pwa" y todos sus audits
    (`installable-manifest`, `service-worker`, `maskable-icon`, etc. —
    ninguno existe ya, confirmado con `--list-all-audits`). Sustituido
    por evidencia más directa: confirmación real de que Chrome dispara
    `beforeinstallprompt` (paso 17/S13-14) — ese evento es la propia
    señal autoritativa del navegador de que sus criterios de
    instalabilidad ya se cumplieron, más confiable que un score
    sintético de una herramienta externa. `npx lighthouse` sigue
    corriéndose igual para las categorías que quedan (`accessibility`/
    `best-practices`/`seo`) como chequeo complementario, no como fuente
    de la verificación de instalabilidad.
17. Verificación en vivo de H3 (R1, `spec.md`): DevTools → Network →
    Offline, recarga dura y navegación interna del Sidebar, para las 3
    pantallas de campo — ajustar `runtimeCaching` de `app/sw.ts` si la
    navegación interna no queda cubierta.
18. Verificación en dispositivos reales (R3, `spec.md`): Android real
    (prompt + instalación + apertura standalone + tema) e iPhone real
    (banner + tutorial manual) — a cargo del Product Owner, mismo criterio
    que la verificación mobile de Sprints 1-3.
19. `npm run typecheck && npm run lint && npm run build` — en verde antes
    de cerrar (sin `npm test`/`vitest --coverage`, ver R4/DoD abajo — no
    hay lógica nueva de `services`/Zod que cubrir con Vitest).

## Comandos de referencia
```bash
npm install serwist
npm install -D @serwist/turbopack esbuild sharp
npx tsx scripts/generar-iconos-pwa.ts
npm run typecheck && npm run lint
npm run build && npm run start
curl -I http://localhost:3000/manifest.webmanifest
```

## Estructura de archivos esperada
```
public/
  icons/
    icon-192.png                 # nuevo
    icon-512.png                 # nuevo
    icon-192-maskable.png        # nuevo
    icon-512-maskable.png        # nuevo
  apple-touch-icon.png           # nuevo
scripts/
  generar-iconos-pwa.ts          # nuevo (temporal o permanente, a decidir)
src/
  app/
    manifest.ts                  # nuevo
    sw.ts                        # nuevo
    offline/
      page.tsx                   # nuevo
    serwist/
      [path]/route.ts            # nuevo
    layout.tsx                   # modifica: metadata appleWebApp, monta componentes nuevos
    page.tsx                     # modifica: Link "/creditos" gana prefetch={false} (hallazgo real de S13-14, no en el alcance original)
  components/domain/pwa/
    connectivity-indicator.tsx   # nuevo
    precargar-catalogos.tsx      # nuevo
    install-prompt-android.tsx   # nuevo
    install-app-button.tsx       # nuevo
    ios-install-banner.tsx       # nuevo
    ios-install-button.tsx       # nuevo
  components/layout/
    sidebar.tsx                  # modifica: footer
  lib/
    constants.ts                 # modifica: + INSTALL_PROMPT_COOLDOWN_DIAS
  proxy.ts                       # modifica: matcher
next.config.ts                   # modifica: withSerwist
memory/
  decisiones-tecnicas.md         # modifica: + D7
  stack-tecnologico.md           # modifica: sección Offline/PWA
```

## Definition of Done aplicable a este sprint (adaptado — ver R4, spec.md)
(`memory/definition-of-done.md` sigue sin existir — mismo criterio que
Sprints 3-12: `CLAUDE.md` + esta sección son el DoD efectivo del proyecto.
**Este sprint no tiene `services`/`repositories`/Zod nuevos, así que no
aplica el criterio de cobertura ≥90% de Vitest que sí aplicó en Sprints
3-12** — el DoD de infraestructura frontend se apoya en verificación
manual/herramientas de auditoría en su lugar.)
- `npm run typecheck && npm run lint` en verde.
- `npm run build` en verde (Turbopack, sin caer a Webpack en ningún paso).
- `npm test` en verde, sin regresión sobre los 553 tests heredados de
  Sprint 12 (ninguno nuevo esperado, pero confirmar que nada de lo tocado
  — `layout.tsx`, `sidebar.tsx`, `constants.ts` — rompe algo existente).
- `curl` sin cookie confirma `/manifest.webmanifest` y la ruta del SW en
  `200`, nunca `302`/`307` (H6).
- Instalabilidad técnica confirmada: manifest válido servido en `200`,
  SW activo con fetch handler y scope `"/"`, iconos 192/512 + maskable
  presentes, y **Chrome disparó `beforeinstallprompt` en una sesión
  real** — señal autoritativa del propio navegador, no un score de
  Lighthouse (la categoría "pwa" ya no existe en la versión actual de la
  herramienta, hallazgo real de S13-16).
- Offline verificado en vivo (DevTools → Network → Offline) para las 3
  pantallas de campo, con recarga dura **y** navegación interna del
  Sidebar (R1).
- Verificación en dispositivo Android real: prompt aparece, instala, abre
  en modo standalone con el tema correcto (a cargo del Product Owner, R3).
- Verificación en iPhone real: banner de tutorial aparece una vez, botón
  manual lo reabre, ambos desaparecen si la app ya está instalada (a cargo
  del Product Owner, R3).
- Ninguna pantalla de gestión quedó precargada (confirmado revisando
  `app/sw.ts`, no solo asumido).
- Ningún componente nuevo importa Prisma directamente (ADR-000 — no
  debería aplicar ningún caso este sprint, pero se confirma igual).
- Cero `any`, cero `@ts-ignore` (CLAUDE.md).
