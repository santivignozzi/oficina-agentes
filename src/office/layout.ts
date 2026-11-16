import { DIRECTOR, WORKERS, type RoomStyle } from '@/config'
import type { FurnitureId } from './art/furniture'

// Plano del edificio en coordenadas de mundo. Los pisos salen del equipo de
// `oficina.config.ts`: sumar un agente suma su sala, y el mundo crece solo.

export const ROOF_HEIGHT = 62
export const FLOOR_HEIGHT = 222
/** Espesor de la losa que se ve cortada entre piso y piso. */
export const SLAB = 16
/** Cuánto piso se ve antes de la pared del fondo: da la profundidad de casa de muñecas. */
export const FLOOR_DEPTH = 34
export const STREET_HEIGHT = 52

export const BUILDING = {
  left: 56,
  shell: 16,
  /** Fin de las oficinas y comienzo de la torre del ascensor. */
  inner: 1216,
  right: 1384,
}

export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  w: number
  h: number
}

export type Facing = 'front' | 'left' | 'right'
export type Pose = 'stand' | 'sit-desk' | 'sit-table' | 'sit-rest'
export type FloorFinish = 'oak' | 'walnut' | 'terrazzo' | 'slate'

/** Un lugar donde puede quedarse un agente. `via` es cómo se llega desde el pasillo. */
export interface Slot {
  x: number
  y: number
  level: number
  pose: Pose
  facing: Facing
  via?: Point[]
}

export interface Room {
  label: string
  from: number
  to: number
  wall: string
  trim: string
  finish: FloorFinish
}

/** Mueble dibujado en el fondo. `lift` lo cuelga de la pared. */
export interface Decor {
  item: FurnitureId
  x: number
  lift?: number
}

export interface Floor {
  id: string
  /** Lo que muestra el indicador del ascensor. */
  short: string
  accent: string
  rooms: Room[]
  windows: { x: number; w: number }[]
  decor: Decor[]
  /** Luminarias colgadas del techo. */
  lamps: number[]
}

// ---- Pisos generados desde `oficina.config.ts` ----
//
// Planta baja: reuniones y recepción. Después, los agentes de a dos por piso, cada uno en
// su sala. Arriba de todo, la dirección. Las salas son plantillas por estilo: las medidas
// van desde el borde izquierdo de la sala y entran en media planta.

const MID = 640

interface RoomTemplate {
  wall: string
  trim: string
  finish: FloorFinish
  kind: DeskKind
  decor: Decor[]
  windows: { x: number; w: number }[]
  lamps: number[]
  plants: Omit<Prop, 'level'>[]
  seat: number
  rest: number
  screens: number[]
}

const ROOMS: Record<RoomStyle, RoomTemplate> = {
  biblioteca: {
    wall: '#E2F1E9',
    trim: '#BFE8D5',
    finish: 'oak',
    kind: 'research',
    decor: [
      { item: 'bookcase', x: 86 },
      { item: 'rug-mint', x: 206 },
      { item: 'armchair-teal', x: 206 },
      { item: 'chart-board', x: 328, lift: 62 },
      { item: 'cabinet', x: 328 },
      { item: 'desk-research', x: 494 },
      { item: 'chair', x: 406 },
    ],
    windows: [{ x: 434, w: 112 }],
    lamps: [198, 488],
    plants: [{ key: 'plant-snake', x: 24 }],
    seat: 406,
    rest: 206,
    screens: [474],
  },
  tecnica: {
    wall: '#E2E9FF',
    trim: '#C3D3FA',
    finish: 'slate',
    kind: 'dev',
    decor: [
      { item: 'beanbag', x: 54 },
      { item: 'desk-dev', x: 244 },
      { item: 'chair', x: 130 },
      { item: 'code-board', x: 414, lift: 62 },
      { item: 'tech-shelf', x: 414 },
      { item: 'rack', x: 528 },
    ],
    windows: [{ x: 166, w: 136 }],
    lamps: [240, 510],
    plants: [],
    seat: 130,
    rest: 54,
    screens: [185, 257],
  },
  creativa: {
    wall: '#FBEAF2',
    trim: '#F4B6D0',
    finish: 'oak',
    kind: 'marketing',
    decor: [
      { item: 'mood-board', x: 112, lift: 70 },
      { item: 'cabinet', x: 112 },
      { item: 'rug-pink', x: 264 },
      { item: 'armchair-pink', x: 264 },
      { item: 'neon-sign', x: 264, lift: 92 },
      { item: 'desk-marketing', x: 456 },
      { item: 'chair-pink', x: 360 },
    ],
    windows: [],
    lamps: [170, 456],
    plants: [{ key: 'plant-tall', x: 540 }],
    seat: 360,
    rest: 264,
    screens: [436],
  },
}

/** Lo que ocupa la otra mitad de un piso con un solo agente: un rincón para descansar. */
const NOOK: Pick<RoomTemplate, 'decor' | 'windows' | 'lamps' | 'plants'> = {
  decor: [
    { item: 'frames', x: 150, lift: 82 },
    { item: 'credenza', x: 150 },
    { item: 'rug-lavender', x: 390 },
    { item: 'armchair-plum', x: 340 },
    { item: 'side-table', x: 410 },
    { item: 'floor-lamp', x: 450 },
  ],
  windows: [{ x: 250, w: 60 }],
  lamps: [150, 390],
  plants: [{ key: 'plant-snake', x: 520 }],
}

const shift = (x: number, by: number) => x + by
const shiftDecor = (decor: Decor[], by: number) => decor.map(d => ({ ...d, x: shift(d.x, by) }))

interface Seat {
  id: string
  kind: DeskKind
  level: number
  seat: number
  rest: number
  screens: number[]
}

const LOBBY: Floor = {
  id: 'recepcion',
  short: 'PB',
  accent: '#F4D68B',
  rooms: [
    { label: 'SALA DE REUNIONES', from: 72, to: 452, wall: '#FBEAE4', trim: '#F2A59A', finish: 'oak' },
    { label: 'RECEPCIÓN', from: 452, to: BUILDING.inner, wall: '#FBF2DF', trim: '#F4D68B', finish: 'terrazzo' },
  ],
  windows: [{ x: 104, w: 92 }],
  lamps: [290, 548, 820, 1168],
  decor: [
    { item: 'tv', x: 318, lift: 66 },
    { item: 'meeting-chairs', x: 290 },
    { item: 'partition', x: 452 },
    { item: 'main-door', x: 548 },
    { item: 'logo-wall', x: 820 },
    { item: 'status-frame', x: 1044, lift: 68 },
    { item: 'bench', x: 1044 },
    { item: 'clock-face', x: 1168, lift: 92 },
    { item: 'mat', x: 548 },
  ],
}

const LEAD_FLOOR = (id: string): Omit<Floor, 'short'> => ({
  id,
  accent: '#C8B8F0',
  rooms: [{ label: 'DIRECCIÓN', from: 72, to: BUILDING.inner, wall: '#ECE6F7', trim: '#C8B8F0', finish: 'walnut' }],
  windows: [{ x: 620, w: 236 }],
  lamps: [230, 480, 738, 1130],
  decor: [
    { item: 'frames', x: 196, lift: 82 },
    { item: 'credenza', x: 196 },
    { item: 'planning-board', x: 424, lift: 60 },
    { item: 'rug-lavender', x: 738 },
    { item: 'desk-lead', x: 774 },
    { item: 'chair-lead', x: 650 },
    { item: 'task-frame', x: 956, lift: 72 },
    { item: 'armchair-plum', x: 1098 },
    { item: 'side-table', x: 1160 },
    { item: 'floor-lamp', x: 1194 },
  ],
})

function buildBuilding() {
  const floors: Floor[] = [LOBBY]
  const seats: Seat[] = []
  const props: Prop[] = [
    { key: 'plant-tall', x: 476, level: 0 },
    { key: 'plant-snake', x: 622, level: 0 },
    { key: 'plant-tall', x: 1176, level: 0 },
  ]

  for (let i = 0; i < WORKERS.length; i += 2) {
    const level = floors.length
    const pair = WORKERS.slice(i, i + 2)
    const floor: Floor = { id: `piso-${level}`, short: String(level), accent: '', rooms: [], windows: [], lamps: [], decor: [] }

    pair.forEach((worker, side) => {
      const t = ROOMS[worker.room.style]
      const from = side === 0 ? 72 : MID
      const to = side === 0 && pair.length === 2 ? MID : BUILDING.inner
      floor.rooms.push({ label: (worker.room.label ?? worker.role).toUpperCase(), from, to, wall: t.wall, trim: t.trim, finish: t.finish })
      floor.decor.push(...shiftDecor(t.decor, from))
      floor.windows.push(...t.windows.map(w => ({ ...w, x: shift(w.x, from) })))
      floor.lamps.push(...t.lamps.map(x => shift(x, from)))
      props.push(...t.plants.map(p => ({ ...p, x: shift(p.x, from), level })))
      seats.push({ id: worker.id, kind: t.kind, level, seat: shift(t.seat, from), rest: shift(t.rest, from), screens: t.screens.map(x => shift(x, from)) })
    })

    if (pair.length === 2) {
      floor.decor.push({ item: 'partition', x: MID })
    } else {
      floor.decor.push(...shiftDecor(NOOK.decor, MID))
      floor.windows.push(...NOOK.windows.map(w => ({ ...w, x: shift(w.x, MID) })))
      floor.lamps.push(...NOOK.lamps.map(x => shift(x, MID)))
      props.push(...NOOK.plants.map(p => ({ ...p, x: shift(p.x, MID), level })))
    }
    floor.accent = floor.rooms[0].trim
    floors.push(floor)
  }

  const lead = floors.length
  floors.push({ ...LEAD_FLOOR(DIRECTOR.id), short: String(lead) })
  seats.push({ id: DIRECTOR.id, kind: 'lead', level: lead, seat: 650, rest: 1098, screens: [744] })
  props.push({ key: 'plant-tall', x: 108, level: lead }, { key: 'plant-snake', x: 888, level: lead })

  return { floors, seats, props, lead }
}

const BUILT = buildBuilding()

export const FLOORS: Floor[] = BUILT.floors
/** El piso de la dirección: el último. Ahí están la pizarra y la pantalla de tareas. */
export const LEAD_LEVEL = BUILT.lead

export const WORLD = {
  width: 1440,
  height: ROOF_HEIGHT + FLOORS.length * FLOOR_HEIGHT + STREET_HEIGHT,
}

/** Borde de la losa: donde termina el piso visible. */
export const floorBase = (level: number) => WORLD.height - STREET_HEIGHT - level * FLOOR_HEIGHT
export const ceilingY = (level: number) => floorBase(level) - FLOOR_HEIGHT + SLAB
/** Línea por la que caminan: bien adelante, para pasar delante de los muebles. */
export const walkY = (level: number) => floorBase(level) - 9
/** Donde apoyan los muebles pegados a la pared. */
export const backY = (level: number) => floorBase(level) - 22
export const wallBottom = (level: number) => floorBase(level) - FLOOR_DEPTH

export type DeskKind = 'lead' | 'research' | 'dev' | 'marketing'

export interface Desk {
  id: string
  kind: DeskKind
  level: number
  seat: Slot
  /** Dónde descansa quien trabaja acá cuando está sin tarea. */
  rest: Slot
  /** Dónde se para otro agente para derivarle trabajo. */
  handoff: Point
  /** Esquina superior izquierda de cada pantalla. */
  screens: Point[]
}

function makeDesk(id: string, kind: DeskKind, level: number, seatX: number, restX: number, screens: number[]): Desk {
  const y = backY(level) + 3
  return {
    id,
    kind,
    level,
    seat: {
      x: seatX,
      y,
      level,
      pose: 'sit-desk',
      facing: 'right',
      via: [{ x: seatX - 26, y: walkY(level) }],
    },
    rest: {
      x: restX,
      y: y + 2,
      level,
      pose: 'sit-rest',
      facing: 'front',
      via: [{ x: restX, y: walkY(level) }],
    },
    handoff: { x: seatX - 62, y: walkY(level) - 3 },
    screens: screens.map(x => ({ x, y: backY(level) - 141 })),
  }
}

export const DESKS: Desk[] = BUILT.seats.map(s => makeDesk(s.id, s.kind, s.level, s.seat, s.rest, s.screens))

const TABLE = { x: 290, width: 300 }
const COUNTER = { x: 820, width: 292 }

const meetingSeat = (x: number): Slot => ({
  x,
  y: backY(0) + 2,
  level: 0,
  pose: 'sit-table',
  facing: 'front',
  via: [
    { x: TABLE.x + TABLE.width / 2 + 18, y: walkY(0) },
    { x: TABLE.x + TABLE.width / 2 + 18, y: backY(0) },
  ],
})

const reviewSpot = (x: number): Slot => ({
  x,
  y: backY(0) - 3,
  level: 0,
  pose: 'stand',
  facing: 'front',
  via: [
    { x: COUNTER.x + COUNTER.width / 2 + 16, y: walkY(0) },
    { x: COUNTER.x + COUNTER.width / 2 + 16, y: backY(0) - 3 },
  ],
})

/**
 * Lugares compartidos. Cada agente toma el primero libre. En el mostrador entran todos:
 * como esperar tu revisión ya no frena a nadie, pueden coincidir ahí.
 */
export const SLOTS: Record<'meeting' | 'review', Slot[]> = {
  meeting: [200, 260, 320, 380, 170, 410, 230].map(meetingSeat),
  review: [860, 794, 926, 728, 992, 662, 1058].map(reviewSpot),
}

/** Lo que se dibuja delante de quien se sienta o se para detrás. */
export const FOREGROUND = [
  { key: 'meeting-table', x: TABLE.x, y: floorBase(0) - 12 },
  { key: 'reception-counter', x: COUNTER.x, y: floorBase(0) - 12 },
]

export interface Prop {
  key: string
  x: number
  level: number
}

/** Plantas sueltas: son lo único del fondo que se mueve, y se mecen apenas. */
export const PROPS: Prop[] = BUILT.props

export const ELEVATOR = {
  /** Centro de la cabina. */
  x: 1300,
  width: 108,
  height: 140,
  /** Dónde se espera, en el pasillo, antes de subir. */
  wait: 1228,
  /** Dónde queda cada pasajero adentro. Entran los cuatro: a la reunión bajan juntos. */
  spots: [-27, -9, 9, 27],
}

export const HOTSPOTS: { id: 'review' | 'board'; area: Rect; label: string }[] = [
  { id: 'review', area: { x: COUNTER.x - COUNTER.width / 2, y: floorBase(0) - 80, w: COUNTER.width, h: 70 }, label: 'Mesa de revisión' },
  { id: 'board', area: { x: 290, y: backY(LEAD_LEVEL) - 160, w: 268, h: 104 }, label: 'Pizarra' },
  { id: 'board', area: { x: 870, y: backY(LEAD_LEVEL) - 170, w: 172, h: 98 }, label: 'Tareas' },
]

/** Dónde se escribe la consigna activa. */
export const BOARD_TEXT = { x: 304, y: backY(LEAD_LEVEL) - 146, width: 150 }
/** Pantalla con el avance de la consigna. */
export const TASK_SCREEN = { x: 882, y: backY(LEAD_LEVEL) - 158, width: 148 }
/** Pantalla de recepción con los números generales. */
export const STATUS_SCREEN = { x: 970, y: backY(0) - 158, width: 148 }
export const CLOCK = { x: 1168, y: backY(0) - 92 - 28, radius: 24 }
const TECH = DESKS.find(desk => desk.kind === 'dev') ?? null
/** Estantes del rack, cuyas luces siguen la actividad de la primera sala técnica. `null` si no hay. */
export const RACK = TECH && { x: TECH.seat.x + 374, top: backY(TECH.level) - 146, deskId: TECH.id }
/** Barras de actividad al lado de los monitores. */
export const ACTIVITY_METER = TECH && { x: TECH.seat.x + 324, y: backY(TECH.level) - 52, deskId: TECH.id }
export const BEACON = { x: 694, y: floorBase(0) - 86 }
export const STEAM = { x: 1156, y: backY(LEAD_LEVEL) - 66 }
export const CAT = { x: 1082, y: backY(0) - 29 }
/** Cartel del techo. */
export const ROOF_SIGN = { x: 720, y: 35 }
