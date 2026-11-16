import { at, edge, ellipse, INK, light, panel, path, rect, shade, shadow, stroke, type Art } from './svg'

// Muebles del edificio. Cada función devuelve un dibujo con el origen en el centro de
// su base: `FURNITURE` los ordena por nombre y `layout.ts` decide dónde va cada uno.
// Lo de fondo queda horneado en una sola textura; sólo es sprite lo que se mueve o lo
// que tiene que tapar a un personaje.

const WOOD = '#D5B89B'
const WOOD_DARK = '#A9846A'
const CHARCOAL = '#39444F'
const WHITE = '#FBF9F4'
const TEAL = '#5FB7A0'
const PLUM = '#8E7CC3'
const CORAL = '#F2A59A'
const AMBER = '#F4D68B'
/** El rosa de la sala creativa. */
const PINK = '#EE8CB8'
const BLUSH = '#F7C6DA'

// ---- Pequeñas piezas ----

function mug(x: number, y: number, color: string) {
  return [
    stroke(`M${x + 9} ${y + 3}c4 0 4 6 0 6`, shade(color, 0.3), 1.4),
    panel(x, y, 10, 11, 2.4, color, 1),
  ].join('')
}

function books(x: number, y: number, colors: string[]) {
  let cursor = x
  return colors
    .map((color, i) => {
      const w = 7 + ((i * 5) % 5)
      const h = 24 + ((i * 7) % 9)
      const body = panel(cursor, y - h, w, h, 1, color, 0.9) + rect(cursor + 1.6, y - h + 4, w - 3.2, 2, 0.6, light(color, 0.5), 'opacity="0.8"')
      cursor += w + 0.6
      return body
    })
    .join('')
}

function pile(x: number, y: number) {
  return [panel(x, y - 7, 34, 7, 1.2, '#E08A76', 1), panel(x + 3, y - 13, 28, 6, 1.2, TEAL, 1), panel(x + 1, y - 19, 30, 6, 1.2, AMBER, 1)].join('')
}

function papers(x: number, y: number) {
  return `<g transform="rotate(-5 ${x} ${y})">${panel(x, y - 3, 30, 3, 0.8, WHITE, 0.9)}</g>${panel(x + 2, y - 5, 30, 3, 0.8, '#EEF0F2', 0.9)}`
}

function keyboard(x: number, y: number, dark = false) {
  const body = dark ? '#3A4752' : '#E7EAEE'
  return panel(x, y - 3.5, 44, 4, 1.6, body, 0.9) + stroke(`M${x + 4} ${y - 2}h36`, dark ? '#7FE6C8' : '#AEB7C0', 1, 'stroke-dasharray="2.5 1.6"')
}

function duck(x: number, y: number) {
  return [
    ellipse(x + 7, y - 6, 7.5, 5.5, '#F7CE5B', edge('#F7CE5B', 1)),
    ellipse(x + 10, y - 13, 4.6, 4.6, '#F7CE5B', edge('#F7CE5B', 1)),
    path(`M${x + 14} ${y - 14}l4 1.4l-4 1.4z`, '#EE9A4D'),
    ellipse(x + 11, y - 14, 0.9, 0.9, INK),
  ].join('')
}

function robot(x: number, y: number) {
  return [
    panel(x - 7, y - 13, 14, 13, 3, '#DDE3EA', 1),
    panel(x - 9, y - 26, 18, 13, 4, '#EDF0F4', 1),
    ellipse(x - 4, y - 19.5, 1.7, 1.7, '#38C7A1'),
    ellipse(x + 4, y - 19.5, 1.7, 1.7, '#38C7A1'),
    stroke(`M${x} ${y - 26}v-5`, '#AEB7C0', 1.2),
    ellipse(x, y - 32, 1.8, 1.8, '#F2A59A'),
  ].join('')
}

/** Corazón con la punta abajo, centrado en `x, y`. */
function heartPath(x: number, y: number, s: number) {
  return `M${x} ${y + s * 0.9}C${x - s * 1.5} ${y - s * 0.1} ${x - s * 0.7} ${y - s * 1.2} ${x} ${y - s * 0.4}C${x + s * 0.7} ${y - s * 1.2} ${x + s * 1.5} ${y - s * 0.1} ${x} ${y + s * 0.9}Z`
}

function ringLight(x: number, y: number) {
  return [
    panel(x - 8, y - 3, 16, 3, 1.2, '#55626E', 0.8),
    rect(x - 1.2, y - 30, 2.4, 28, 1, '#7A8794'),
    `<circle cx="${x}" cy="${y - 42}" r="12" fill="none" stroke="${shade(WHITE, 0.3)}" stroke-width="6"/>`,
    `<circle cx="${x}" cy="${y - 42}" r="12" fill="none" stroke="#FFF6EC" stroke-width="4"/>`,
  ].join('')
}

function headphones(x: number, y: number) {
  return [
    panel(x - 1.5, y - 26, 3, 26, 1, '#7A8794', 0.8),
    panel(x - 9, y - 2, 18, 3, 1.4, '#55626E', 0.8),
    stroke(`M${x - 12} ${y - 18}C${x - 12} ${y - 36} ${x + 12} ${y - 36} ${x + 12} ${y - 18}`, CHARCOAL, 3),
    panel(x - 15, y - 22, 7, 13, 3, '#5C6AC4', 1),
    panel(x + 8, y - 22, 7, 13, 3, '#5C6AC4', 1),
  ].join('')
}

// ---- Escritorios ----

/** Transformación que comparten el marco y la pantalla: si difieren, no encajan. */
export const SCREEN = {
  w: 72,
  h: 50,
  transform: 'matrix(0.97 -0.07 0 1 1 7)',
}

function monitor(x: number, y: number, desk: number) {
  const { w, h, transform } = SCREEN
  return [
    panel(x + w / 2 - 15, desk - 4, 30, 4, 1.8, '#55626E', 1),
    rect(x + w / 2 - 3.5, y + h, 7, desk - y - h, 1.5, '#6C7985'),
    at(x, y, `<g transform="${transform}">${panel(-4, -4, w + 8, h + 8, 4, '#26313B', 1)}</g>`),
  ].join('')
}

const DESK_HEIGHT = 58

function desk(w: number, top: string, body: string, items: string) {
  const h = DESK_HEIGHT
  const l = -w / 2
  const r = w / 2
  return [
    shadow(0, 3, r + 4, 5, 0.2),
    rect(l + 8, -h + 5, 5, h - 3, 1.5, shade(body, 0.26)),
    panel(r - 56, -h + 5, 48, h - 3, 3, body),
    rect(r - 50, -h + 18, 36, 1.3, 0.6, shade(body, 0.26)),
    rect(r - 50, -h + 35, 36, 1.3, 0.6, shade(body, 0.26)),
    rect(r - 37, -h + 12, 10, 2.2, 1.1, shade(body, 0.34)),
    rect(r - 37, -h + 28, 10, 2.2, 1.1, shade(body, 0.34)),
    path(`M${l} ${-h}L${l + 9} ${-h - 9}H${r - 9}L${r} ${-h}Z`, light(top, 0.16), edge(top, 1)),
    panel(l, -h, w, 6, 2, top),
    items,
  ].join('')
}

/** `screens`: margen izquierdo de cada monitor, en las coordenadas del escritorio. */
const deskScreens = (xs: number[]) => xs.map(x => monitor(x, -141, -DESK_HEIGHT - 5)).join('')

function deskLead() {
  return desk(
    204,
    '#B98E70',
    '#96705A',
    [
      deskScreens([-30]),
      keyboard(-90, -DESK_HEIGHT - 3),
      mug(-34, -DESK_HEIGHT - 15, WHITE),
      papers(56, -DESK_HEIGHT - 2),
      // Lámpara de escritorio: lo que distingue a la Dirección de un puesto común.
      panel(-16, -DESK_HEIGHT - 6, 18, 3, 1.4, '#4F5B67', 0.9),
    ].join(''),
  )
}

function deskResearch() {
  return desk(
    134,
    WOOD,
    '#BE9F83',
    [
      deskScreens([-20]),
      keyboard(-58, -DESK_HEIGHT - 3),
      pile(30, -DESK_HEIGHT - 2),
    ].join(''),
  )
}

function deskDev() {
  return desk(
    184,
    '#C6CEDA',
    '#A7B2C1',
    [
      deskScreens([-59, 13]),
      keyboard(-88, -DESK_HEIGHT - 3, true),
      duck(-42, -DESK_HEIGHT - 3),
      mug(-74, -DESK_HEIGHT - 14, '#5C6AC4'),
    ].join(''),
  )
}

function deskMarketing() {
  return desk(
    150,
    '#F6EEF2',
    '#E2B3C7',
    [
      ringLight(-58, -DESK_HEIGHT - 2),
      deskScreens([-20]),
      keyboard(-56, -DESK_HEIGHT - 3),
      mug(58, -DESK_HEIGHT - 14, PINK),
    ].join(''),
  )
}

function officeChair(color: string, tall = false) {
  const top = tall ? -92 : -78
  return [
    shadow(0, 3, 26, 4, 0.16),
    stroke('M-22 -3L0 -12L22 -3', CHARCOAL, 3.2),
    ellipse(-22, -2.5, 3, 3, CHARCOAL),
    ellipse(22, -2.5, 3, 3, CHARCOAL),
    ellipse(0, -2.5, 3, 3, CHARCOAL),
    rect(-2, -24, 4, 14, 1.6, '#55626E'),
    panel(-25, -31, 48, 9, 4.4, color),
    path(`M-31 ${top + 2}C-34 ${top + 18} -33 -46 -27 -29L-19 -29C-24 -46 -24 ${top + 22} -21 ${top + 2}C-23 ${top - 3} -29 ${top - 3} -31 ${top + 2}Z`, color, edge(color)),
    stroke(`M-28 ${top + 8}C-29 ${top + 20} -29 -52 -26 -40`, light(color, 0.3), 1.6, 'opacity="0.8"'),
  ].join('')
}

// ---- Asientos ----

function armchair(color: string) {
  return [
    shadow(0, 3, 44, 5, 0.2),
    rect(-34, -10, 6, 12, 2, WOOD_DARK),
    rect(28, -10, 6, 12, 2, WOOD_DARK),
    panel(-37, -92, 74, 66, 20, shade(color, 0.1)),
    stroke('M-24 -80C-14 -86 14 -86 24 -80', light(color, 0.25), 2, 'opacity="0.7"'),
    panel(-33, -46, 66, 18, 8, light(color, 0.12)),
    panel(-35, -32, 70, 24, 7, shade(color, 0.05)),
    panel(-45, -60, 20, 52, 9, color),
    panel(25, -60, 20, 52, 9, color),
  ].join('')
}

function beanbag() {
  const color = '#7E93DD'
  return [
    shadow(0, 3, 46, 5, 0.2),
    path('M-44 -2C-52 -34 -30 -64 -2 -66C28 -68 52 -36 44 -2C20 4 -20 4 -44 -2Z', color, edge(color)),
    path('M-30 -40C-20 -54 -6 -60 8 -58', 'none', `stroke="${light(color, 0.35)}" stroke-width="3" stroke-linecap="round" opacity="0.7"`),
    path('M-44 -2C-20 -20 20 -20 44 -2C20 4 -20 4 -44 -2Z', shade(color, 0.12)),
  ].join('')
}

function bench() {
  return [
    shadow(0, 3, 80, 4, 0.18),
    rect(-66, -18, 6, 20, 2, CHARCOAL),
    rect(60, -18, 6, 20, 2, CHARCOAL),
    panel(-78, -30, 156, 13, 6, CORAL),
    rect(-72, -28, 144, 3, 1.5, light(CORAL, 0.4), 'opacity="0.8"'),
  ].join('')
}

function meetingChairs() {
  return [-90, -30, 30, 90]
    .map(x =>
      at(
        x,
        0,
        [
          panel(-21, -82, 42, 56, 14, '#4E5B68'),
          rect(-15, -76, 30, 7, 3.5, '#6C7985', 'opacity="0.8"'),
        ].join(''),
      ),
    )
    .join('')
}

// ---- Guardado ----

function bookcase() {
  const w = 136
  const h = 146
  const frame = '#B8947A'
  const palette = ['#E08A76', AMBER, TEAL, '#7E93DD', '#F1EDE3', PLUM, CORAL, '#6CA8A0']
  const row = (y: number, seed: number, count: number) =>
    books(-w / 2 + 11, y, Array.from({ length: count }, (_, i) => palette[(i * 3 + seed) % palette.length]))
  return [
    shadow(0, 3, w / 2, 5, 0.2),
    panel(-w / 2, -h, w, h, 4, frame),
    rect(-w / 2 + 7, -h + 7, w - 14, h - 14, 2, shade(frame, 0.36)),
    rect(-w / 2 + 7, -h + 48, w - 14, 5, 1, frame),
    rect(-w / 2 + 7, -h + 96, w - 14, 5, 1, frame),
    row(-h + 48, 0, 9),
    row(-h + 96, 3, 6),
    ellipse(38, -h + 80, 11, 14, AMBER, edge(AMBER)),
    row(-7, 5, 10),
  ].join('')
}

function cabinet() {
  const w = 104
  const h = 50
  return [
    shadow(0, 3, w / 2, 4, 0.18),
    panel(-w / 2, -h, w, h, 3, '#EEF0F2'),
    rect(-w / 2 + 5, -h / 2 - 1, w - 10, 1.2, 0.6, '#B7C0C9'),
    rect(-12, -h + 11, 24, 2.4, 1.2, '#94A0AB'),
    rect(-12, -h / 2 + 10, 24, 2.4, 1.2, '#94A0AB'),
    ...['#E08A76', TEAL, AMBER].map((color, i) => panel(-46 + i * 12, -h - 24, 10, 24, 1.2, color, 0.9)),
    papers(4, -h),
    mug(30, -h - 11, CORAL),
  ].join('')
}

function credenza() {
  const w = 204
  const h = 54
  return [
    shadow(0, 3, w / 2, 4, 0.18),
    rect(-w / 2 + 12, -8, 5, 10, 1.5, WOOD_DARK),
    rect(w / 2 - 17, -8, 5, 10, 1.5, WOOD_DARK),
    panel(-w / 2, -h, w, h - 6, 4, '#B48C72'),
    ...[-68, 0, 68].map(x => panel(x - 31, -h + 5, 62, h - 16, 2, '#C19C83', 0.9)),
    ...[-68, 0, 68].map(x => rect(x - 7, -h + 23, 14, 2, 1, '#8B6A55')),
    // Trofeo: premio al equipo más constante.
    path('M-68 -74h18c0 11 -4 15 -9 15s-9 -4 -9 -15Z', '#F0C65C', edge('#F0C65C')),
    rect(-61, -60, 4, 6, 1, '#D2A23C'),
    panel(-66, -55, 14, 2.6, 1, CHARCOAL, 0.7),
    pile(-20, -h),
    ellipse(50, -h - 15, 11, 15, CORAL, edge(CORAL)),
    panel(44, -h - 4, 12, 4, 1, shade(CORAL, 0.3), 0.8),
  ].join('')
}

function techShelf() {
  const w = 148
  const h = 52
  return [
    shadow(0, 3, w / 2, 4, 0.18),
    rect(-w / 2 + 8, -6, 4, 8, 1, CHARCOAL),
    rect(w / 2 - 12, -6, 4, 8, 1, CHARCOAL),
    panel(-w / 2, -h, w, h - 4, 3, '#DCE1EA'),
    rect(-w / 2 + 6, -h + 22, w - 12, 1.3, 0.6, '#AEB7C0'),
    panel(-w / 2 + 12, -h + 6, 44, 12, 2, '#3A4752', 0.9),
    ...[0, 1, 2, 3].map(i => ellipse(-w / 2 + 19 + i * 8, -h + 12, 1.3, 1.3, '#38C7A1')),
    panel(14, -h + 28, 54, 14, 2, '#B7C0C9', 0.9),
    robot(30, -h),
    headphones(-16, -h),
  ].join('')
}

function rack() {
  const w = 72
  const h = 146
  return [
    shadow(0, 3, w / 2, 5, 0.22),
    panel(-w / 2, -h, w, h, 4, '#2E3944'),
    ...Array.from({ length: 6 }, (_, i) =>
      [panel(-w / 2 + 7, -h + 9 + i * 22, w - 14, 17, 2, '#3F4D5A', 0.9), rect(-w / 2 + 12, -h + 14 + i * 22, 22, 1.8, 0.9, '#62707D'), rect(-w / 2 + 12, -h + 19 + i * 22, 22, 1.8, 0.9, '#62707D')].join(''),
    ),
  ].join('')
}

function sideTable() {
  return [
    shadow(0, 3, 22, 3, 0.16),
    rect(-2, -44, 4, 44, 1.5, WOOD_DARK),
    panel(-13, -3, 26, 3, 1.4, WOOD_DARK, 0.9),
    panel(-24, -48, 48, 6, 3, WOOD),
    mug(-10, -59, WHITE),
  ].join('')
}

function floorLamp() {
  return [
    shadow(0, 3, 16, 3, 0.16),
    panel(-13, -4, 26, 4, 2, CHARCOAL, 0.9),
    rect(-1.5, -146, 3, 144, 1.5, '#55626E'),
    path('M-22 -116L-12 -158H12L22 -116Z', '#F8E7BD', edge('#F4D68B')),
    path('M-22 -116L-12 -158H-4L-10 -116Z', '#FDF4DD', 'opacity="0.9"'),
  ].join('')
}

// ---- Pared ----

/** Corcho con fotos, muestras de color y notas: la pared de quien piensa cómo venderlo. */
function moodBoard() {
  const w = 176
  const h = 100
  const photo = (x: number, y: number, color: string, tilt: number) =>
    `<g transform="rotate(${tilt} ${x + 13} ${y + 15})">${panel(x, y, 26, 30, 1, WHITE, 0.9)}${rect(x + 3, y + 3, 20, 18, 1, color)}</g>${ellipse(x + 13, y + 2, 2.2, 2.2, '#D9468F')}`
  return [
    panel(-w / 2, -h, w, h, 4, WOOD_DARK),
    rect(-w / 2 + 6, -h + 6, w - 12, h - 12, 2, '#E6C9A3'),
    photo(-76, -88, '#BFE8D5', -5),
    photo(-44, -84, BLUSH, 4),
    photo(-70, -48, '#C8D9F7', 3),
    ...[PINK, AMBER, TEAL, PLUM].map((color, i) => panel(-30 + i * 15, -40, 12, 12, 1.5, color, 0.8)),
    `<g transform="rotate(-3 32 -64)">${rect(10, -86, 44, 40, 1.5, '#FFF3B8', edge('#FFF3B8', 0.9))}${path(heartPath(32, -68, 8), PINK)}${stroke('M18 -54h28', '#C7AE7E', 1.3)}</g>`,
    ellipse(32, -84, 2.2, 2.2, TEAL),
    stroke('M62 -84h14M62 -76h10M62 -68h14', '#9E7E5F', 1.6),
    rect(58, -38, 22, 24, 1.5, WHITE, edge(WHITE, 0.9)),
    stroke('M62 -30h14M62 -24h9', '#AEB7C0', 1.2),
  ].join('')
}

/** Embudo y objetivo: de cuántos se enteran a cuántos compran. */
function funnelBoard() {
  const w = 152
  const h = 96
  const layers: [number, number, number, number][] = [
    [-60, 12, -84, -68],
    [-52, 4, -66, -50],
    [-44, -4, -48, -32],
    [-36, -12, -30, -16],
  ]
  const tints = ['#F9D3E3', '#F3A9C9', PINK, '#D9468F']
  return [
    whiteboardFrame(w, h),
    ...layers.map(([l, r, top, bottom], i) => {
      const inset = 4
      return path(`M${l} ${top}H${r}L${r - inset} ${bottom}H${l + inset}Z`, tints[i], edge(tints[i], 0.9))
    }),
    ...[0, 1, 2, 3].map(i => stroke(`M20 ${-78 + i * 18}h${16 - i * 3}`, '#AEB7C0', 1.3)),
    ellipse(52, -58, 16, 16, WHITE, edge('#D9468F', 1.6)),
    ellipse(52, -58, 10.5, 10.5, BLUSH),
    ellipse(52, -58, 5, 5, '#D9468F'),
    stroke('M38 -36L50 -56', CHARCOAL, 1.6),
    path('M50 -56l-6 1.6l2.4 4z', CHARCOAL),
  ].join('')
}

/** Neón con un corazón: lo único que brilla en Marketing aunque sea de día. */
function neonSign() {
  const d = heartPath(0, -34, 20)
  return [
    rect(-34, -66, 68, 62, 8, '#2E2A36', 'opacity="0.9"'),
    stroke(d, '#FF8CC6', 7, 'opacity="0.35"'),
    stroke(d, '#FFB3DA', 3),
    stroke(d, '#FFF0F7', 1.2),
  ].join('')
}

function frames() {
  return [
    panel(-74, -66, 52, 66, 2, WHITE),
    rect(-68, -60, 40, 54, 1, '#DCE6FF'),
    ellipse(-48, -42, 13, 13, CORAL, 'opacity="0.85"'),
    path('M-68 -6L-52 -26L-40 -14L-34 -20L-28 -6Z', TEAL, 'opacity="0.85"'),
    panel(-10, -52, 44, 52, 2, WHITE),
    rect(-5, -47, 34, 42, 1, '#F7EBD3'),
    path('M-5 -5C5 -30 18 -30 29 -5Z', AMBER),
    panel(44, -60, 40, 40, 2, WHITE),
    rect(49, -55, 30, 30, 1, '#E7DFF6'),
    ellipse(64, -40, 9, 9, PLUM, 'opacity="0.8"'),
  ].join('')
}

function whiteboardFrame(w: number, h: number) {
  return [
    panel(-w / 2, -h, w, h, 4, '#FDFDFB'),
    rect(-w / 2, -h, w, 5, 2.5, '#E6EAEE'),
    panel(-w / 2 + 34, -4, w - 68, 5, 2, '#AEB7C0', 1),
    rect(-w / 2 + 44, -7, 16, 3.4, 1.4, '#E08A76'),
    rect(-w / 2 + 64, -7, 16, 3.4, 1.4, '#5C6AC4'),
  ].join('')
}

function planningBoard() {
  const w = 268
  const h = 104
  const note = (x: number, y: number, color: string, tilt: number) =>
    `<g transform="rotate(${tilt} ${x + 15} ${y + 13})">${rect(x, y, 30, 26, 1.5, color, edge(color, 0.9))}${stroke(`M${x + 6} ${y + 9}h18M${x + 6} ${y + 15}h12`, shade(color, 0.4), 1.2)}</g>`
  return [
    whiteboardFrame(w, h),
    stroke(`M${-w / 2 + 14} -46H${w / 2 - 110}`, '#E4DCF3', 1.6),
    stroke(`M${w / 2 - 96} ${-h + 12}V-12`, '#E4DCF3', 1.6, 'stroke-dasharray="4 4"'),
    note(w / 2 - 86, -h + 14, AMBER, -3),
    note(w / 2 - 48, -h + 16, '#BFE8D5', 2),
    note(w / 2 - 86, -h + 50, '#C8B8F0', 3),
    note(w / 2 - 48, -h + 52, CORAL, -2),
  ].join('')
}

function chartBoard() {
  const w = 152
  const h = 96
  return [
    whiteboardFrame(w, h),
    // Curva de hallazgos y barras comparadas: es la pared de quien investiga.
    stroke(`M${-w / 2 + 12} -16L-50 -34L-34 -28L-18 -54L-2 -46`, '#3E9E86', 2.2),
    ...[-48, -33, -18, -3].map((x, i) => ellipse(x - 2, [-34, -28, -54, -46][i], 2.2, 2.2, '#3E9E86')),
    stroke(`M${-w / 2 + 12} -66V-14H-2`, '#AEB7C0', 1.2),
    panel(12, -h + 11, 26, 34, 1.5, WHITE, 0.9),
    stroke(`M17 ${-h + 19}h16M17 ${-h + 25}h16M17 ${-h + 31}h10`, '#AEB7C0', 1.3),
    panel(42, -h + 16, 24, 30, 1.5, '#F7EBD3', 0.9),
    stroke(`M46 ${-h + 24}h14M46 ${-h + 30}h10`, '#C7AE7E', 1.3),
    ellipse(25, -h + 11, 2.2, 2.2, '#E08A76'),
    ellipse(54, -h + 16, 2.2, 2.2, '#5C6AC4'),
    ...[0, 1, 2].map(i => rect(12 + i * 18, -38 + (2 - i) * 6 + i, 12, 26 - (2 - i) * 6 - i, 1.5, ['#BFE8D5', '#7CCDB6', TEAL][i])),
  ].join('')
}

function codeBoard() {
  const w = 146
  const h = 96
  const colors = ['#7FE6C8', '#F2A59A', '#C8B8F0', '#F4D68B']
  return [
    panel(-w / 2, -h, w, h, 4, '#2D3A46'),
    rect(-w / 2 + 3, -h + 3, w - 6, h - 6, 2.5, '#253240'),
    ...Array.from({ length: 7 }, (_, i) => {
      const indent = ((i * 2) % 3) * 8
      const a = 18 + ((i * 17) % 26)
      const b = 12 + ((i * 29) % 24)
      const y = -h + 12 + i * 11
      return rect(-w / 2 + 10 + indent, y, a, 3.4, 1.7, colors[i % 4]) + rect(-w / 2 + 14 + indent + a, y, b, 3.4, 1.7, colors[(i + 2) % 4], 'opacity="0.75"')
    }),
    panel(26, -h + 12, 38, 16, 3, '#3C4C5A', 0.9),
    panel(26, -h + 44, 38, 16, 3, '#3C4C5A', 0.9),
    stroke(`M45 ${-h + 28}v16`, '#7FE6C8', 1.5),
    path(`M45 ${-h + 44}l-3.4 -5h6.8z`, '#7FE6C8'),
  ].join('')
}

function screenFrame(w: number, h: number) {
  return [panel(-w / 2, -h, w, h, 6, '#26313B'), rect(-w / 2 + 6, -h + 6, w - 12, h - 12, 3, '#141C24'), ellipse(0, -3, 1.3, 1.3, '#7FE6C8')].join('')
}

function tv() {
  const w = 138
  const h = 78
  return [
    panel(-w / 2, -h, w, h, 4, '#26313B'),
    rect(-w / 2 + 4, -h + 4, w - 8, h - 8, 2, '#2E3F52'),
    ...[0, 1, 2, 3, 4].map(i => rect(-48 + i * 20, -16 - [14, 26, 20, 38, 32][i], 13, [14, 26, 20, 38, 32][i], 1.5, i === 3 ? '#F4D68B' : '#7FE6C8', 'opacity="0.85"')),
    panel(-20, 0, 40, 3, 1.4, '#55626E', 0.8),
  ].join('')
}

function clockFace() {
  const r = 26
  return [
    ellipse(0, -r - 2, r + 2, r + 2, WHITE, edge('#AEB7C0', 2)),
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6
      const from = i % 3 === 0 ? r - 8 : r - 5
      return stroke(`M${Math.sin(a) * from} ${-r - 2 - Math.cos(a) * from}L${Math.sin(a) * (r - 2)} ${-r - 2 - Math.cos(a) * (r - 2)}`, INK, i % 3 === 0 ? 1.8 : 1)
    }),
  ].join('')
}

function logoWall() {
  const w = 312
  const h = 152
  const slats = Array.from({ length: 26 }, (_, i) => rect(-w / 2 + i * 12, -h, 9.5, h, 1, i % 5 === 0 ? '#C9A98C' : '#D5B89B')).join('')
  return [rect(-w / 2, -h, w, h, 2, shade(WOOD, 0.34)), slats, rect(-w / 2, -h - 3, w, 3, 1, shade(WOOD, 0.4))].join('')
}

function mainDoor() {
  const w = 148
  const h = 146
  const leaf = (x: number) =>
    [
      rect(x, -h + 8, w / 2 - 8, h - 8, 1, 'url(#door-glass)'),
      stroke(`M${x + 12} -22L${x + 38} ${-h + 22}M${x + 26} -18L${x + 52} ${-h + 34}`, '#FFFFFF', 4, 'opacity="0.4"'),
    ].join('')
  return [
    rect(-w / 2 - 6, -h - 6, w + 12, h + 6, 3, '#2E3944'),
    leaf(-w / 2 + 2),
    leaf(4 + 2),
    rect(-w / 2 + 2, -h + 8, 2, h - 8, 0, '#45535F'),
    rect(-3, -h + 8, 6, h - 8, 0, '#45535F'),
    rect(-14, -74, 3, 44, 1.5, '#D8DEE4'),
    rect(11, -74, 3, 44, 1.5, '#D8DEE4'),
    panel(-w / 2 - 14, -h - 16, w + 28, 12, 3, '#3F4D5A'),
    rect(-w / 2 - 8, -h - 4, w + 16, 3, 1, '#F4D68B', 'opacity="0.9"'),
  ].join('')
}

function partition() {
  return [
    path('M-1 -172L13 -188V12L-1 0Z', 'url(#partition-glass)'),
    path('M-1 -172L13 -188', 'none', `stroke="#7D8A96" stroke-width="2.4" stroke-linecap="round"`),
    path('M-1 0L13 12', 'none', `stroke="#7D8A96" stroke-width="2.4" stroke-linecap="round"`),
    rect(-3, -172, 3.4, 172, 1, '#7D8A96'),
    rect(11.4, -188, 3.4, 200, 1, '#7D8A96'),
  ].join('')
}

const rug = (rx: number, ry: number, color: string) =>
  [ellipse(0, 11, rx, ry, color), ellipse(0, 11, rx - 8, ry - 3.4, 'none', `stroke="${light(color, 0.4)}" stroke-width="1.6"`)].join('')

const mat = () => path('M-58 3L-48 -4H48L58 3L58 8H-58Z', '#4E5B68', 'opacity="0.9"')

export const FURNITURE = {
  'armchair-teal': () => armchair(TEAL),
  'armchair-plum': () => armchair(PLUM),
  'armchair-pink': () => armchair(PINK),
  beanbag,
  bench,
  bookcase,
  cabinet,
  chair: () => officeChair('#4E5B68'),
  'chair-lead': () => officeChair('#6F5E96', true),
  'chair-pink': () => officeChair('#C9779E'),
  'chart-board': chartBoard,
  'clock-face': clockFace,
  'code-board': codeBoard,
  credenza,
  'desk-dev': deskDev,
  'desk-lead': deskLead,
  'desk-marketing': deskMarketing,
  'desk-research': deskResearch,
  'floor-lamp': floorLamp,
  'funnel-board': funnelBoard,
  frames,
  'logo-wall': logoWall,
  'main-door': mainDoor,
  mat,
  'meeting-chairs': meetingChairs,
  'mood-board': moodBoard,
  'neon-sign': neonSign,
  partition,
  'planning-board': planningBoard,
  rack,
  'rug-lavender': () => rug(170, 11, '#C8B8F0'),
  'rug-mint': () => rug(70, 9, '#A9DDC6'),
  'rug-pink': () => rug(80, 9, BLUSH),
  'side-table': sideTable,
  'status-frame': () => screenFrame(172, 98),
  'task-frame': () => screenFrame(172, 98),
  'tech-shelf': techShelf,
  tv,
}

export type FurnitureId = keyof typeof FURNITURE

export const FURNITURE_DEFS = `
<linearGradient id="door-glass" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#CBE7F5"/>
  <stop offset="0.72" stop-color="#E8F4F2"/>
  <stop offset="1" stop-color="#BFE0C8"/>
</linearGradient>
<linearGradient id="partition-glass" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#BFE3EE" stop-opacity="0.45"/>
  <stop offset="1" stop-color="#DDF1F6" stop-opacity="0.22"/>
</linearGradient>`

// ---- Sprites: se mueven, cambian o tapan a un personaje ----

const screenArt = (key: string, content: string, background: string): Art => ({
  key,
  width: SCREEN.w + 4,
  height: SCREEN.h + 12,
  defs: `<clipPath id="scr"><rect width="${SCREEN.w}" height="${SCREEN.h}" rx="2"/></clipPath>`,
  body: `<g transform="${SCREEN.transform}" clip-path="url(#scr)">${rect(0, 0, SCREEN.w, SCREEN.h, 2, background)}${content}</g>`,
})

function codeLines(seed: number, palette: string[], width: number) {
  return Array.from({ length: 6 }, (_, row) => {
    const indent = ((row * 3 + seed) % 3) * 6
    const a = 10 + ((row * 17 + seed * 9) % 22)
    const b = 6 + ((row * 29 + seed * 5) % 16)
    const y = 6 + row * 7
    return (
      rect(6 + indent, y, Math.min(a, width), 3, 1.5, palette[(row + seed) % palette.length]) +
      rect(10 + indent + a, y, b, 3, 1.5, palette[(row + seed + 2) % palette.length], 'opacity="0.8"')
    )
  }).join('')
}

function barsChart(seed: number) {
  const bars = [0.4, 0.75, 0.55, 0.9, 0.65].map((v, i) => {
    const h = 30 * (0.35 + ((v * (seed + 2) + i * 0.3) % 0.65))
    return rect(9 + i * 12, 42 - h, 8, h, 1.5, i === (seed + 1) % 5 ? '#F4D68B' : '#7FE6C8')
  })
  return [...bars, stroke('M6 43H66', '#566575', 1.2)].join('')
}

function kanban(seed: number) {
  return [0, 1, 2]
    .map(col => {
      const count = ((seed + col) % 3) + 1
      return [
        rect(6 + col * 21, 6, 18, 38, 2, '#2E3D4C'),
        ...Array.from({ length: count }, (_, i) => rect(8 + col * 21, 8 + i * 11, 14, 8, 1.5, ['#F2A59A', '#F4D68B', '#7FE6C8'][col])),
      ].join('')
    })
    .join('')
}

function campaign(seed: number) {
  const r = 12
  const c = 2 * Math.PI * r
  const shares = [
    [0.5, 0.3, 0.2],
    [0.4, 0.35, 0.25],
    [0.55, 0.2, 0.25],
  ][seed]
  const colors = ['#FF8CC6', '#F4D68B', '#7FE6C8']
  let offset = 0
  const ring = shares.map((share, i) => {
    const arc = `<circle cx="20" cy="25" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="7" stroke-dasharray="${share * c} ${c}" stroke-dashoffset="${-offset * c}" transform="rotate(-90 20 25)"/>`
    offset += share
    return arc
  })
  const rows = [0, 1, 2].map(i => {
    const y = 12 + i * 12
    const length = 12 + ((i * 7 + seed * 5) % 14)
    return path(heartPath(42, y, 3.4), '#FF8CC6') + rect(48, y - 1.5, length, 3.4, 1.7, '#566575')
  })
  return [...ring, ...rows].join('')
}

export function screens(): Art[] {
  const code = ['#7FE6C8', '#F2A59A', '#C8B8F0', '#F4D68B']
  const dark = '#141C24'
  return [
    screenArt('screen-off', stroke('M8 40L36 8', '#FFFFFF', 6, 'opacity="0.05"'), '#1F2932'),
    ...[0, 1, 2].flatMap(i => [
      screenArt(`screen-dev-${i}`, codeLines(i, code, 40), dark),
      screenArt(`screen-research-${i}`, barsChart(i), dark),
      screenArt(`screen-lead-${i}`, kanban(i), dark),
      screenArt(`screen-marketing-${i}`, campaign(i), dark),
    ]),
    screenArt('screen-alert', `${rect(25, 8, 22, 30, 3, '#F4D68B')}${stroke('M36 14v11', INK, 3.4)}${ellipse(36, 31, 2.2, 2.2, INK)}`, '#3B3320'),
    screenArt('screen-idle', `${ellipse(36, 25, 13, 13, '#8FA3FF', 'opacity="0.3"')}${ellipse(36, 25, 7, 7, '#BFD0FF', 'opacity="0.55"')}`, '#1B2536'),
  ]
}

export function plants(): Art[] {
  const leaf = (x: number, y: number, r: number, s: number, color: string) =>
    `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0C-14 -14 -14 -36 0 -50C14 -36 14 -14 0 0Z" fill="${color}"/><path d="M0 -5V-42" stroke="${shade(color, 0.28)}" stroke-width="${1 / s}" fill="none"/></g>`
  const green = '#5BA883'
  const dark = '#3F8A6B'
  const pale = '#86C7A3'
  const pot = (cx: number, top: number, w: number, h: number, color: string) =>
    path(`M${cx - w / 2} ${top}h${w}l-3.4 ${h}h${-w + 6.8}z`, color, edge(color)) + rect(cx - w / 2 - 2, top - 3, w + 4, 6, 2.4, light(color, 0.2))
  return [
    {
      key: 'plant-tall',
      width: 92,
      height: 128,
      body: [
        shadow(46, 120, 22, 4),
        leaf(46, 82, -74, 0.76, dark),
        leaf(46, 82, 74, 0.76, dark),
        leaf(46, 80, -40, 0.92, green),
        leaf(46, 80, 42, 0.92, green),
        leaf(46, 78, -8, 1.08, pale),
        pot(46, 92, 36, 28, '#E6B79E'),
      ].join(''),
    },
    {
      key: 'plant-snake',
      width: 58,
      height: 92,
      body: [
        shadow(29, 85, 15, 3),
        ...(
          [
            [-16, dark],
            [16, dark],
            [-7, green],
            [8, green],
            [0, pale],
          ] as const
        ).map(([r, color]) => `<g transform="translate(29 62) rotate(${r})"><path d="M-5 0C-7 -20 -4 -44 0 -56C4 -44 7 -20 5 0Z" fill="${color}"/></g>`),
        pot(29, 60, 28, 24, '#EDE5D8'),
      ].join(''),
    },
  ]
}

export function meetingTable(): Art {
  const w = 306
  const h = 66
  return {
    key: 'meeting-table',
    width: w,
    height: h,
    body: [
      shadow(w / 2, h - 6, 140, 5, 0.18),
      rect(24, 22, 9, h - 26, 2, CHARCOAL),
      rect(w - 33, 22, 9, h - 26, 2, CHARCOAL),
      path(`M2 16L18 2H${w - 18}L${w - 2} 16Z`, light(WOOD, 0.24), edge(WOOD, 1)),
      panel(2, 16, w - 4, 9, 3, WOOD),
      rect(8, 18, w - 16, 2, 1, light(WOOD, 0.4), 'opacity="0.7"'),
      panel(52, 6, 26, 7, 1, WHITE, 0.9),
      panel(226, 7, 26, 7, 1, WHITE, 0.9),
      mug(146, 3, CORAL),
    ].join(''),
  }
}

export function receptionCounter(): Art {
  const w = 300
  const h = 78
  const slats = Array.from({ length: 24 }, (_, i) => rect(10 + i * 12, 22, 8, h - 28, 1, i % 4 === 0 ? '#C9A98C' : WOOD)).join('')
  return {
    key: 'reception-counter',
    width: w,
    height: h,
    body: [
      shadow(w / 2, h - 4, 142, 4, 0.2),
      panel(4, 14, w - 8, h - 18, 6, '#B8947A'),
      slats,
      rect(4, h - 12, w - 8, 8, 2, '#3F4D5A'),
      rect(4, h - 13.5, w - 8, 2, 1, '#F4D68B', 'opacity="0.95"'),
      path(`M2 12L12 3H${w - 12}L${w - 2} 12Z`, '#FBF9F4', edge('#D9DEE3', 1)),
      panel(2, 12, w - 4, 8, 3, '#F1EDE3'),
    ].join(''),
  }
}

/** Entrega dejada en el mostrador: se ve una por cada una que espera. */
export function reviewPaper(): Art {
  return {
    key: 'review-paper',
    width: 42,
    height: 14,
    body: `${path('M4 12L10 3H38L34 12Z', WHITE, edge('#D9DEE3', 1))}${stroke('M12 6h20M10 9h16', '#AEB7C0', 1.2)}`,
  }
}

export function beacon(): Art[] {
  const base = (color: string, extra: string) =>
    [panel(6, 26, 20, 7, 2.5, '#4F5B67', 1), path('M9 26V13C9 7 12 3 16 3C20 3 23 7 23 13V26Z', color, edge(color)), extra].join('')
  return [
    { key: 'beacon', width: 32, height: 36, body: base('#8D99A5', '') },
    { key: 'beacon-on', width: 32, height: 36, body: base('#F5B13D', rect(12.5, 9, 3.4, 13, 1.7, '#FFF3CF')) },
  ]
}

/** La gata de la oficina. Duerme en el banco de recepción y no reporta a nadie. */
export function cat(): Art {
  const fur = '#E9A76A'
  return {
    key: 'cat',
    width: 62,
    height: 36,
    body: [
      stroke('M56 26C63 18 58 9 52 12', shade(fur, 0.3), 5.5),
      stroke('M56 26C63 18 58 9 52 12', fur, 3),
      ellipse(35, 23, 23, 12, fur, edge(fur)),
      stroke('M28 12c4 6 2 15-3 21M40 11c3 7 2 14-1 21', shade(fur, 0.2), 2.4),
      path('M6 14L9 3L16 10Z', fur, edge(fur)),
      path('M18 10L25 4L26 15Z', fur, edge(fur)),
      ellipse(16, 21, 13, 11, fur, edge(fur)),
      stroke('M9 20q3 3 6 0M18 20q3 3 6 0', INK, 1.5),
      ellipse(16.5, 24, 1.5, 1.1, '#E08A76'),
    ].join(''),
  }
}

export function freeSign(): Art {
  return {
    key: 'sign-free',
    width: 76,
    height: 30,
    body: [panel(3, 3, 70, 20, 7, WHITE), path('M33 23l5 6l5-6z', WHITE, edge(WHITE))].join(''),
  }
}

export const spriteArts = (): Art[] => [
  ...screens(),
  ...plants(),
  meetingTable(),
  receptionCounter(),
  reviewPaper(),
  ...beacon(),
  cat(),
  freeSign(),
]
