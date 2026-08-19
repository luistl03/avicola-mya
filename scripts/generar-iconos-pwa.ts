import sharp from "sharp";

const FUENTE = "public/avicolamya-isotipo.png";
const ICONS_DIR = "public/icons";

// FUENTE es un PNG de 500x500 SIN canal alfa (fondo blanco horneado,
// hasAlpha: false, confirmado con sharp().metadata() antes de escribir
// este script — mismo asset del que ya se quejaba el comentario de
// components/layout/sidebar.tsx, "fondo horneado"). Un recorte real
// (trim()) del margen blanco existente da un bounding box de ~470x441
// sobre el lienzo de 500x500 — el símbolo ocupa ~94% del ancho, muy por
// encima del 80% que exige la safe zone maskable (el círculo central que
// Android puede usar como máscara). Sin margen propio, íconos "any" y
// maskable necesitan tratamiento distinto:
//   - "any": el isotipo se reescala tal cual — mismo criterio que ya usa
//     el favicon/Sidebar del proyecto, sin composición.
//   - "maskable": el símbolo se recorta a su bounding box real y se
//     reescala DENTRO de un cuadro del 80% del lienzo final antes de
//     centrarlo sobre un fondo blanco — blanco, no --primary (naranja),
//     porque el propio isotipo ya trae ese blanco horneado hasta su
//     borde; un fondo de otro color dejaría un cuadrado blanco visible
//     en el medio en vez de fundirse sin costura.
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
  // redondeo/sombra). El isotipo ya no tiene alfa, no hace falta
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
