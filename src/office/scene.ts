import * as Phaser from 'phaser'
import { OFFICE } from '@/config'
import { isClosed } from '@/domain/selectors'
import type { Agent, OfficeEvent, OfficeSnapshot } from '@/domain/types'
import { buildingArt, cloudArt, elevatorArts, nightGlowArt, skyArt } from './art/building'
import { spriteArts } from './art/furniture'
import { agentArts, fxArts, sharedPersonArts } from './art/people'
import { rasterize, type Art } from './art/svg'
import { Character, type BitKind, type CharacterHost } from './character'
import { Elevator } from './elevator'
import {
  ACTIVITY_METER,
  backY,
  BEACON,
  BOARD_TEXT,
  CAT,
  ceilingY,
  CLOCK,
  DESKS,
  FLOORS,
  FOREGROUND,
  HOTSPOTS,
  PROPS,
  RACK,
  ROOF_SIGN,
  SLOTS,
  STATUS_SCREEN,
  STEAM,
  TASK_SCREEN,
  WORLD,
  type Desk,
  type Point,
  type Slot,
} from './layout'

export interface OfficeCallbacks {
  onAgentClick(id: string): void
  onHotspot(id: 'review' | 'board'): void
  onReady(): void
}

export interface SceneOptions extends OfficeCallbacks {
  textureScale: number
  textResolution: number
  fontFamily: string
  calm: boolean
}

const DEPTH = {
  sky: -30,
  clouds: -25,
  building: -20,
  wall: -15,
  wallText: -14,
  night: 9000,
  lights: 9010,
  fx: 9600,
}

/** Con alguien caminando va a 60; quieta, la oficina no necesita más de 30. */
export const BUSY_FPS = 70
const QUIET_FPS = 40

const SCREEN_FRAME_MS: [number, number] = [260, 900]
const PLATE_GAP = 3
const SPEECH_REPEAT_MS = 2500
/** Cuánto pueden separarse dos agentes en alto para que sus carteles sigan chocando. */
const PLATE_ROW = 34
/** Azul de la noche. Más oscuro que esto y dejan de leerse los personajes. */
const NIGHT_TINT = 0x8388c4
const METER_BARS = 5

const SCREEN_ART: Record<Desk['kind'], string> = {
  lead: 'lead',
  research: 'research',
  dev: 'dev',
  marketing: 'marketing',
}

/** Slot para `handoff:<id>`: parado al lado del escritorio de otro, mirándolo. */
const handoffSlots = new Map<string, Slot>(
  DESKS.map(desk => [desk.id, { ...desk.handoff, level: desk.level, pose: 'stand', facing: 'right' }]),
)

export class OfficeScene extends Phaser.Scene implements CharacterHost {
  textureScale: number
  textResolution: number
  fontFamily: string
  calm: boolean

  private callbacks: OfficeCallbacks
  private elevator!: Elevator
  private characters = new Map<string, Character>()
  private seenEvents = new Set<string>()
  private lastMode: string | null = null
  private selected: string | null = null
  private pending: OfficeSnapshot | null = null
  private ready = false
  private uiScale = 1
  private dragging = false
  private lastSpeech = { text: '', at: 0 }

  private dark = false
  private night!: Phaser.GameObjects.Rectangle
  private nightGlow!: Phaser.GameObjects.Image
  private skyNight!: Phaser.GameObjects.Image
  private clouds: Phaser.GameObjects.Image[] = []
  private screens = new Map<string, Phaser.GameObjects.Image[]>()
  private meter: Phaser.GameObjects.Rectangle[] = []
  private shownMeter = -1
  private pace = BUSY_FPS
  private nextScreenFrame = 0
  private screenFrame = 0
  private boardTitle!: Phaser.GameObjects.Text
  private taskLines!: Phaser.GameObjects.Text
  private statusLines!: Phaser.GameObjects.Text
  private clockHands!: Phaser.GameObjects.Graphics
  private nextClock = 0
  private rackLeds: { led: Phaser.GameObjects.Rectangle; next: number }[] = []
  private reviewPapers: Phaser.GameObjects.Image[] = []
  private beaconOn!: Phaser.GameObjects.Image
  private beaconGlow!: Phaser.GameObjects.Image
  private deskSigns = new Map<string, Phaser.GameObjects.Container>()
  private nextSteam = 0
  private bits: Partial<Record<BitKind, Phaser.GameObjects.Particles.ParticleEmitter>> = {}
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter

  constructor(options: SceneOptions) {
    super({ key: 'office' })
    this.callbacks = options
    this.textureScale = options.textureScale
    this.textResolution = options.textResolution
    this.fontFamily = options.fontFamily
    this.calm = options.calm
  }

  get world() {
    return this
  }

  get lift() {
    return this.elevator
  }

  ui() {
    return this.uiScale
  }

  viewTop() {
    return this.cameras.main.worldView.y
  }

  claimSpeech(text: string) {
    const now = this.time.now
    if (text === this.lastSpeech.text && now - this.lastSpeech.at < SPEECH_REPEAT_MS) return false
    this.lastSpeech = { text, at: now }
    return true
  }

  setUiScale(value: number) {
    this.uiScale = value
  }

  setDragging(value: boolean) {
    this.dragging = value
  }

  isDrag() {
    return this.dragging
  }

  onAgentClick(id: string) {
    this.callbacks.onAgentClick(id)
  }

  async create() {
    await this.loadTextures([
      buildingArt(),
      ...elevatorArts(),
      nightGlowArt(),
      skyArt(false),
      skyArt(true),
      cloudArt(),
      ...spriteArts(),
      ...sharedPersonArts(),
      ...fxArts(),
    ])
    this.buildWorld()
    this.ready = true
    this.callbacks.onReady()
    if (this.pending) {
      const snapshot = this.pending
      this.pending = null
      await this.applySnapshot(snapshot)
    }
  }

  private async loadTextures(arts: Art[]) {
    const missing = arts.filter(art => !this.textures.exists(art.key))
    const images = await Promise.all(missing.map(art => rasterize(art, this.textureScale)))
    missing.forEach((art, index) => {
      if (!this.textures.exists(art.key)) this.textures.addImage(art.key, images[index])
    })
  }

  private art(x: number, y: number, key: string, originX = 0.5, originY = 1) {
    return this.add.image(x, y, key).setOrigin(originX, originY).setScale(1 / this.textureScale)
  }

  private buildWorld() {
    this.buildSky()
    this.art(0, 0, 'building', 0, 0).setDepth(DEPTH.building)
    this.elevator = new Elevator(this, this.textureScale, this.fontFamily, this.textResolution)
    this.buildProps()
    this.buildDesks()
    this.buildForeground()
    this.buildReviewDesk()
    this.buildLabels()
    this.buildBoard()
    this.buildAmbientLife()
    this.buildNight()
    this.buildEffects()
    this.buildHotspots()
    this.setDark(this.dark, true)
  }

  private buildSky() {
    this.art(0, 0, 'sky-day', 0, 0).setDisplaySize(WORLD.width, WORLD.height).setDepth(DEPTH.sky)
    this.skyNight = this.art(0, 0, 'sky-night', 0, 0).setDisplaySize(WORLD.width, WORLD.height).setDepth(DEPTH.sky + 1).setAlpha(0)

    // Las nubes pasan por detrás del edificio: se las ve en el cielo y por las ventanas.
    for (let i = 0; i < 6; i++) {
      const cloud = this.art(120 + i * 260, 22 + (i % 3) * 96, 'cloud', 0.5, 0.5)
        .setDepth(DEPTH.clouds)
        .setAlpha(0.92)
        .setScale((1 / this.textureScale) * (0.7 + (i % 3) * 0.2))
      this.clouds.push(cloud)
    }
  }

  private buildProps() {
    for (const prop of PROPS) {
      const image = this.art(prop.x, backY(prop.level) + 8, prop.key).setDepth(DEPTH.wall)
      // Las plantas se mecen apenas: son lo que más vida le da a un plano quieto.
      if (!this.calm) {
        this.tweens.add({
          targets: image,
          angle: { from: -0.8, to: 0.8 },
          duration: 3000 + (prop.x % 900),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
      }
    }

    // La gata duerme en el banco: se dibuja encima y respira.
    const cat = this.art(CAT.x, CAT.y, 'cat').setDepth(DEPTH.wall)
    if (!this.calm) {
      this.tweens.add({
        targets: cat,
        scaleY: (1 / this.textureScale) * 1.05,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
  }

  private buildDesks() {
    for (const desk of DESKS) {
      const screens = desk.screens.map(point => this.art(point.x, point.y, 'screen-off', 0, 0).setDepth(DEPTH.wall))
      this.screens.set(desk.id, screens)
    }
  }

  /** Mesa y mostrador tapan a quien se sienta o se para detrás: ahí está la profundidad. */
  private buildForeground() {
    for (const item of FOREGROUND) this.art(item.x, item.y, item.key).setDepth(item.y)
  }

  private addDeskSign(desk: Desk, text: string) {
    const sign = this.art(0, 0, 'sign-free', 0.5, 1)
    const label = this.add
      .text(0, -18, text, { fontFamily: this.fontFamily, fontSize: '13px', fontStyle: '600', color: '#25313B' })
      .setOrigin(0.5)
      .setResolution(this.textResolution)
    const container = this.add.container(desk.seat.x, desk.seat.y - 66, [sign, label]).setDepth(desk.seat.y)
    this.deskSigns.set(desk.id, container)
  }

  private buildReviewDesk() {
    const top = FOREGROUND[1].y - 78 + 8
    for (let i = 0; i < 4; i++) {
      this.reviewPapers.push(
        this.art(BEACON.x + 56 + i * 44, top, 'review-paper', 0.5, 0.5)
          .setDepth(FOREGROUND[1].y + 1)
          .setVisible(false),
      )
    }
    this.art(BEACON.x, BEACON.y, 'beacon').setDepth(FOREGROUND[1].y + 1)
    this.beaconOn = this.art(BEACON.x, BEACON.y, 'beacon-on').setDepth(FOREGROUND[1].y + 2).setVisible(false)
    this.beaconGlow = this.art(BEACON.x, BEACON.y - 18, 'light-pool', 0.5, 0.5)
      .setDepth(DEPTH.lights)
      .setTint(0xffb02e)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScale((1 / this.textureScale) * 1.1)
  }

  private buildLabels() {
    FLOORS.forEach((floor, level) => {
      for (const room of floor.rooms) {
        const text = this.add
          .text(room.from + 34, ceilingY(level) + 1, room.label, {
            fontFamily: this.fontFamily,
            fontSize: '11px',
            fontStyle: '600',
            color: '#25313B',
          })
          .setLetterSpacing(1.4)
          .setDepth(DEPTH.wallText)
          .setResolution(this.textResolution)
        const w = text.width + 20
        // Cartel que cuelga de la losa, con el color del piso.
        this.add
          .graphics()
          .fillStyle(parseInt(room.trim.slice(1), 16), 1)
          .fillRoundedRect(room.from + 24, ceilingY(level) - 2, w, 20, { tl: 0, tr: 0, bl: 7, br: 7 })
          .setDepth(DEPTH.wall)
        text.setPosition(room.from + 34, ceilingY(level) + 2)
      }
    })

    const sign = (x: number, y: number, text: string, size: string, color: string, spacing: number) =>
      this.add
        .text(x, y, text, { fontFamily: this.fontFamily, fontSize: size, fontStyle: '700', color })
        .setOrigin(0.5)
        .setLetterSpacing(spacing)
        .setDepth(DEPTH.wallText)
        .setResolution(this.textResolution)

    // El del techo va sobre la capa de noche: es un cartel luminoso y ahí no camina nadie.
    const name = OFFICE.name.toUpperCase()
    sign(ROOF_SIGN.x, ROOF_SIGN.y, name, '21px', '#F4D68B', 7).setDepth(DEPTH.lights + 1)
    sign(FOREGROUND[1].x, backY(0) - 118, name, name.length > 14 ? '22px' : '30px', '#FBF9F4', 6)
  }

  private buildBoard() {
    this.boardTitle = this.add
      .text(BOARD_TEXT.x, BOARD_TEXT.y, 'Sin consignas activas', {
        fontFamily: this.fontFamily,
        fontSize: '15px',
        fontStyle: '600',
        color: '#25313B',
        wordWrap: { width: BOARD_TEXT.width },
        lineSpacing: 2,
      })
      .setDepth(DEPTH.wallText)
      .setResolution(this.textResolution)
    this.taskLines = this.add
      .text(TASK_SCREEN.x, TASK_SCREEN.y, '', {
        fontFamily: this.fontFamily,
        fontSize: '13px',
        fontStyle: '500',
        color: '#BFE8D5',
        lineSpacing: 5,
      })
      .setDepth(DEPTH.wallText)
      .setResolution(this.textResolution)
    this.statusLines = this.add
      .text(STATUS_SCREEN.x, STATUS_SCREEN.y, '', {
        fontFamily: this.fontFamily,
        fontSize: '15px',
        fontStyle: '500',
        color: '#7FE6C8',
        lineSpacing: 6,
      })
      .setDepth(DEPTH.wallText)
      .setResolution(this.textResolution)
  }

  private buildAmbientLife() {
    this.clockHands = this.add.graphics().setDepth(DEPTH.wallText)
    this.drawClock()

    if (RACK) for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++) {
        const led = this.add
          .rectangle(RACK.x + 36 + col * 7, RACK.top + 17.5 + row * 22, 4, 4, col === 2 ? 0xf4d68b : 0x38c7a1)
          .setDepth(DEPTH.wall)
        this.rackLeds.push({ led, next: 0 })
      }
    }

    if (ACTIVITY_METER) for (let i = 0; i < METER_BARS; i++) {
      const height = 6 + i * 3.4
      this.meter.push(
        this.add
          .rectangle(ACTIVITY_METER.x + i * 7, ACTIVITY_METER.y, 5, height, 0x5c6ac4)
          .setOrigin(0.5, 1)
          .setAlpha(0.22)
          .setDepth(DEPTH.wall),
      )
    }
  }

  private buildNight() {
    this.night = this.add
      .rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, NIGHT_TINT, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.night)
      .setAlpha(0)
    // Las luces ya vienen resueltas en una imagen: un solo cuadro, sin una capa por lámpara.
    this.nightGlow = this.art(0, 0, 'night-glow', 0, 0)
      .setDisplaySize(WORLD.width, WORLD.height)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setAlpha(0)
  }

  private buildEffects() {
    const bit = (kind: BitKind) =>
      this.add
        .particles(0, 0, `bit-${kind}`, {
          emitting: false,
          lifespan: 1300,
          speedY: { min: -42, max: -24 },
          speedX: { min: -10, max: 10 },
          scale: { start: 0.62 / this.textureScale, end: 0.18 / this.textureScale },
          alpha: { start: 0.95, end: 0 },
          rotate: { min: -12, max: 12 },
        })
        .setDepth(DEPTH.fx)
    this.bits = { code: bit('code'), doc: bit('doc'), chart: bit('chart'), heart: bit('heart') }

    this.confetti = this.add
      .particles(0, 0, 'confetti', {
        emitting: false,
        lifespan: { min: 1400, max: 2600 },
        speed: { min: 150, max: 460 },
        angle: { min: 225, max: 315 },
        gravityY: 520,
        rotate: { start: 0, end: 540 },
        scale: { start: 0.9 / this.textureScale, end: 0.6 / this.textureScale },
        alpha: { start: 1, end: 0.2 },
        tint: [0xe8593c, 0xffc24b, 0x1fa08a, 0x5b5bd6, 0xf2788a, 0x2f7de1],
      })
      .setDepth(DEPTH.fx)

    this.sparks = this.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: 800,
        speed: { min: 50, max: 130 },
        scale: { start: 0.7 / this.textureScale, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 180 },
        tint: [0xffd45e, 0xffffff],
      })
      .setDepth(DEPTH.fx)
  }

  private buildHotspots() {
    for (const hotspot of HOTSPOTS) {
      const { x, y, w, h } = hotspot.area
      const zone = this.add
        .zone(x + w / 2, y + h / 2, w, h)
        .setDepth(9300)
        .setInteractive({ useHandCursor: true })
      zone.on('pointerup', () => {
        if (!this.dragging) this.callbacks.onHotspot(hotspot.id)
      })
    }
  }

  emitBit(x: number, y: number, kind: BitKind, tint: number) {
    const emitter = this.bits[kind]
    if (!emitter) return
    emitter.setParticleTint(tint)
    emitter.emitParticleAt(x, y, 1)
  }

  // ---- Estado ----

  async applySnapshot(snapshot: OfficeSnapshot) {
    if (!this.ready) {
      this.pending = snapshot
      return
    }

    const modeChanged = snapshot.mode !== this.lastMode
    if (modeChanged) {
      for (const character of this.characters.values()) character.destroy()
      this.characters.clear()
      this.seenEvents.clear()
      this.elevator.reset()
      this.lastMode = snapshot.mode
    }

    const fresh = snapshot.agents.filter(agent => !this.characters.has(agent.id))
    if (fresh.length > 0) {
      await this.loadTextures(fresh.flatMap(agent => agentArts(agent.id, agent.appearance)))
      for (const agent of fresh) this.characters.set(agent.id, new Character(this, agent))
    }

    const progressOf = (agent: Agent) => {
      if (agent.status !== 'working') return null
      return snapshot.tasks.find(t => t.id === agent.currentTaskId)?.progress ?? null
    }

    // Quien ya está en un slot lo conserva; si no, cada uno salta de lugar al entrar otro.
    const taken = new Set<Slot>()
    for (const agent of snapshot.agents) {
      const character = this.characters.get(agent.id)
      const target = character ? this.targetFor(agent, character, taken) : null
      if (target) taken.add(target)
    }

    for (const agent of snapshot.agents) {
      const character = this.characters.get(agent.id)
      if (!character) continue
      const slot = this.targetFor(agent, character, taken, true)
      if (slot) {
        if (!character.slot) character.place(slot)
        else character.goTo(slot)
        taken.add(slot)
      }
      character.update(agent, progressOf(agent))
      character.setSelected(agent.id === this.selected)
      // Si alguien se le acercó a hablar, deja de mirar la pantalla.
      character.setGaze(snapshot.agents.some(other => other.location === `handoff:${agent.id}`) ? -1 : 0)
    }

    this.updateDeskSigns(snapshot)
    this.updateBoard(snapshot)
    this.updateReview(snapshot)
    this.handleEvents(snapshot.events, modeChanged)
  }

  private targetFor(agent: Agent, character: Character, taken: Set<Slot>, resolve = false): Slot | null {
    const { location } = agent
    if (location === 'desk') return DESKS.find(d => d.id === agent.deskId)?.seat ?? null

    // Descansa en el rincón de su propio piso, no en una sala común: el edificio no se
    // vacía cuando no hay tareas y cada uno queda donde se lo espera.
    if (location === 'lounge') return DESKS.find(d => d.id === agent.deskId)?.rest ?? null

    if (location.startsWith('handoff:')) {
      const targetId = location.slice('handoff:'.length)
      const targetDesk = this.characters.get(targetId)?.agent.deskId
      return (targetDesk && handoffSlots.get(targetDesk)) || null
    }

    if (location === 'meeting' || location === 'review') {
      const slots = SLOTS[location]
      if (character.slot && slots.includes(character.slot)) return character.slot
      if (!resolve) return null
      return slots.find(slot => !taken.has(slot)) ?? slots[0]
    }
    return null
  }

  private updateDeskSigns(snapshot: OfficeSnapshot) {
    for (const desk of DESKS) {
      const agent = snapshot.agents.find(a => a.deskId === desk.id)
      const empty = !agent || agent.status === 'offline'
      const sign = this.deskSigns.get(desk.id)
      if (empty && !sign) this.addDeskSign(desk, agent ? 'Sin sesión' : 'Vacío')
      if (sign) sign.setVisible(empty)
    }
  }

  private updateBoard(snapshot: OfficeSnapshot) {
    const roots = snapshot.tasks.filter(t => t.parentId === null && !isClosed(t))
    const goal = [...roots].reverse()[0]
    const lines = goal ? snapshot.tasks.filter(t => t.parentId === goal.id).slice(-3) : []
    this.boardTitle.setText(goal ? clip(goal.title, 66) : 'Sin consignas activas')
    this.taskLines.setText(
      lines.length > 0
        ? lines.map(t => `${t.status === 'done' ? '✓' : t.status === 'in_progress' ? '›' : '·'} ${clip(t.title, 22)}`).join('\n')
        : 'Sin tareas en curso',
    )

    const { metrics } = snapshot
    this.statusLines.setText(
      [`Activas ${metrics.activeTasks}`, `Revisar ${metrics.pendingReviews}`, `Listas ${metrics.finishedTasks}`].join('\n'),
    )
  }

  private updateReview(snapshot: OfficeSnapshot) {
    const pending = snapshot.deliverables.filter(d => d.status === 'pending_review').length
    this.reviewPapers.forEach((paper, index) => paper.setVisible(index < pending))
    this.beaconOn.setVisible(pending > 0)
    this.tweens.killTweensOf(this.beaconGlow)
    if (pending > 0 && !this.calm) {
      this.beaconGlow.setAlpha(0.3)
      this.tweens.add({ targets: this.beaconGlow, alpha: 0.75, duration: 480, yoyo: true, repeat: -1 })
    } else {
      this.beaconGlow.setAlpha(pending > 0 ? 0.5 : 0)
    }
  }

  private handleEvents(events: OfficeEvent[], firstLoad: boolean) {
    for (const event of events) {
      if (this.seenEvents.has(event.id)) continue
      this.seenEvents.add(event.id)
      // Lo que ya pasó no se vuelve a festejar al abrir la página.
      if (!firstLoad) this.react(event)
    }
  }

  private react(event: OfficeEvent) {
    const source = event.agentId ? this.characters.get(event.agentId) : undefined
    const target = event.targetAgentId ? this.characters.get(event.targetAgentId) : undefined

    switch (event.type) {
      case 'task.assigned':
      case 'task.delegated':
      case 'task.reassigned':
      case 'agent.message':
        if (source && target) this.flyPlane(source.top, target.top)
        break
      case 'review.approved':
        if (source) {
          source.cheer()
          this.burstConfetti(source.top)
        }
        break
      case 'task.finished':
        if (source) this.burstSparks(source.top)
        break
      case 'review.rejected':
      case 'task.failed':
        if (source) {
          source.alarm()
          source.say('Uy…', 1800)
        }
        break
      // Lo decidiste vos: no hay alarma, sólo acusa recibo.
      case 'task.cancelled':
        if (source) source.say('Listo, lo dejo', 1600)
        break
    }
  }

  private flyPlane(from: Point, to: Point) {
    if (this.calm) return
    const plane = this.art(from.x, from.y, 'plane', 0.5, 0.5).setDepth(DEPTH.fx)
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const lift = Math.min(150, 50 + distance * 0.25)
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(from.x, from.y),
      new Phaser.Math.Vector2((from.x + to.x) / 2, Math.min(from.y, to.y) - lift),
      new Phaser.Math.Vector2(to.x, to.y),
    )
    const state = { t: 0 }
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 900 + distance * 0.5,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const point = curve.getPoint(state.t)
        const tangent = curve.getTangent(state.t)
        plane.setPosition(point.x, point.y).setRotation(tangent.angle() + 0.25)
      },
      onComplete: () => {
        this.burstSparks(to, 6)
        plane.destroy()
      },
    })
  }

  private burstConfetti(at: Point) {
    if (this.calm) return
    this.confetti.emitParticleAt(at.x, at.y, 70)
  }

  private burstSparks(at: Point, count = 10) {
    if (this.calm) return
    this.sparks.emitParticleAt(at.x, at.y, count)
  }

  select(id: string | null) {
    this.selected = id
    for (const character of this.characters.values()) character.setSelected(character.id === id)
  }

  positionOf(id: string) {
    return this.characters.get(id)?.position ?? null
  }

  setDark(dark: boolean, instant = false) {
    this.dark = dark
    if (!this.ready && !this.night) return
    // Al abrir la página no hay transición: arranca directamente en su tema.
    const target = (obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle, alpha: number) => {
      this.tweens.killTweensOf(obj)
      if (instant) obj.setAlpha(alpha)
      else this.tweens.add({ targets: obj, alpha, duration: 700, ease: 'Sine.easeInOut' })
    }
    target(this.night, dark ? 1 : 0)
    target(this.skyNight, dark ? 1 : 0)
    target(this.nightGlow, dark ? 1 : 0)
    for (const cloud of this.clouds) target(cloud, dark ? 0.08 : 0.92)
  }

  // ---- Vida ----

  update(time: number, delta: number) {
    if (!this.ready) return
    this.spreadPlates()
    let moving = this.elevator.busy
    for (const character of this.characters.values()) {
      character.tick(time, delta)
      moving ||= character.isWalking
    }
    this.setPace(moving ? BUSY_FPS : QUIET_FPS)
    this.tickScreens(time)
    this.tickAmbient(time, delta)
  }

  /** Phaser no expone cambiar el tope en marcha, pero lo lee de acá en cada cuadro. */
  private setPace(fps: number) {
    if (fps === this.pace) return
    this.pace = fps
    const loop = this.game.loop as Phaser.Core.TimeStep & { _limitRate: number }
    loop.fpsLimit = fps
    loop._limitRate = 1000 / fps
  }

  /** Dos agentes juntos en el sofá pisarían sus carteles: el de la derecha sube un escalón. */
  private spreadPlates() {
    const ordered = [...this.characters.values()].sort((a, b) => a.position.x - b.position.x)
    const placed: { x: number; y: number; half: number; level: number }[] = []
    for (const character of ordered) {
      const { x, y } = character.position
      const half = (character.plateWidth / 2 + PLATE_GAP) * this.uiScale
      const taken = placed.filter(p => Math.abs(p.x - x) < p.half + half && Math.abs(p.y - y) < PLATE_ROW).map(p => p.level)
      let level = 0
      while (taken.includes(level)) level += 1
      placed.push({ x, y, half, level })
      character.setPlateLevel(level)
    }
  }

  private tickScreens(time: number) {
    if (time < this.nextScreenFrame) return
    const [fast, slow] = SCREEN_FRAME_MS
    this.screenFrame += 1
    let busiest = 0

    for (const desk of DESKS) {
      const screens = this.screens.get(desk.id)
      if (!screens) continue
      const character = [...this.characters.values()].find(c => c.agent.deskId === desk.id)
      const agent = character?.agent
      const seated = character?.slot === desk.seat && !character.isWalking

      screens.forEach((screen, index) => {
        let key = 'screen-off'
        if (agent?.status === 'working' && seated) {
          key = `screen-${SCREEN_ART[desk.kind]}-${(this.screenFrame + index) % 3}`
          busiest = Math.max(busiest, agent.activity)
        } else if (agent?.status === 'waiting_approval') {
          key = 'screen-alert'
        } else if (agent && agent.status !== 'offline' && seated) {
          key = 'screen-idle'
        }
        if (screen.texture.key !== key) screen.setTexture(key)
      })
    }
    this.nextScreenFrame = time + slow - (slow - fast) * busiest
  }

  private tickAmbient(time: number, delta: number) {
    // Luces del rack y barras siguen a quien trabaja ahí: quieto, el rack apenas parpadea.
    const load = [...this.characters.values()].find(c => c.agent.deskId === RACK?.deskId)?.agent
    const activity = load?.status === 'working' ? load.activity : 0
    const bars = Math.ceil(activity * METER_BARS)
    if (bars !== this.shownMeter) {
      this.shownMeter = bars
      this.meter.forEach((bar, index) => bar.setAlpha(index < bars ? 1 : 0.22))
    }

    if (!this.calm) {
      for (const [index, cloud] of this.clouds.entries()) {
        cloud.x += (delta / 1000) * (5 + (index % 3) * 3)
        if (cloud.x > WORLD.width + 60) cloud.x = -60
      }
      for (const entry of this.rackLeds) {
        if (time < entry.next) continue
        entry.next = time + 260 + Math.random() * (2400 - activity * 2100)
        entry.led.setAlpha(Math.random() > 0.35 ? 1 : 0.25)
      }
      if (time > this.nextSteam) {
        this.nextSteam = time + 1400
        this.puffSteam()
      }
    }
    if (time > this.nextClock) {
      this.nextClock = time + 1000
      this.drawClock()
    }
  }

  private puffSteam() {
    const puff = this.art(STEAM.x + Math.random() * 6, STEAM.y, 'steam', 0.5, 0.5).setDepth(DEPTH.wall).setAlpha(0.5)
    this.tweens.add({
      targets: puff,
      y: STEAM.y - 34,
      alpha: 0,
      scale: (1 / this.textureScale) * 1.6,
      duration: 1500,
      onComplete: () => puff.destroy(),
    })
  }

  /** El reloj marca la hora real: un detalle chico que la hace sentir viva. */
  private drawClock() {
    const now = new Date()
    const hours = (now.getHours() % 12) + now.getMinutes() / 60
    const minutes = now.getMinutes() + now.getSeconds() / 60
    const hand = (value: number, max: number, length: number, width: number, color: number) => {
      const angle = (value / max) * Math.PI * 2 - Math.PI / 2
      this.clockHands.lineStyle(width, color, 1)
      this.clockHands.lineBetween(CLOCK.x, CLOCK.y, CLOCK.x + Math.cos(angle) * length, CLOCK.y + Math.sin(angle) * length)
    }
    this.clockHands.clear()
    hand(hours, 12, 11, 2.8, 0x25313b)
    hand(minutes, 60, 16, 2, 0x25313b)
    hand(now.getSeconds(), 60, 17, 1.1, 0xe08a76)
    this.clockHands.fillStyle(0x25313b, 1).fillCircle(CLOCK.x, CLOCK.y, 2.6)
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
