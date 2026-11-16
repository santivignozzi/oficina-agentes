// Piezas comunes del arte. Todo se dibuja en SVG y se rasteriza una vez al arrancar:
// las texturas salen nítidas en cualquier pantalla y no dependen de assets de terceros.

export interface Art {
  key: string
  width: number
  height: number
  body: string
  defs?: string
  /** Multiplica la resolución. El cielo es puro degradé y no necesita más que la mitad. */
  resolution?: number
}

/** Gris oscuro de la identidad: el corte de la obra, los textos y lo más profundo. */
export const INK = '#25313B'

export function parseHex(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Mezcla dos colores. `amount` 0 es `a`, 1 es `b`. */
export function mix(a: string, b: string, amount: number) {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  const channel = (from: number, to: number) => Math.round(from + (to - from) * amount)
  const hex = (channel(ar, br) << 16) | (channel(ag, bg) << 8) | channel(ab, bb)
  return `#${hex.toString(16).padStart(6, '0')}`
}

export const shade = (color: string, amount = 0.18) => mix(color, '#1F2A33', amount)
export const light = (color: string, amount = 0.25) => mix(color, '#FFFFFF', amount)

/** Contorno del tono de cada pieza. Una línea negra pareja la haría ver infantil. */
export const edge = (fill: string, width = 1.3) =>
  `stroke="${shade(fill, 0.32)}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`

export function rect(x: number, y: number, w: number, h: number, r: number, fill: string, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`
}

export function panel(x: number, y: number, w: number, h: number, r: number, fill: string, width = 1.3) {
  return rect(x, y, w, h, r, fill, edge(fill, width))
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`
}

export function path(d: string, fill: string, extra = '') {
  return `<path d="${d}" fill="${fill}" ${extra}/>`
}

export const stroke = (d: string, color: string, width = 1.6, extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`

export const at = (x: number, y: number, body: string, extra = '') => `<g transform="translate(${x} ${y})" ${extra}>${body}</g>`

/** Sombra de contacto contra el piso. */
export const shadow = (cx: number, cy: number, rx: number, ry: number, alpha = 0.2) =>
  ellipse(cx, cy, rx, ry, '#1F2A33', `opacity="${alpha}" filter="url(#soft)"`)

export const SOFT_FILTER = '<filter id="soft" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>'

export function toSvg(art: Art, scale: number) {
  const width = Math.ceil(art.width * scale)
  const height = Math.ceil(art.height * scale)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${art.width} ${art.height}"><defs>${SOFT_FILTER}${art.defs ?? ''}</defs>${art.body}</svg>`
}

export async function rasterize(art: Art, scale: number): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(art, scale * (art.resolution ?? 1)))}`
  await image.decode()
  return image
}
