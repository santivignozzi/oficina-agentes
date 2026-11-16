import * as Phaser from 'phaser'
import type { Agent, AgentMood, AgentStatus } from '@/domain/types'
import { HEAD_BOX, RIG, UNDER_BOX } from './art/people'
import { CABIN_DEPTH, type Elevator, type Rider } from './elevator'
import { DESKS, ELEVATOR, walkY, type DeskKind, type Facing, type Point, type Pose, type Slot } from './layout'

/** Lo que sale de la pantalla mientras trabaja. Cada capacidad tiene el suyo. */
export type BitKind = 'code' | 'doc' | 'chart' | 'heart'

const BIT_OF: Record<DeskKind, BitKind> = {
  lead: 'doc',
  research: 'chart',
  dev: 'code',
  marketing: 'heart',
}

const bitOf = (deskId: string) => BIT_OF[DESKS.find(desk => desk.id === deskId)?.kind ?? 'lead']

/** Lo que el personaje necesita de la escena, sin conocerla. */
export interface CharacterHost {
  world: Phaser.Scene
  /** Escala a la que se rasterizaron las texturas. */
  textureScale: number
  fontFamily: string
  textResolution: number
  calm: boolean
  lift: Elevator
  ui(): number
  /** Borde superior de lo que se ve, para que un globo no se corte. */
  viewTop(): number
  /** `false` si otro agente acaba de decir lo mismo: en una reunión hablaría el coro. */
  claimSpeech(text: string): boolean
  onAgentClick(id: string): void
  isDrag(): boolean
  emitBit(x: number, y: number, kind: BitKind, tint: number): void
}

const RIG_SCALE = 0.9
const HEAD_TOP = 146 * RIG_SCALE

/** Altura de la cadera según cómo esté apoyado. */
const SEATED_HIP = { 'sit-desk': 43, 'sit-table': 44, 'sit-rest': 46 }

// El motor retiene al agente 2,6 s en `walking`: caminar más o menos que eso hace
// que el estado del panel y el dibujo no coincidan. Entre pisos el viaje dura más,
// porque hay un ascensor de por medio; el panel ya dice a dónde va.
const PLATE_STEP = 25
const SPEECH_PADDING = 16
const WALK_SECONDS = 2.5
const MIN_SPEED = 170
const MAX_SPEED = 400
/** Entre pisos van apurados: el ascensor ya se comió parte del tiempo de la reunión. */
const HURRY_SPEED = 520
const CABIN_SPEED = 320
const ALARM_MS = 3600

const STATUS_DOT: Record<AgentStatus, number> = {
  idle: 0x9aa3b8,
  working: 0x35d29a,
  walking: 0x5cb6ff,
  meeting: 0xb79bff,
  waiting_approval: 0xffb02e,
  paused: 0xc8c4d6,
  offline: 0x6b6780,
}

const MOUTH: Record<AgentMood, string> = {
  neutral: 'mouth-smile',
  focused: 'mouth-flat',
  happy: 'mouth-happy',
  worried: 'mouth-flat',
  sad: 'mouth-sad',
}

const BROW: Record<AgentMood, { rotation: number; y: number }> = {
  neutral: { rotation: 0, y: -10 },
  focused: { rotation: 0.2, y: -8.8 },
  happy: { rotation: -0.08, y: -11.5 },
  worried: { rotation: -0.28, y: -10 },
  sad: { rotation: -0.34, y: -9 },
}

type Travel = 'still' | 'walking' | 'queued' | 'boarding' | 'riding'

/** Articulaciones del muñeco. La pose se escribe en un objetivo y se llega de a poco. */
interface Joints {
  turn: number
  hip: number
  lean: number
  thighNear: number
  shinNear: number
  thighFar: number
  shinFar: number
  /** Muslo visto de frente: sentado, apunta a quien mira y se acorta. */
  thighLength: number
  upperNear: number
  foreNear: number
  upperFar: number
  foreFar: number
  nod: number
}

const STANDING: Joints = {
  turn: 0,
  hip: RIG.hip,
  lean: 0,
  thighNear: 0,
  shinNear: 0,
  thighFar: 0,
  shinFar: 0,
  thighLength: 1,
  upperNear: -0.1,
  foreNear: -0.14,
  upperFar: 0.1,
  foreFar: 0.14,
  nod: 0,
}

interface Limb {
  root: Phaser.GameObjects.Container
  joint: Phaser.GameObjects.Container
  upper: Phaser.GameObjects.Image
  lower: Phaser.GameObjects.Image
}

function hexToNumber(hex: string) {
  return parseInt(hex.slice(1), 16)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

export class Character implements Rider {
  readonly id: string
  agent: Agent
  slot: Slot | null = null
  level = 0

  private host: CharacterHost
  private root: Phaser.GameObjects.Container
  private rig: Phaser.GameObjects.Container
  private body: Phaser.GameObjects.Container
  private chest: Phaser.GameObjects.Container
  private headGroup: Phaser.GameObjects.Container
  private face: Phaser.GameObjects.Container
  private zone: Phaser.GameObjects.Zone
  private hud: Phaser.GameObjects.Container

  private shadow: Phaser.GameObjects.Image
  private torso: Phaser.GameObjects.Image
  private hair: Phaser.GameObjects.Image
  private hairUnder: Phaser.GameObjects.Image | null
  private headset: Phaser.GameObjects.Image | null
  private earBack: Phaser.GameObjects.Image
  private earFar: Phaser.GameObjects.Image
  private eyeNear: Phaser.GameObjects.Image
  private eyeFar: Phaser.GameObjects.Image
  private browNear: Phaser.GameObjects.Image
  private browFar: Phaser.GameObjects.Image
  private mouth: Phaser.GameObjects.Image
  private held: Phaser.GameObjects.Image
  private armNear: Limb
  private armFar: Limb
  private legNear: Limb
  private legFar: Limb

  private namePlate: Phaser.GameObjects.Graphics
  private nameText: Phaser.GameObjects.Text
  private bar: Phaser.GameObjects.Graphics
  private balloon: Phaser.GameObjects.Container
  private balloonShape: Phaser.GameObjects.Graphics
  private balloonText: Phaser.GameObjects.Text
  private dots: Phaser.GameObjects.Graphics
  private speech: Phaser.GameObjects.Container
  private speechShape: Phaser.GameObjects.Graphics
  private speechText: Phaser.GameObjects.Text
  private chevron: Phaser.GameObjects.Graphics

  private joints: Joints = { ...STANDING }
  private goal: Joints = { ...STANDING }

  private travel: Travel = 'still'
  private route: Point[] = []
  private routeEnd: (() => void) | null = null
  private speed = 0
  private rideX = 0
  /** Slot en el que está parado o sentado ahora; `null` mientras va de un lado a otro. */
  private at: Slot | null = null
  private facing: Facing = 'front'
  private pose: Pose = 'stand'
  private gaze = 0
  private phase = Math.random() * 10
  private blinkAt = 0
  private blinkUntil = 0
  private nextBit = 0
  private nextTalk = 0
  private talkOpen = false
  private nextGlance = 0
  private glance = 0
  private sipUntil = 0
  private nextSip = 0
  private cheerUntil = 0
  private alarmUntil = 0
  private speechUntil = 0
  private progress: number | null = null
  private shownProgress = 0
  private drawnProgress = -1
  private drawnBalloon: string | null = null
  private selected = false
  private hovered = false
  private lastDetail: string | null = null
  private lastPlate = ''
  private visible = true
  private plateLevel = 0
  private shownLift = 0

  constructor(host: CharacterHost, agent: Agent) {
    this.host = host
    this.agent = agent
    this.id = agent.id

    const { world: scene, textureScale, fontFamily, textResolution } = host
    const S = 1 / textureScale
    const key = (name: string) => `${agent.id}-${name}`
    const part = (name: string, x: number, y: number, ox = 0.5, oy = 0.5) => scene.add.image(x, y, name).setOrigin(ox, oy).setScale(S)

    const limb = (upperKey: string, lowerKey: string, length: number, lowerOx = 0.5): Limb => {
      const upper = part(upperKey, 0, 0, 0.5, 0.04)
      const lower = part(lowerKey, 0, 0, lowerOx, 0.02)
      const joint = scene.add.container(0, length, [lower])
      return { root: scene.add.container(0, 0, [upper, joint]), joint, upper, lower }
    }

    this.shadow = part('shadow', 0, 0)
    this.legFar = limb(key('thigh'), key('shin'), RIG.thigh, 11 / 30)
    this.legNear = limb(key('thigh'), key('shin'), RIG.thigh, 11 / 30)
    this.armFar = limb(key('upper'), key('fore'), RIG.upper)
    this.armNear = limb(key('upper'), key('fore'), RIG.upper)
    this.armFar.root.setPosition(-RIG.shoulderX, -RIG.shoulder)
    this.armNear.root.setPosition(RIG.shoulderX, -RIG.shoulder)

    this.torso = part(key('body'), 0, 3, 0.5, 54 / 56)

    const headY = RIG.hip - RIG.headY
    this.hairUnder = scene.textures.exists(key('hair-under'))
      ? part(key('hair-under'), 0, headY, UNDER_BOX.cx / UNDER_BOX.w, UNDER_BOX.cy / UNDER_BOX.h)
      : null

    const headOrigin = (image: Phaser.GameObjects.Image) => image.setOrigin(HEAD_BOX.cx / HEAD_BOX.w, HEAD_BOX.cy / HEAD_BOX.h)
    const head = headOrigin(part(key('head'), 0, 0))
    this.hair = headOrigin(part(key('hair'), 0, 0))
    this.earBack = part(key('ear'), -19.5, 1)
    this.earFar = part(key('ear'), 19.5, 1)
    this.headset = agent.appearance.accessory === 'headset' ? part('headset', 0, -5) : null

    this.eyeFar = part('eye', 8.6, 1)
    this.eyeNear = part('eye', -8.6, 1)
    this.browFar = part('brow', 8.6, -10)
    this.browNear = part('brow', -8.6, -10).setFlipX(true)
    const blushL = part('blush', -13, 10)
    const blushR = part('blush', 13, 10)
    const nose = part('nose', 1, 8)
    this.mouth = part('mouth-smile', 0, 16)
    const glasses = agent.appearance.accessory === 'glasses' ? part('glasses', 0, 1) : null
    this.face = scene.add.container(0, 0, [
      blushL,
      blushR,
      this.eyeNear,
      this.eyeFar,
      this.browNear,
      this.browFar,
      nose,
      this.mouth,
      ...(glasses ? [glasses] : []),
    ])

    this.headGroup = scene.add.container(0, headY, [this.earBack, this.earFar, head, this.face, this.hair, ...(this.headset ? [this.headset] : [])])

    this.held = part('held-mug', 2, RIG.fore + 2).setVisible(false)
    this.armNear.joint.add(this.held)

    this.chest = scene.add.container(0, 0, [
      ...(this.hairUnder ? [this.hairUnder] : []),
      this.armFar.root,
      this.torso,
      this.headGroup,
      this.armNear.root,
    ])
    this.body = scene.add.container(0, -RIG.hip, [this.legFar.root, this.legNear.root, this.chest])
    this.rig = scene.add.container(0, 0, [this.body]).setScale(RIG_SCALE)
    this.root = scene.add.container(0, 0, [this.shadow, this.rig])

    this.zone = scene.add.zone(0, 0, 92, 142).setDepth(9400).setInteractive({ useHandCursor: true })
    this.zone.on('pointerover', () => this.setHovered(true))
    this.zone.on('pointerout', () => this.setHovered(false))
    this.zone.on('pointerup', () => {
      if (!host.isDrag()) {
        host.onAgentClick(this.id)
        this.poke()
      }
    })

    const textStyle = { fontFamily, fontSize: '12px', fontStyle: '600', color: '#FFFFFF' }
    this.namePlate = scene.add.graphics()
    this.nameText = scene.add.text(0, 0, agent.name, textStyle).setOrigin(0.5, 0.5).setResolution(textResolution)
    this.bar = scene.add.graphics()

    this.balloonShape = scene.add.graphics()
    this.balloonText = scene.add
      .text(0, -1, '', { fontFamily, fontSize: '20px', fontStyle: '700', color: '#25313B' })
      .setOrigin(0.5)
      .setResolution(textResolution)
    this.dots = scene.add.graphics()
    this.balloon = scene.add.container(0, 0, [this.balloonShape, this.balloonText, this.dots]).setVisible(false)

    this.speechShape = scene.add.graphics()
    this.speechText = scene.add
      .text(0, 0, '', {
        fontFamily,
        fontSize: '12px',
        fontStyle: '500',
        color: '#25313B',
        align: 'center',
        wordWrap: { width: 160 },
      })
      .setOrigin(0.5)
      .setResolution(textResolution)
    this.speech = scene.add.container(0, 0, [this.speechShape, this.speechText]).setVisible(false)

    this.chevron = scene.add.graphics().setVisible(false)
    this.chevron.fillStyle(hexToNumber(agent.appearance.accent), 1)
    this.chevron.lineStyle(2, 0xfbf9f4, 1)
    this.chevron.fillTriangle(-9, -8, 9, -8, 0, 4)
    this.chevron.strokeTriangle(-9, -8, 9, -8, 0, 4)

    this.hud = scene.add
      .container(0, 0, [this.bar, this.namePlate, this.nameText, this.balloon, this.speech, this.chevron])
      .setDepth(9500)
  }

  get position(): Point {
    return { x: this.root.x, y: this.root.y }
  }

  /** Punta de la cabeza: de ahí salen los efectos. */
  get top(): Point {
    return { x: this.root.x, y: this.root.y - HEAD_TOP }
  }

  get isWalking() {
    return this.travel !== 'still'
  }

  destroy() {
    this.root.destroy()
    this.zone.destroy()
    this.hud.destroy()
  }

  update(agent: Agent, progress: number | null) {
    const statusChanged = agent.status !== this.agent.status
    this.agent = agent
    this.progress = progress

    const detail = agent.statusDetail
    if (detail && detail !== this.lastDetail && this.shouldSay(agent.status) && this.host.claimSpeech(detail)) this.say(detail)
    this.lastDetail = detail

    if (statusChanged && agent.status === 'idle' && agent.mood === 'happy') this.cheer()
    this.setVisible(agent.status !== 'offline')
    this.applyMood()
    this.drawPlate(true)
  }

  private shouldSay(status: AgentStatus) {
    return status === 'working' || status === 'meeting' || status === 'waiting_approval' || status === 'idle'
  }

  private setVisible(visible: boolean) {
    if (visible === this.visible) return
    this.visible = visible
    this.root.setVisible(visible)
    this.hud.setVisible(visible)
    this.zone.setVisible(visible)
    if (visible) this.zone.setInteractive()
    else this.zone.disableInteractive()
  }

  setSelected(selected: boolean) {
    this.selected = selected
    this.chevron.setVisible(selected)
    this.drawPlate(true)
  }

  private setHovered(hovered: boolean) {
    this.hovered = hovered
    this.drawPlate(true)
  }

  /** `-1` mira hacia atrás: alguien se le acercó a hablar. */
  setGaze(gaze: number) {
    this.gaze = gaze
  }

  // ---- Traslados ----

  /** Llega sin caminar: al abrir la página los agentes ya están en su lugar. */
  place(slot: Slot) {
    this.slot = slot
    this.level = slot.level
    this.route = []
    this.routeEnd = null
    this.root.setPosition(slot.x, slot.y)
    this.settle()
  }

  goTo(slot: Slot) {
    if (this.slot === slot) return
    this.slot = slot
    // Con movimiento reducido no hay recorrido: aparece en su lugar.
    if (this.host.calm) {
      this.host.lift.cancel(this)
      this.travel = 'still'
      this.place(slot)
      return
    }
    // Dentro de la cabina sólo puede cambiar de piso: al bajar sigue hacia el destino nuevo.
    if (this.travel === 'boarding' || this.travel === 'riding') {
      this.host.lift.retarget(this, slot.level)
      return
    }
    this.host.lift.cancel(this)
    this.plan()
  }

  private plan(hurry = false) {
    const slot = this.slot
    if (!slot) return
    const exit = this.exitPoints()
    this.at = null
    this.pose = 'stand'
    this.squash()

    if (slot.level === this.level) {
      const points = [...exit, ...(slot.via ?? []), { x: slot.x, y: slot.y }]
      const speed = hurry ? HURRY_SPEED : Phaser.Math.Clamp(this.lengthOf(points) / WALK_SECONDS, MIN_SPEED, MAX_SPEED)
      this.follow(points, speed, 'walking', () => this.settle())
      return
    }

    this.host.lift.call(this, this.level, slot.level)
    this.follow([...exit, { x: ELEVATOR.wait, y: walkY(this.level) }], HURRY_SPEED, 'walking', () => {
      this.travel = 'queued'
      this.host.lift.arrive(this)
    })
  }

  private exitPoints() {
    if (this.at?.via) return [...this.at.via].reverse()
    const walkway = walkY(this.level)
    return Math.abs(this.root.y - walkway) > 2 ? [{ x: this.root.x, y: walkway }] : []
  }

  private lengthOf(points: Point[]) {
    let length = 0
    let cursor = this.position
    for (const point of points) {
      length += Math.hypot(point.x - cursor.x, point.y - cursor.y)
      cursor = point
    }
    return length
  }

  private follow(points: Point[], speed: number, travel: Travel, done: () => void) {
    this.travel = travel
    this.route = points
    this.speed = speed
    this.routeEnd = done
  }

  board(x: number, y: number) {
    return new Promise<void>(resolve => {
      this.rideX = x
      this.follow([{ x, y }], CABIN_SPEED, 'boarding', () => {
        this.travel = 'riding'
        this.facing = 'front'
        resolve()
      })
    })
  }

  alight(level: number) {
    this.level = level
    this.follow([{ x: ELEVATOR.wait, y: walkY(level) }], CABIN_SPEED, 'walking', () => this.plan(true))
  }

  private settle() {
    const slot = this.slot
    if (!slot) return
    this.travel = 'still'
    this.at = slot
    this.facing = slot.facing
    this.pose = slot.pose
    this.squash()
  }

  /** Pequeño aplastamiento al arrancar y al llegar: el gesto que le da peso al muñeco. */
  private squash() {
    if (this.host.calm) return
    this.host.world.tweens.add({ targets: this.rig, scaleY: RIG_SCALE * 0.94, duration: 80, yoyo: true, ease: 'Sine.easeOut' })
  }

  private advance(dt: number) {
    if (this.travel === 'riding') {
      this.root.setPosition(this.rideX, this.host.lift.cabinY - 1)
      return false
    }
    if (this.route.length === 0) return false
    let budget = this.speed * dt
    while (budget > 0 && this.route.length > 0) {
      const target = this.route[0]
      const dx = target.x - this.root.x
      const dy = target.y - this.root.y
      const distance = Math.hypot(dx, dy)
      if (distance <= budget) {
        this.root.setPosition(target.x, target.y)
        budget -= distance
        this.route.shift()
      } else {
        this.root.x += (dx / distance) * budget
        this.root.y += (dy / distance) * budget
        budget = 0
        if (Math.abs(dx) > 1.5) this.facing = dx > 0 ? 'right' : 'left'
      }
    }
    if (this.route.length === 0) {
      const done = this.routeEnd
      this.routeEnd = null
      done?.()
      return false
    }
    return true
  }

  // ---- Cara y globos ----

  private applyMood() {
    const mood = this.agent.mood
    const brow = BROW[mood]
    this.browNear.setRotation(-brow.rotation).setY(brow.y)
    this.browFar.setRotation(brow.rotation).setY(brow.y)
    if (!this.isTalking) this.mouth.setTexture(MOUTH[mood])
  }

  private get isTalking() {
    return this.agent.status === 'meeting' && !this.isWalking
  }

  say(text: string, ms = 3400) {
    const clean = shorten(text, 64)
    this.speechText.setText(clean)
    const w = Math.max(44, this.speechText.width + 24)
    const h = this.speechText.height + SPEECH_PADDING
    const g = this.speechShape.clear()
    g.fillStyle(0xfbf9f4, 1)
    g.lineStyle(1.5, 0x25313b, 0.85)
    g.fillRoundedRect(-w / 2, -h, w, h, 12)
    g.strokeRoundedRect(-w / 2, -h, w, h, 12)
    g.fillTriangle(-7, -1, 7, -1, 0, 9)
    g.lineBetween(-7, 0, 0, 9)
    g.lineBetween(7, 0, 0, 9)
    g.fillStyle(0xfbf9f4, 1).fillRect(-6, -3, 12, 3)
    this.speechText.setPosition(0, -h / 2)
    this.speech.setVisible(true).setAlpha(0).setScale(0.8)
    this.host.world.tweens.add({ targets: this.speech, alpha: 1, scale: 1, duration: 170, ease: 'Back.easeOut' })
    this.speechUntil = this.host.world.time.now + ms
  }

  cheer(ms = 3200) {
    this.cheerUntil = this.host.world.time.now + ms
  }

  /** Señal de error: dura un rato y se va sola, el detalle queda en el panel. */
  alarm(ms = ALARM_MS) {
    this.alarmUntil = this.host.world.time.now + ms
  }

  /** Reacción al clic: confirma al toque que el agente te oyó. */
  private poke() {
    if (this.host.calm) return
    this.host.world.tweens.add({ targets: this.rig, y: -10, duration: 130, yoyo: true, ease: 'Quad.easeOut' })
  }

  get plateWidth() {
    return this.nameText.width + 42
  }

  setPlateLevel(level: number) {
    this.plateLevel = level
  }

  private drawPlate(force = false) {
    const signature = `${this.agent.status}:${this.selected}:${this.hovered}:${Math.round(this.agent.activity * 3)}`
    if (!force && signature === this.lastPlate) return
    this.lastPlate = signature

    const w = this.plateWidth
    const h = 22
    const left = -w / 2
    const g = this.namePlate.clear()
    const fill = this.selected ? hexToNumber(this.agent.appearance.accent) : 0x25313b
    g.fillStyle(fill, this.selected || this.hovered ? 1 : 0.9)
    g.fillRoundedRect(left, -h / 2, w, h, h / 2)
    if (this.hovered && !this.selected) {
      g.lineStyle(1.5, 0xffffff, 0.8)
      g.strokeRoundedRect(left, -h / 2, w, h, h / 2)
    }

    g.fillStyle(STATUS_DOT[this.agent.status], 1)
    g.fillCircle(left + 12, 0, 4.5)

    // Nivel de actividad: tres barritas, como una señal.
    const level = Math.ceil(this.agent.activity * 3)
    for (let i = 0; i < 3; i++) {
      const height = 4 + i * 2.5
      g.fillStyle(0xffffff, i < level ? 0.95 : 0.28)
      g.fillRoundedRect(w / 2 - 19 + i * 4.5, 5 - height, 3, height, 1)
    }
    this.nameText.setPosition((left + 20 + (w / 2 - 22)) / 2, 0)
  }

  private drawBar() {
    // Sólo se redibuja si cambió algo que se pueda ver.
    const value = this.progress === null ? -1 : Math.round(this.shownProgress * 74)
    if (value === this.drawnProgress) return
    this.drawnProgress = value
    const g = this.bar.clear()
    if (this.progress === null) return
    const w = 74
    const h = 7
    g.fillStyle(0x25313b, 0.92)
    g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, (h + 4) / 2)
    g.fillStyle(0xffffff, 0.2)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2)
    const fill = Math.max(h, w * this.shownProgress)
    g.fillStyle(hexToNumber(this.agent.appearance.accent), 1)
    g.fillRoundedRect(-w / 2, -h / 2, fill, h, h / 2)
    g.fillStyle(0xffffff, 0.35)
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 1, fill - 2, 2, 1)
  }

  private balloonKind(time: number): 'alert' | 'question' | 'pause' | 'error' | null {
    const { status, mood } = this.agent
    if (time < this.alarmUntil) return 'error'
    if (status === 'waiting_approval') return 'alert'
    if (status === 'paused') return 'pause'
    if (status === 'working' && mood === 'worried') return 'question'
    return null
  }

  private drawBalloon(time: number) {
    const kind = this.balloonKind(time)
    if (kind !== this.drawnBalloon) {
      this.drawnBalloon = kind
      this.balloon.setVisible(kind !== null)
      if (kind) this.paintBalloon(kind)
    }
    const pulse = (kind === 'alert' || kind === 'error') && !this.host.calm
    this.balloon.setScale(pulse ? 1 + Math.sin(time / 180) * 0.09 : 1)
  }

  private paintBalloon(kind: 'alert' | 'question' | 'pause' | 'error') {
    const fills = { alert: 0xf5b13d, question: 0xf4d68b, pause: 0xdfe3e8, error: 0xf0705f }
    const g = this.balloonShape.clear()
    g.fillStyle(fills[kind], 1)
    g.lineStyle(1.5, 0x25313b, 0.85)
    if (kind === 'error') {
      // Triángulo y no círculo: la forma avisa aunque no se distinga el color.
      g.fillRoundedRect(-17, -16, 34, 32, 8)
      g.strokeRoundedRect(-17, -16, 34, 32, 8)
    } else {
      g.fillCircle(0, 0, 16)
      g.strokeCircle(0, 0, 16)
      g.fillTriangle(-6, 13, 6, 13, 0, 23)
      g.lineBetween(-6, 14, 0, 23)
      g.lineBetween(6, 14, 0, 23)
      g.fillStyle(fills[kind], 1).fillRect(-5, 11, 10, 4)
    }

    const dots = this.dots.clear()
    if (kind === 'pause') {
      this.balloonText.setText('')
      dots.fillStyle(0x25313b, 1)
      dots.fillRoundedRect(-7, -8, 5, 16, 2)
      dots.fillRoundedRect(2, -8, 5, 16, 2)
    } else {
      this.balloonText.setText(kind === 'question' ? '?' : '!')
    }
  }

  // ---- Cuadro a cuadro ----

  tick(time: number, delta: number) {
    if (!this.visible) return
    const dt = Math.min(delta, 60) / 1000
    const moving = this.advance(dt)

    this.choosePose(time, dt, moving)
    this.applyJoints(dt, moving)
    this.animateFace(time)
    this.syncHud(time, dt)

    const inCabin = this.travel === 'boarding' || this.travel === 'riding'
    this.root.setDepth(inCabin ? CABIN_DEPTH.rider : this.root.y)
    this.zone.setPosition(this.root.x, this.root.y - 62)
  }

  /** Escribe en `goal` la pose de este instante. `amp` en 0 la deja quieta. */
  private choosePose(time: number, dt: number, moving: boolean) {
    const g = this.goal
    Object.assign(g, STANDING)
    const amp = this.host.calm ? 0 : 1
    const breath = Math.sin(time / 760 + this.phase) * amp
    const inProfile = this.facing !== 'front'
    const { status, activity, mood } = this.agent

    g.turn = inProfile ? 1 : 0
    g.hip = RIG.hip + breath * 0.5
    this.rig.setScale(RIG_SCALE * (this.facing === 'left' ? -1 : 1), this.rig.scaleY)
    this.shadow.setVisible(true)

    if (moving) {
      this.phase += dt * (this.speed / 17)
      const s = Math.sin(this.phase)
      const c = Math.cos(this.phase)
      g.turn = 1
      g.thighNear = -s * 0.62
      g.thighFar = s * 0.62
      g.shinNear = 0.18 + Math.max(0, c) * 0.85
      g.shinFar = 0.18 + Math.max(0, -c) * 0.85
      g.upperNear = s * 0.5
      g.upperFar = -s * 0.5
      g.foreNear = -0.45
      g.foreFar = -0.45
      g.hip = RIG.hip - 1 + Math.abs(c) * 2.4
      g.lean = 0.035
      return
    }

    if (inProfile) {
      g.upperNear = 0.02
      g.foreNear = -0.24
      g.upperFar = 0
      g.foreFar = -0.24
    }

    // Frente al ascensor o adentro espera tranquilo: el gesto es para cuando llegue.
    if (this.travel !== 'still') return

    const cheering = time < this.cheerUntil
    const failing = time < this.alarmUntil

    if (this.pose === 'sit-desk') this.poseAtDesk(time, status, activity, mood, amp)
    else if (this.pose === 'sit-table' || this.pose === 'sit-rest') this.poseSeatedFront(time, status, amp)
    else if (cheering) {
      const hop = Math.abs(Math.sin(time / 150))
      g.hip = RIG.hip + hop * 11 * amp
      g.upperNear = -2.7 + Math.sin(time / 90) * 0.2 * amp
      g.upperFar = 2.7 - Math.sin(time / 90) * 0.2 * amp
      g.foreNear = -0.25
      g.foreFar = 0.25
      this.mouth.setTexture('mouth-happy')
    } else if (status === 'meeting') {
      this.poseTalking(time, amp)
    } else if (status === 'waiting_approval') {
      // Levanta la mano y saluda: te está llamando.
      g.hip += Math.max(0, Math.sin(time / 260)) * 2.4 * amp
      g.upperNear = -2.75
      g.foreNear = -0.32 + Math.sin(time / 130) * 0.32 * amp
      g.nod = Math.sin(time / 520) * 0.05 * amp
    } else if (status === 'idle') {
      g.nod = Math.sin(time / 1700 + this.phase) * 0.05 * amp
    }

    if (this.pose === 'sit-desk' || this.pose === 'stand') this.held.setVisible(false)
    if (status === 'paused') g.nod = 0.12
    if (failing) {
      g.nod = 0.24
      g.lean += inProfile ? 0.08 : 0
    }
  }

  private poseAtDesk(time: number, status: AgentStatus, activity: number, mood: AgentMood, amp: number) {
    const g = this.goal
    g.turn = 1
    g.hip = SEATED_HIP['sit-desk']
    g.lean = 0.05 + Math.sin(time / 760 + this.phase) * 0.006 * amp
    g.thighNear = -1.52
    g.shinNear = 1.5
    g.thighFar = -1.46
    g.shinFar = 1.38
    this.shadow.setVisible(false)

    const typing = status === 'working'
    // Sin foco está dándole vueltas a algo: mano al mentón, la mirada arriba.
    const thinking = typing && mood !== 'focused'

    if (thinking) {
      g.upperNear = -0.75
      g.foreNear = -2.24 + Math.sin(time / 900 + this.phase) * 0.05 * amp
      g.upperFar = -0.58
      g.foreFar = -1.0
      g.nod = -0.1 + Math.sin(time / 1300) * 0.03 * amp
    } else if (typing) {
      const speed = 0.016 + activity * 0.02
      const reach = (0.08 + activity * 0.14) * amp
      g.upperNear = -0.55 + Math.sin(time * speed * 0.4) * 0.03 * amp
      g.foreNear = -1.02 + Math.sin(time * speed) * reach
      g.upperFar = -0.62
      g.foreFar = -0.96 + Math.sin(time * speed * 1.3 + 2) * reach
      g.nod = 0.05 + Math.sin(time * speed * 0.3) * 0.02 * amp
      if (time > this.nextBit && amp > 0) {
        this.nextBit = time + 900 - activity * 620 + Math.random() * 260
        const kind = bitOf(this.agent.deskId)
        const { x, y } = this.top
        this.host.emitBit(x + 62 + Math.random() * 30, y + 22, kind, hexToNumber(this.agent.appearance.accent))
      }
    } else if (status === 'waiting_approval') {
      g.upperNear = -2.75
      g.foreNear = -0.3 + Math.sin(time / 130) * 0.3 * amp
      g.upperFar = -0.5
      g.foreFar = -1.05
    } else {
      g.upperNear = -0.3
      g.foreNear = -1.2
      g.upperFar = -0.36
      g.foreFar = -1.16
      g.nod = Math.sin(time / 1400) * 0.03 * amp
    }

    if (time < this.cheerUntil) {
      g.upperNear = -2.75
      g.foreNear = -0.2
      this.mouth.setTexture('mouth-happy')
    }
  }

  private poseSeatedFront(time: number, status: AgentStatus, amp: number) {
    const g = this.goal
    g.turn = 0
    g.hip = SEATED_HIP[this.pose as 'sit-table' | 'sit-rest']
    g.thighLength = 0.38
    g.thighNear = -0.04
    g.thighFar = 0.04
    this.shadow.setVisible(false)

    if (status === 'meeting') {
      this.poseTalking(time, amp)
      return
    }

    if (status === 'waiting_approval') {
      g.upperNear = -2.75
      g.foreNear = -0.3 + Math.sin(time / 130) * 0.3 * amp
      return
    }

    // La mano cercana queda sobre la falda y la otra, en el apoyabrazos.
    g.upperNear = -0.12
    g.foreNear = 1.35
    g.upperFar = 0.14
    g.foreFar = 0.2
    g.nod = Math.sin(time / 1700 + this.phase) * 0.05 * amp

    if (this.pose !== 'sit-rest' || status !== 'idle') {
      this.held.setVisible(false)
      return
    }

    // Disponible: toma algo y mira alrededor, sin apuro.
    if (this.nextSip === 0) this.nextSip = time + 2000 + Math.random() * 5000
    if (time > this.nextSip) {
      this.sipUntil = time + 1500
      this.nextSip = time + 7000 + Math.random() * 6000
    }
    this.held.setVisible(true)
    if (time < this.sipUntil && amp > 0) {
      g.upperNear = 0.15
      g.foreNear = 2.7
    }
  }

  private poseTalking(time: number, amp: number) {
    const g = this.goal
    if (amp > 0 && time > this.nextTalk) {
      this.talkOpen = !this.talkOpen
      this.nextTalk = time + 110 + Math.random() * 190
      this.mouth.setTexture(this.talkOpen ? 'mouth-open' : 'mouth-smile')
    }
    g.nod = Math.sin(time / 300 + this.phase) * 0.06 * amp
    const inProfile = this.facing !== 'front'
    if (inProfile) {
      // De costado apunta con la mano hacia quien tiene enfrente.
      g.upperNear = -0.7 + Math.sin(time / 260 + this.phase) * 0.22 * amp
      g.foreNear = -0.75 + Math.sin(time / 200) * 0.25 * amp
      g.upperFar = 0
      g.foreFar = -0.3
    } else {
      g.upperNear = -0.5 + Math.sin(time / 240 + this.phase) * 0.28 * amp
      g.foreNear = -1.2 + Math.sin(time / 190) * 0.3 * amp
      g.upperFar = 0.3 - Math.sin(time / 280 + this.phase) * 0.2 * amp
      g.foreFar = 1.0
    }
  }

  /** Acerca las articulaciones a la pose: por eso ningún cambio de pose es un salto. */
  private applyJoints(dt: number, moving: boolean) {
    const j = this.joints
    const g = this.goal
    const blend = this.host.calm ? 1 : 1 - Math.exp(-dt * (moving ? 34 : 11))
    for (const key of Object.keys(j) as (keyof Joints)[]) j[key] += (g[key] - j[key]) * blend

    const S = 1 / this.host.textureScale
    const t = j.turn

    this.body.setY(-j.hip)
    this.chest.setRotation(j.lean)
    this.headGroup.setRotation(j.nod - j.lean)

    this.legNear.root.setPosition(lerp(RIG.hipX, 1, t), 0).setRotation(j.thighNear)
    this.legFar.root.setPosition(lerp(-RIG.hipX, -1, t), 0).setRotation(j.thighFar)
    this.legNear.upper.setScale(S, S * j.thighLength)
    this.legFar.upper.setScale(S, S * j.thighLength)
    this.legNear.joint.setPosition(0, RIG.thigh * j.thighLength).setRotation(j.shinNear)
    this.legFar.joint.setPosition(0, RIG.thigh * j.thighLength).setRotation(j.shinFar)
    this.legFar.lower.setFlipX(t < 0.5)

    this.armNear.root.setX(lerp(RIG.shoulderX, 2, t)).setRotation(j.upperNear)
    this.armFar.root.setX(lerp(-RIG.shoulderX, 4, t)).setRotation(j.upperFar)
    this.armNear.joint.setRotation(j.foreNear)
    this.armFar.joint.setRotation(j.foreFar)
    this.held.setRotation(-(j.upperNear + j.foreNear))

    // Giro de cabeza por capas: la cara corre hacia un lado y el pelo hacia el otro.
    const look = this.gaze < 0 ? -1 : 1
    this.torso.setScale(S * lerp(1, 0.84, t), S)
    this.face.setX(t * 5.6 * look + (t < 0.5 ? this.glance : 0))
    this.hair.setX(-t * 1.5 * look)
    this.hairUnder?.setX(-t * 3)
    this.headset?.setX(-t * 2.5)
    this.earBack.setX(lerp(-19.5, -13.5, t)).setVisible(look > 0 || t < 0.5)
    this.earFar.setVisible(t < 0.5 || look < 0)
  }

  private animateFace(time: number) {
    const S = 1 / this.host.textureScale
    if (time > this.blinkAt) {
      this.blinkUntil = time + 120
      this.blinkAt = time + 1800 + Math.random() * 3200
    }
    if (time > this.nextGlance) {
      this.nextGlance = time + 2400 + Math.random() * 3000
      this.glance = this.agent.status === 'idle' && !this.host.calm ? (Math.random() - 0.5) * 5 : 0
    }
    const paused = this.agent.status === 'paused'
    const open = time < this.blinkUntil ? 0.12 : paused ? 0.45 : 1
    this.eyeNear.setScale(S, S * open)
    this.eyeFar.setScale(S * lerp(1, 0.82, this.joints.turn), S * open)
  }

  private syncHud(time: number, dt: number) {
    const ui = this.host.ui()
    const { x, y } = this.root
    this.shownLift += (this.plateLevel * PLATE_STEP - this.shownLift) * Math.min(1, dt * 10)
    this.hud.setPosition(x, y - HEAD_TOP - (12 + this.shownLift) * ui).setScale(ui)

    this.shownProgress += ((this.progress ?? 0) - this.shownProgress) * Math.min(1, dt * 6)
    this.drawBar()
    this.drawPlate()
    this.drawBalloon(time)

    let stack = -26
    if (this.progress !== null) {
      this.bar.setPosition(0, stack + 6)
      stack -= 12
    }
    if (this.balloon.visible) {
      this.balloon.setPosition(0, stack - 8)
      stack -= 44
    }
    if (this.speech.visible) {
      const bubbleTop = this.hud.y + (stack - this.speechText.height - SPEECH_PADDING) * ui
      const overflow = Math.max(0, (this.host.viewTop() + 6 - bubbleTop) / ui)
      this.speech.setPosition(0, stack + overflow)
      if (time > this.speechUntil) this.speech.setVisible(false)
      else stack -= this.speechText.height + 30
    }
    this.chevron.setPosition(0, stack + 2 + (this.host.calm ? 0 : Math.sin(time / 170) * 3))
  }
}
