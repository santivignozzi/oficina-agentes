import {
  BUILDING,
  backY,
  ceilingY,
  ELEVATOR,
  FLOOR_DEPTH,
  FLOORS,
  floorBase,
  ROOF_HEIGHT,
  SLAB,
  wallBottom,
  WORLD,
  type Floor,
  type Room,
} from '../layout'
import { FURNITURE, FURNITURE_DEFS } from './furniture'
import { at, edge, ellipse, light, panel, path, rect, shade, stroke, type Art } from './svg'

// El edificio cortado al medio, sin fachada, como una casa de muñecas. Va todo en una
// sola textura porque nada de esto se mueve. Las ventanas son huecos: detrás corre el cielo.

const { width: W, height: H } = WORLD

/** Lo macizo del corte: losas y muros. Oscuro, para que los interiores resalten. */
const POCHE = '#2E3944'
const POCHE_LIGHT = '#42505D'
const SIDEWALK = '#D9D3C7'

const PATTERNS = `
<pattern id="oak" width="150" height="34" patternUnits="userSpaceOnUse" patternTransform="skewX(-18)">
  <rect width="150" height="34" fill="#E2C7A8"/>
  <rect width="150" height="11" fill="#E8D0B4"/>
  <rect y="22" width="150" height="12" fill="#DDC0A0"/>
  <path d="M0 11H150M0 22H150M46 0V11M118 0V11M20 11V22M92 11V22M62 22V34M134 22V34" stroke="#C7A788" stroke-width="1"/>
</pattern>
<pattern id="walnut" width="150" height="34" patternUnits="userSpaceOnUse" patternTransform="skewX(-18)">
  <rect width="150" height="34" fill="#A98068"/>
  <rect width="150" height="11" fill="#B28A72"/>
  <rect y="22" width="150" height="12" fill="#A27A62"/>
  <path d="M0 11H150M0 22H150M46 0V11M118 0V11M20 11V22M92 11V22M62 22V34M134 22V34" stroke="#8A6650" stroke-width="1"/>
</pattern>
<pattern id="terrazzo" width="96" height="34" patternUnits="userSpaceOnUse">
  <rect width="96" height="34" fill="#EFE7D8"/>
  <path d="M0 16H96M48 0V16M0 16V34M72 16V34" stroke="#DDD3C0" stroke-width="1"/>
  <circle cx="14" cy="7" r="1.4" fill="#D5C7AE"/><circle cx="66" cy="10" r="1.2" fill="#CFE0D6"/>
  <circle cx="30" cy="26" r="1.3" fill="#E7C5B4"/><circle cx="86" cy="24" r="1.2" fill="#D5C7AE"/>
</pattern>
<pattern id="slate" width="120" height="34" patternUnits="userSpaceOnUse" patternTransform="skewX(-14)">
  <rect width="120" height="34" fill="#B9C4D6"/>
  <rect y="17" width="120" height="17" fill="#B2BED1"/>
  <path d="M0 17H120M60 0V17M30 17V34M90 17V34" stroke="#9FACC1" stroke-width="1"/>
</pattern>
<linearGradient id="ceiling-shade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1F2A33" stop-opacity="0.2"/>
  <stop offset="1" stop-color="#1F2A33" stop-opacity="0"/>
</linearGradient>
<linearGradient id="floor-shade" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1F2A33" stop-opacity="0.2"/>
  <stop offset="1" stop-color="#1F2A33" stop-opacity="0"/>
</linearGradient>
<linearGradient id="corner-shade" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#1F2A33" stop-opacity="0.16"/>
  <stop offset="1" stop-color="#1F2A33" stop-opacity="0"/>
</linearGradient>
<radialGradient id="lamp-wash" cx="0.5" cy="0" r="1">
  <stop offset="0" stop-color="#FFF6DF" stop-opacity="0.75"/>
  <stop offset="1" stop-color="#FFF6DF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#1F2A33"/>
  <stop offset="0.5" stop-color="#34414D"/>
  <stop offset="1" stop-color="#1F2A33"/>
</linearGradient>`

function windowHole(window: { x: number; w: number }, level: number) {
  const top = ceilingY(level) + 34
  const bottom = top + 84
  return `M${window.x} ${top}H${window.x + window.w}V${bottom}H${window.x}Z`
}

function windowFrame(window: { x: number; w: number }, level: number) {
  const top = ceilingY(level) + 34
  const bottom = top + 84
  const { x, w } = window
  const panes = Math.max(1, Math.round(w / 90))
  const mullions = Array.from({ length: panes - 1 }, (_, i) => rect(x + (w / panes) * (i + 1) - 1.5, top, 3, 84, 0, '#FBF9F4')).join('')
  return [
    rect(x - 5, top - 5, w + 10, 94, 3, 'none', 'stroke="#FBF9F4" stroke-width="5"'),
    rect(x - 7.5, top - 7.5, w + 15, 99, 4, 'none', edge('#D9D3C7', 1)),
    mullions,
    panel(x - 11, bottom + 5, w + 22, 5, 2, '#FBF9F4', 1),
  ].join('')
}

function roomShell(room: Room, floor: Floor, level: number) {
  const top = ceilingY(level)
  const bottom = wallBottom(level)
  const w = room.to - room.from
  const holes = floor.windows
    .filter(window => window.x >= room.from && window.x + window.w <= room.to)
    .map(window => windowHole(window, level))
    .join('')

  return [
    path(`M${room.from} ${top}H${room.to}V${bottom}H${room.from}Z${holes}`, room.wall, 'fill-rule="evenodd"'),
    // Friso de color: identifica el piso aunque se vea de lejos.
    rect(room.from, bottom - 52, w, 52, 0, room.trim, 'opacity="0.34"'),
    rect(room.from, bottom - 54, w, 2, 0, room.trim),
    rect(room.from, bottom - 9, w, 9, 0, '#FBF9F4'),
    rect(room.from, bottom - 1, w, 1.4, 0, shade(room.wall, 0.3)),
    rect(room.from, bottom, w, FLOOR_DEPTH, 0, `url(#${room.finish})`),
    rect(room.from, bottom, w, 14, 0, 'url(#floor-shade)'),
    rect(room.from, top, w, 44, 0, 'url(#ceiling-shade)'),
    path(`M${room.from} ${top}H${room.to}V${top + 12}H${room.from}Z`, shade(room.wall, 0.1)),
  ].join('')
}

function lamps(floor: Floor, level: number) {
  const top = ceilingY(level)
  return floor.lamps
    .map(x =>
      [
        ellipse(x, top + 30, 96, 74, 'url(#lamp-wash)'),
        rect(x - 0.8, top, 1.6, 15, 0, '#55626E'),
        path(`M${x - 22} ${top + 26}L${x - 8} ${top + 14}H${x + 8}L${x + 22} ${top + 26}Z`, '#39444F'),
        ellipse(x, top + 26, 22, 2.6, '#FFF1C9'),
      ].join(''),
    )
    .join('')
}

function decorations(floor: Floor, level: number) {
  return floor.decor.map(decor => at(decor.x, backY(level) - (decor.lift ?? 0), FURNITURE[decor.item]())).join('')
}

function floorShell(floor: Floor, level: number) {
  const base = floorBase(level)
  const top = ceilingY(level)
  const bottom = wallBottom(level)
  return [
    ...floor.rooms.map(room => roomShell(room, floor, level)),
    ...floor.windows.map(window => windowFrame(window, level)),
    // Muro izquierdo en perspectiva: es lo que hace que se lea como un cuarto y no un telón.
    path(`M${BUILDING.left + BUILDING.shell} ${top}L${BUILDING.left + BUILDING.shell + 18} ${top + 12}V${bottom}L${BUILDING.left + BUILDING.shell} ${base}Z`, shade(floor.rooms[0].wall, 0.14)),
    rect(BUILDING.left + BUILDING.shell + 18, top + 12, 26, bottom - top - 12, 0, 'url(#corner-shade)'),
    lamps(floor, level),
    decorations(floor, level),
  ].join('')
}

function towerShell(floor: Floor, level: number) {
  const top = ceilingY(level)
  const bottom = wallBottom(level)
  const { inner, right, shell } = BUILDING
  const left = ELEVATOR.x - ELEVATOR.width / 2 - 6
  const width = ELEVATOR.width + 12
  const portalTop = bottom - ELEVATOR.height - 8
  return [
    rect(inner, top, right - inner - shell, bottom - top, 0, '#EEF0F2'),
    rect(inner, bottom - 52, right - inner - shell, 52, 0, floor.accent, 'opacity="0.4"'),
    rect(inner, bottom - 54, right - inner - shell, 2, 0, floor.accent),
    rect(inner, bottom, right - inner - shell, FLOOR_DEPTH, 0, 'url(#terrazzo)'),
    rect(inner, bottom, right - inner - shell, 14, 0, 'url(#floor-shade)'),
    rect(inner, top, right - inner - shell, 12, 0, '#D5D9DE'),
    rect(inner, top, right - inner - shell, 40, 0, 'url(#ceiling-shade)'),
    // Marco de la caja, con la profundidad oscura detrás: por ahí pasa la cabina.
    rect(left, portalTop, width, bottom - portalTop + 8, 3, 'url(#shaft)'),
    rect(left - 4, portalTop - 4, 4, bottom - portalTop + 12, 1, '#7D8A96'),
    rect(left + width, portalTop - 4, 4, bottom - portalTop + 12, 1, '#7D8A96'),
    rect(left - 4, portalTop - 8, width + 8, 6, 2, '#7D8A96'),
    // Columna entre oficinas y torre.
    rect(inner - 7, top, 14, bottom - top, 0, shade('#EEF0F2', 0.12)),
    rect(inner - 7, top, 3, bottom - top, 0, shade('#EEF0F2', 0.2)),
    // Visor del indicador de piso.
    panel(ELEVATOR.x - 26, portalTop - 21, 52, 17, 4, '#1B242C', 1),
  ].join('')
}

/** Rieles y cable de la caja: siguen entre piso y piso, también detrás de las losas. */
function shaftRails() {
  const left = ELEVATOR.x - ELEVATOR.width / 2 + 6
  const right = ELEVATOR.x + ELEVATOR.width / 2 - 6
  return FLOORS.map((_, level) => {
    const top = wallBottom(level) - ELEVATOR.height - 8
    const bottom = wallBottom(level) + 8
    return [rect(left, top, 2.4, bottom - top, 0, '#7D8A96', 'opacity="0.5"'), rect(right, top, 2.4, bottom - top, 0, '#7D8A96', 'opacity="0.5"')].join('')
  }).join('')
}

function slabs() {
  const { left, right } = BUILDING
  const width = right - left
  return [
    ...FLOORS.map((_, level) => {
      const base = floorBase(level)
      return [
        rect(left, base, width, SLAB, 0, POCHE),
        rect(left, base, width, 2, 0, POCHE_LIGHT),
        rect(left, base + SLAB - 2, width, 8, 0, 'url(#ceiling-shade)'),
      ].join('')
    }),
    rect(left, ROOF_HEIGHT, width, SLAB, 2, POCHE),
    rect(left, ROOF_HEIGHT, width, 2, 0, POCHE_LIGHT),
    rect(left, ROOF_HEIGHT, BUILDING.shell, H - ROOF_HEIGHT - STREET_OFFSET, 0, POCHE),
    rect(right - BUILDING.shell, ROOF_HEIGHT, BUILDING.shell, H - ROOF_HEIGHT - STREET_OFFSET, 0, POCHE),
    rect(left + BUILDING.shell - 2, ROOF_HEIGHT, 2, H - ROOF_HEIGHT - STREET_OFFSET, 0, POCHE_LIGHT),
  ].join('')
}

const STREET_OFFSET = 36

function roof() {
  const y = ROOF_HEIGHT
  const unit = (x: number) =>
    [
      panel(x, y - 28, 58, 28, 3, '#C9D1D9'),
      ellipse(x + 20, y - 14, 10, 10, '#A7B2BD'),
      stroke(`M${x + 12} ${y - 14}h16M${x + 20} ${y - 22}v16`, '#7D8A96', 1.4),
      ...[0, 1, 2].map(i => rect(x + 38, y - 24 + i * 7, 14, 2.4, 1, '#7D8A96')),
    ].join('')
  const solar = (x: number) => `<g transform="translate(${x} ${y - 4}) skewX(-24)">${panel(0, -22, 56, 22, 2, '#35507A', 1)}${stroke('M18.6 -22V0M37.3 -22V0M0 -11H56', '#6E8FBF', 1)}</g>`
  const planter = (x: number, w: number) =>
    [
      panel(x, y - 12, w, 12, 2, '#EDE5D8'),
      ...Array.from({ length: Math.floor(w / 12) }, (_, i) => ellipse(x + 6 + i * 12, y - 15, 8, 9, i % 2 ? '#7CB795' : '#5BA883')),
    ].join('')
  const { right, shell } = BUILDING
  const tower = { left: BUILDING.inner + 18, right: right - shell + 6 }
  return [
    unit(112),
    unit(182),
    solar(286),
    solar(352),
    solar(418),
    planter(980, 130),
    // Soportes del cartel: las letras se escriben encima porque usan la tipografía de la app.
    panel(566, y - 8, 8, 8, 1, POCHE_LIGHT, 1),
    panel(866, y - 8, 8, 8, 1, POCHE_LIGHT, 1),
    panel(556, y - 46, 328, 38, 7, POCHE),
    rect(562, y - 40, 316, 26, 4, POCHE_LIGHT, 'opacity="0.35"'),
    // Sala de máquinas del ascensor, arriba de la torre.
    path(`M${tower.left} ${y}V${y - 42}Q${tower.left} ${y - 50} ${tower.left + 8} ${y - 50}H${tower.right - 8}Q${tower.right} ${y - 50} ${tower.right} ${y - 42}V${y}Z`, '#E6E9EC', edge('#E6E9EC', 1.2)),
    rect(tower.left + 14, y - 38, 50, 6, 1, '#AEB7C0'),
    rect(tower.left + 14, y - 28, 50, 6, 1, '#AEB7C0'),
    rect(tower.left + 14, y - 18, 50, 6, 1, '#AEB7C0'),
    stroke(`M${tower.right - 24} ${y - 50}V${y - 60}`, '#55626E', 2),
  ].join('')
}

function street() {
  const y = floorBase(0) + SLAB
  return [
    rect(0, y, W, H - y, 0, SIDEWALK),
    rect(0, y, W, 3, 0, '#C4BDAF'),
    rect(0, H - 13, W, 13, 0, '#6D7682'),
    rect(0, H - 15, W, 2.4, 0, '#EEE9DE'),
    ...Array.from({ length: 22 }, (_, i) => rect(i * 68, y + 3, 1.2, H - y - 18, 0, '#C4BDAF')),
    // Una franja de sombra del edificio sobre la vereda.
    rect(BUILDING.left - 6, y + 3, BUILDING.right - BUILDING.left + 12, 8, 0, 'url(#floor-shade)'),
  ].join('')
}

export function buildingArt(): Art {
  return {
    key: 'building',
    width: W,
    height: H,
    defs: PATTERNS + FURNITURE_DEFS,
    body: [
      street(),
      roof(),
      ...FLOORS.map((floor, level) => towerShell(floor, level)),
      shaftRails(),
      ...FLOORS.map((floor, level) => floorShell(floor, level)),
      slabs(),
    ].join(''),
  }
}

/** Partes de la cabina. Van separadas porque el pasajero queda entre el fondo y las puertas. */
export function elevatorArts(): Art[] {
  const { width: w, height: h } = ELEVATOR
  const steel = '#D8DEE4'
  const bandWidth = w + 20
  // Lo que hay entre un vano y el de arriba: descanso, losa, cielorraso y pared.
  const bandHeight = FLOOR_DEPTH + SLAB + 12 + 12
  const leaf = (key: string) => ({
    key,
    width: w / 2 - 6,
    height: h - 10,
    body: [
      rect(0, 0, w / 2 - 6, h - 10, 0, steel),
      rect(0, 0, 1, h - 10, 0, '#AEB7C0'),
      rect(w / 2 - 7, 0, 1, h - 10, 0, '#8F9CA8'),
      // Visor de vidrio: se ve quién viaja.
      rect(10, 24, w / 2 - 26, 70, 3, '#2E3944', 'opacity="0.42"'),
      rect(10, 24, w / 2 - 26, 70, 3, 'none', edge(steel, 1)),
    ].join(''),
  })
  return [
    {
      key: 'cabin-back',
      width: w,
      height: h,
      body: [
        rect(0, 0, w, h, 4, '#F1E9DB'),
        rect(0, 0, w, 9, 3, '#FFF6DF'),
        rect(6, 12, w - 12, 42, 2, '#FBF9F4', 'opacity="0.55"'),
        rect(0, h - 26, w, 3, 0, '#D5B89B'),
        rect(0, h - 9, w, 9, 0, '#A9846A'),
        rect(0, 0, 8, h, 0, '#1F2A33', 'opacity="0.1"'),
        rect(w - 8, 0, 8, h, 0, '#1F2A33', 'opacity="0.1"'),
      ].join(''),
    },
    {
      key: 'tower-band',
      width: bandWidth,
      height: bandHeight,
      defs: PATTERNS,
      body: [
        rect(0, 0, bandWidth, FLOOR_DEPTH, 0, 'url(#terrazzo)'),
        rect(0, 0, bandWidth, 14, 0, 'url(#floor-shade)'),
        rect(0, FLOOR_DEPTH, bandWidth, SLAB, 0, POCHE),
        rect(0, FLOOR_DEPTH, bandWidth, 2, 0, POCHE_LIGHT),
        rect(0, FLOOR_DEPTH + SLAB, bandWidth, 24, 0, '#EEF0F2'),
        rect(0, FLOOR_DEPTH + SLAB, bandWidth, 12, 0, '#D5D9DE'),
        rect(0, FLOOR_DEPTH + SLAB, bandWidth, 24, 0, 'url(#ceiling-shade)'),
        rect(4, bandHeight - 6, bandWidth - 8, 6, 2, '#7D8A96'),
        panel(bandWidth / 2 - 26, bandHeight - 21 + 2, 52, 13, 4, '#1B242C', 1),
      ].join(''),
    },
    leaf('door-left'),
    leaf('door-right'),
    {
      key: 'cabin-frame',
      width: w,
      height: h,
      body: [
        rect(0, 0, 6, h, 2, '#8F9CA8'),
        rect(w - 6, 0, 6, h, 2, '#8F9CA8'),
        rect(0, 0, w, 10, 3, '#8F9CA8'),
        rect(0, h - 3, w, 3, 1, '#6F7C88'),
        rect(4, 2, w - 8, 2, 1, light('#8F9CA8', 0.4)),
      ].join(''),
    },
  ]
}

/** Luces de noche ya resueltas en una sola imagen: un quad en lugar de muchos. */
export function nightGlowArt(): Art {
  const pool = (x: number, y: number, rx: number, ry: number, color: string, opacity: number) =>
    ellipse(x, y, rx, ry, `url(#glow-${color})`, `opacity="${opacity}"`)
  return {
    key: 'night-glow',
    width: W,
    height: H,
    resolution: 0.34,
    defs: [
      ['warm', '#FFC98A'],
      ['cool', '#8FB4FF'],
    ]
      .map(([id, color]) => `<radialGradient id="glow-${id}"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`)
      .join(''),
    body: [
      ...FLOORS.flatMap((floor, level) =>
        floor.lamps.map(x => pool(x, ceilingY(level) + 76, 136, 96, 'warm', 0.42)),
      ),
      ...FLOORS.map((_, level) => pool(ELEVATOR.x, ceilingY(level) + 90, 90, 100, 'cool', 0.22)),
    ].join(''),
  }
}

export function skyArt(night: boolean): Art {
  const skyline = (y: number, color: string, seed: number) => {
    let d = `M0 ${H}V${y}`
    let x = 0
    let i = seed
    while (x < W) {
      const w = 56 + ((i * 37) % 70)
      const top = y - 34 - ((i * 53) % 150)
      d += `H${x}V${top}H${x + w}V${y}`
      x += w + 10 + ((i * 11) % 24)
      i += 1
    }
    return `<path d="${d}V${H}H0Z" fill="${color}"/>`
  }
  const lit = night
    ? Array.from({ length: 170 }, (_, i) => {
        const x = (i * 97) % W
        const y = 330 + ((i * 61) % 380)
        return i % 3 === 0 ? '' : rect(x, y, 4, 5, 0.6, i % 4 === 0 ? '#FFD98A' : '#FFE9B8', 'opacity="0.7"')
      }).join('')
    : ''
  const stars = night
    ? Array.from({ length: 110 }, (_, i) => ellipse((i * 131) % W, (i * 43) % 300, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1, '#FFFFFF', 'opacity="0.8"')).join('')
    : ''
  const tree = (x: number, y: number, r: number, color: string) => ellipse(x, y - r, r * 0.8, r, color) + rect(x - 2.5, y - r * 0.4, 5, r * 0.6, 1, '#7E6B5E')
  return {
    key: night ? 'sky-night' : 'sky-day',
    width: W,
    height: H,
    resolution: 0.5,
    defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${
      night
        ? '<stop offset="0" stop-color="#141B33"/><stop offset="0.7" stop-color="#2C2F5C"/><stop offset="1" stop-color="#46406F"/>'
        : '<stop offset="0" stop-color="#B9DCF2"/><stop offset="0.65" stop-color="#E3EFF3"/><stop offset="1" stop-color="#F5F4F0"/>'
    }</linearGradient>`,
    body: [
      rect(0, 0, W, H, 0, 'url(#sky)'),
      stars,
      night ? ellipse(1404, 92, 13, 13, '#FFF4D2') : ellipse(26, 70, 18, 18, '#FFF3C4'),
      skyline(H - 200, night ? '#2B2C57' : '#D5E3EA', 3),
      skyline(H - 120, night ? '#20224A' : '#C3D6DD', 7),
      lit,
      tree(22, H - 40, 34, night ? '#1E3A3A' : '#8CC3A4'),
      tree(1420, H - 40, 30, night ? '#1E3A3A' : '#7CB795'),
    ].join(''),
  }
}

export function cloudArt(): Art {
  return {
    key: 'cloud',
    width: 96,
    height: 40,
    body: `${ellipse(26, 26, 22, 12, '#FFFFFF')}${ellipse(48, 19, 22, 16, '#FFFFFF')}${ellipse(70, 27, 20, 11, '#FFFFFF')}`,
  }
}
