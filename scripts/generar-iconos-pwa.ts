import sharp from "sharp";

// DEPRECADO — no ejecutar. El Product Owner ahora arma y coloca a mano
// los 5 archivos de íconos (public/icons/icon-*.png y
// public/apple-touch-icon.png), partiendo de su propio diseño ya
// recortado a cada tamaño — ya no de una imagen fuente única que este
// script reescala/compone. FUENTE abajo ("avicolamya-imagotipo-2.png")
// ya ni siquiera existe en el repo (se borró junto con este cambio).
// Se deja el script sin borrar solo como referencia histórica de la
// lógica de zona segura maskable, no para volver a correrlo.
//
// Imagotipo (símbolo + "AVÍCOLA M&A"), no isotipo (solo símbolo) — a
// pedido del Product Owner probando la app instalada en Android real: el
// manifest usa el MISMO set de íconos para el ícono del launcher Y para
// la pantalla de splash que Chrome genera sola al abrir la app instalada
// (no hay forma estándar de tener una imagen distinta para cada cosa) —
// con el isotipo, el splash mostraba solo la gallina, sin el nombre de la
// granja. 500x500, igual que el isotipo.
const FUENTE = "public/avicolamya-imagotipo-2.png";
const ICONS_DIR = "public/icons";

// FUENTE es un PNG SIN canal alfa (fondo blanco horneado, hasAlpha:
// false, confirmado con sharp().metadata() antes de escribir este
// script). Íconos "any" y maskable necesitan tratamiento distinto:
//   - "any": el imagotipo se reescala tal cual — mismo criterio que ya
//     usa el favicon/Sidebar del proyecto, sin composición.
//   - "maskable": el símbolo (gallina + texto) se recorta a su bounding
//     box real (trim()) y se reescala DENTRO de un cuadro del 80% del
//     lienzo final antes de centrarlo sobre un fondo blanco — blanco, no
//     --primary (naranja), porque el propio imagotipo ya trae ese blanco
//     horneado hasta su borde; un fondo de otro color dejaría un
//     cuadrado blanco visible en el medio en vez de fundirse sin costura.
const SAFE_ZONE_RATIO = 0.8;
const BLANCO = "#ffffff"; // mismo --background (light) confirmado en S13-1

async function generarAny(size: number) {
  await sharp(FUENTE).resize(size, size).png().toFile(`${ICONS_DIR}/icon-${size}.png`);
}

async function generarMaskable(size: number) {
  const simboloRecortado = await sharp(FUENTE).trim().toBuffer();
  const contenido = Math.round(size * SAFE_ZONE_RATIO);
  const simboloEscalado = await sharp(simboloRecortado)
    .resize(contenido, contenido, { fit: "contain", background: BLANCO })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 3, background: BLANCO },
  })
    .composite([{ input: simboloEscalado, gravity: "center" }])
    .png()
    .toFile(`${ICONS_DIR}/icon-${size}-maskable.png`);
}

async function generarAppleTouchIcon() {
  // iOS no lee el manifest para el ícono de home screen — necesita este
  // archivo puntual (180x180, sin transparencia, iOS aplica su propio
  // redondeo/sombra). El imagotipo ya no tiene alfa, no hace falta
  // aplanarlo aparte.
  await sharp(FUENTE).resize(180, 180).png().toFile("public/apple-touch-icon.png");
}

async function generar() {
  await generarAny(192);
  await generarAny(512);
  await generarMaskable(192);
  await generarMaskable(512);
  await generarAppleTouchIcon();
  console.log("Iconos generados en public/icons/ y public/apple-touch-icon.png");
}

generar();
