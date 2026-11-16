import * as Phaser from 'phaser'
import { ELEVATOR, FLOORS, wallBottom } from './layout'

// Ascensor al costado del edificio. Es sólo visual: se mueve cuando un agente cambia de
// `location` y el destino queda en otro piso. Sin viajes, se queda quieto con las
// puertas cerradas; no inventa movimiento.

/** Quien viaja. Lo implementa el personaje. */
export interface Rider {
  board(x: number, y: number): Promise<void>
  /** Baja en ese piso y sigue solo: la cabina no espera a que llegue a destino. */
  alight(level: number): void
}

interface Trip {
  rider: Rider
  from: number
  to: number
  /** Ya está parado frente a la puerta. */
  ready: boolean
  /** Lugar que ocupa adentro. */
  spot: number
}

export const CABIN_DEPTH = { back: 100, rider: 110, doors: 120, frame: 130, band: 140 }

// La reunión dura unos segundos: un ascensor lento haría que nadie llegue a tiempo.
const FLOOR_MS = 460
const DOOR_MS = 150
const ALIGHT_MS = 240
/** Lo que tarda en cruzar el piso entero quien viene de la otra punta. */
const HOLD_MS = 2600
/** Hasta dónde se pliega cada hoja: lo que queda se esconde detrás del marco. */
const DOOR_FOLD = 0.9

const cabinFloorY = (level: number) => wallBottom(level) + 2

export class Elevator {
  private scene: Phaser.Scene
  private scale: number
  private back: Phaser.GameObjects.Image
  private doorLeft: Phaser.GameObjects.Image
  private doorRight: Phaser.GameObjects.Image
  private frame: Phaser.GameObjects.Image
  private cable: Phaser.GameObjects.Rectangle
  private readouts: Phaser.GameObjects.Text[]

  private level = 0
  private shownLevel = -1
  private doors = 0
  private y = cabinFloorY(0)
  private queue: Trip[] = []
  private aboard: Trip[] = []
  private running = false
  private starting = false
  private generation = 0

  constructor(scene: Phaser.Scene, textureScale: number, fontFamily: string, textResolution: number) {
    this.scene = scene
    this.scale = 1 / textureScale
    const { x, width } = ELEVATOR
    const image = (key: string, ox: number, depth: number, dx = 0) =>
      scene.add.image(x + dx, this.y, key).setOrigin(ox, 1).setScale(this.scale).setDepth(depth)

    this.cable = scene.add.rectangle(x, 0, 2, 10, 0x7d8a96).setOrigin(0.5, 0).setDepth(CABIN_DEPTH.back - 1)
    this.back = image('cabin-back', 0.5, CABIN_DEPTH.back)
    this.doorLeft = image('door-left', 0, CABIN_DEPTH.doors, -width / 2 + 6)
    this.doorRight = image('door-right', 1, CABIN_DEPTH.doors, width / 2 - 6)
    this.frame = image('cabin-frame', 0.5, CABIN_DEPTH.frame)

    // Tapan la cabina entre piso y piso: sólo se la ve por los vanos, como en un edificio real.
    for (let level = 1; level < FLOORS.length; level++) {
      scene.add.image(x, wallBottom(level), 'tower-band').setOrigin(0.5, 0).setScale(this.scale).setDepth(CABIN_DEPTH.band)
    }

    this.readouts = FLOORS.map((_, level) =>
      scene.add
        .text(x, wallBottom(level) - ELEVATOR.height - 21, '', { fontFamily, fontSize: '13px', fontStyle: '600', color: '#7FE6C8' })
        .setOrigin(0.5)
        .setDepth(CABIN_DEPTH.band + 1)
        .setResolution(textResolution),
    )
    this.place()
    this.showLevel()
  }

  get cabinY() {
    return this.y
  }

  get busy() {
    return this.running
  }

  private place() {
    for (const part of [this.back, this.doorLeft, this.doorRight, this.frame]) part.setY(this.y)
    // Nace en el vano del último piso: más arriba cruzaría el indicador.
    const shaft = wallBottom(FLOORS.length - 1) - ELEVATOR.height
    this.cable.setPosition(ELEVATOR.x, shaft)
    this.cable.setSize(2, Math.max(1, this.y - ELEVATOR.height - shaft))
  }

  private setDoors(open: number) {
    this.doors = open
    const scale = this.scale * (1 - open * DOOR_FOLD)
    this.doorLeft.setScale(scale, this.scale)
    this.doorRight.setScale(scale, this.scale)
  }

  private showLevel() {
    if (this.level === this.shownLevel) return
    this.shownLevel = this.level
    const text = FLOORS[this.level].short
    for (const readout of this.readouts) readout.setText(text)
  }

  private tween(config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets' | 'onComplete'>, targets: object) {
    return new Promise<void>(resolve => {
      this.scene.tweens.add({ ...config, targets, onComplete: () => resolve() })
    })
  }

  private async moveTo(level: number) {
    if (level === this.level) return
    const state = { y: this.y }
    await this.tween(
      {
        y: cabinFloorY(level),
        duration: FLOOR_MS * Math.abs(level - this.level) ** 0.8,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          this.y = state.y
          this.place()
          // El indicador cambia al pasar cada losa, no al llegar.
          this.level = this.nearestLevel(state.y)
          this.showLevel()
        },
      },
      state,
    )
    this.level = level
    this.showLevel()
  }

  private nearestLevel(y: number) {
    let best = 0
    for (let level = 1; level < FLOORS.length; level++) {
      if (Math.abs(cabinFloorY(level) - y) < Math.abs(cabinFloorY(best) - y)) best = level
    }
    return best
  }

  private async swingDoors(open: boolean) {
    const state = { open: this.doors }
    await this.tween(
      { open: open ? 1 : 0, duration: DOOR_MS, ease: 'Sine.easeInOut', onUpdate: () => this.setDoors(state.open) },
      state,
    )
  }

  /** Se llama cuando el agente sale hacia el ascensor: así lo espera con las puertas abiertas. */
  call(rider: Rider, from: number, to: number) {
    this.queue.push({ rider, from, to, ready: false, spot: 0 })
    if (this.running || this.starting) return
    // Arranca después de este cambio de estado, no con el primero que llama: así ve a todos
    // los que salieron juntos y empieza por la punta. Si no, iba a buscar al primero de la
    // lista, se llenaba en el camino y el del último piso llegaba tarde a la reunión.
    this.starting = true
    const generation = this.generation
    queueMicrotask(() => {
      this.starting = false
      if (generation === this.generation && !this.running) void this.run(generation)
    })
  }

  arrive(rider: Rider) {
    const trip = this.queue.find(item => item.rider === rider)
    if (trip) trip.ready = true
  }

  /** Quien esperaba y cambió de destino se va sin subir. */
  cancel(rider: Rider) {
    this.queue = this.queue.filter(trip => trip.rider !== rider)
  }

  /** Quien ya está adentro y cambió de destino baja donde corresponde. */
  retarget(rider: Rider, to: number) {
    const trip = this.aboard.find(item => item.rider === rider)
    if (trip) trip.to = to
  }

  /** Sube o baja: quien va para el otro lado espera la vuelta. */
  private heading() {
    const first = this.aboard[0] ?? this.queue[0]
    return Math.sign(first.to - (this.aboard[0] ? this.level : first.from))
  }

  private nextStop() {
    const heading = this.heading()
    if (heading === 0) return this.level
    // Llena no frena a levantar a nadie: abriría, no entraría nadie y volvería a frenar ahí mismo.
    const full = this.aboard.length >= ELEVATOR.spots.length
    const pickups = full ? [] : this.queue.filter(trip => Math.sign(trip.to - trip.from) === heading).map(trip => trip.from)
    const first = heading > 0 ? Math.min : Math.max
    // Vacía va a la punta del recorrido: desde ahí junta a todos los que van para el mismo lado.
    if (this.aboard.length === 0) return first(...pickups)
    return first(...[...this.aboard.map(trip => trip.to), ...pickups].filter(level => (level - this.level) * heading >= 0))
  }

  private delay(ms: number) {
    return new Promise<void>(resolve => this.scene.time.delayedCall(ms, resolve))
  }

  private async letOut(stop: number) {
    const leaving = this.aboard.filter(trip => trip.to === stop)
    if (leaving.length === 0) return
    this.aboard = this.aboard.filter(trip => trip.to !== stop)
    for (const trip of leaving) trip.rider.alight(stop)
    await this.delay(ALIGHT_MS)
  }

  private async holdDoors(stop: number) {
    const deadline = this.scene.time.now + HOLD_MS
    while (this.queue.some(trip => trip.from === stop && !trip.ready) && this.scene.time.now < deadline) await this.delay(80)
  }

  private async letIn(stop: number) {
    const heading = this.aboard.length > 0 ? this.heading() : 0
    const free = ELEVATOR.spots.map((_, spot) => spot).filter(spot => !this.aboard.some(trip => trip.spot === spot))
    const coming = this.queue
      .filter(trip => trip.from === stop && trip.ready && (heading === 0 || Math.sign(trip.to - trip.from) === heading))
      .slice(0, free.length)
    this.queue = this.queue.filter(trip => !coming.includes(trip))
    this.aboard.push(...coming)
    await Promise.all(
      coming.map((trip, index) => {
        trip.spot = free[index]
        return trip.rider.board(ELEVATOR.x + ELEVATOR.spots[trip.spot], this.y - 1)
      }),
    )
  }

  private async run(generation: number) {
    this.running = true
    const stale = () => generation !== this.generation

    while ((this.queue.length > 0 || this.aboard.length > 0) && !stale()) {
      const stop = this.nextStop()
      await this.moveTo(stop)
      if (stale()) return
      await this.swingDoors(true)
      if (stale()) return
      await this.letOut(stop)
      if (stale()) return
      await this.holdDoors(stop)
      if (stale()) return
      await this.letIn(stop)
      if (stale()) return
      await this.swingDoors(false)
    }
    if (!stale()) this.running = false
  }

  /** Al cambiar de modo los pasajeros dejan de existir: el viaje en curso se abandona. */
  reset() {
    this.generation += 1
    this.queue = []
    this.aboard = []
    this.running = false
    this.setDoors(0)
  }
}
