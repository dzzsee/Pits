/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 * Rasteriza el mismo mark que el favicon SVG: cuadro redondeado oscuro
 * con el "P" de Pits en blanco.
 *
 * Uso: node scripts/generate-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = path.join(import.meta.dirname, '..', 'public', 'icons')

const BG = [17, 17, 20]
const FG = [255, 255, 255]

/** Distancia con signo a un rectangulo redondeado (negativa = dentro). */
function roundedRectSdf(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r)
  const qy = Math.abs(y - h / 2) - (h / 2 - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/** Distancia a un segmento, para dibujar trazos con grosor. */
function segmentSdf(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(wx - vx * t, wy - vy * t)
}

/** Cobertura antialiased: 1 dentro del trazo, 0 fuera, suave en el borde. */
function coverage(sdf, halfWidth, aa) {
  return Math.max(0, Math.min(1, halfWidth - sdf + aa / 2))
}

function renderIcon(size) {
  const s = size
  const scale = s / 32
  const radius = 8 * scale
  const stroke = 3 * scale
  const aa = 1.2

  // El "P": asta vertical + arco superior + pie corto de la barra.
  const stemX = 11 * scale
  const stemTop = 8 * scale
  const stemBottom = 24 * scale
  const bowlCx = 18.5 * scale
  const bowlCy = 13.5 * scale
  const bowlR = 4.6 * scale

  const raw = Buffer.alloc(s * (s * 3 + 1))

  for (let y = 0; y < s; y++) {
    const rowStart = y * (s * 3 + 1)
    raw[rowStart] = 0 // filtro PNG: None

    for (let x = 0; x < s; x++) {
      const px = x + 0.5
      const py = y + 0.5

      const inRounded = coverage(roundedRectSdf(px, py, s, s, radius), 0, aa)
      if (inRounded <= 0) {
        raw[rowStart + 1 + x * 3] = 0
        raw[rowStart + 2 + x * 3] = 0
        raw[rowStart + 3 + x * 3] = 0
        continue
      }

      let ink = coverage(segmentSdf(px, py, stemX, stemTop, stemX, stemBottom), stroke / 2, aa)
      ink = Math.max(
        ink,
        coverage(Math.abs(Math.hypot(px - bowlCx, py - bowlCy) - bowlR), stroke / 2, aa),
      )
      // Cierra el arco con dos segmentos rectos hacia el asta.
      ink = Math.max(
        ink,
        coverage(
          segmentSdf(
            px,
            py,
            stemX,
            stemTop + 1.2 * scale,
            bowlCx - bowlR * 0.7,
            bowlCy - bowlR * 0.7,
          ),
          stroke / 2,
          aa,
        ),
        coverage(
          segmentSdf(px, py, stemX, 19 * scale, bowlCx - bowlR * 0.7, bowlCy + bowlR * 0.7),
          stroke / 2,
          aa,
        ),
      )

      const alpha = Math.min(1, ink)
      const mix = (c, i) => Math.round(BG[c] * (1 - alpha) + FG[c] * alpha)

      raw[rowStart + 1 + x * 3] = mix(0)
      raw[rowStart + 2 + x * 3] = mix(1)
      raw[rowStart + 3 + x * 3] = mix(2)
    }
  }

  return raw
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.mkdirSync(OUT, { recursive: true })

for (const size of [192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`)
  fs.writeFileSync(file, encodePng(size, renderIcon(size)))
  console.log(`icon-${size}.png`)
}

// Badge monocromo pequeno para las notificaciones del sistema.
const badgeSize = 96
const badgeRaw = Buffer.alloc(badgeSize * (badgeSize * 3 + 1))
for (let y = 0; y < badgeSize; y++) {
  const rowStart = y * (badgeSize * 3 + 1)
  badgeRaw[rowStart] = 0
  for (let x = 0; x < badgeSize; x++) {
    const px = x + 0.5
    const py = y + 0.5
    const ink = Math.min(
      coverage(segmentSdf(px, py, 30, 22, 30, 74), 7, 1.2),
      coverage(segmentSdf(px, py, 30, 48, 60, 48), 7, 1.2),
    )
    for (let c = 0; c < 3; c++) badgeRaw[rowStart + 1 + x * 3 + c] = Math.round(255 * ink)
  }
}
fs.writeFileSync(path.join(OUT, 'badge.png'), encodePng(badgeSize, badgeRaw))
console.log('badge.png')

// El icono maskable lleva margen de seguridad (zona segura del 80%).
const maskableRaw = renderIcon(512)
fs.writeFileSync(path.join(OUT, 'icon-maskable.png'), encodePng(512, maskableRaw))
console.log('icon-maskable.png')
