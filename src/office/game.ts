import * as Phaser from 'phaser'
import type { OfficeSnapshot } from '@/domain/types'
import { WORLD } from './layout'
import { BUSY_FPS, OfficeScene, type OfficeCallbacks } from './scene'

// Fachada del motor visual. React sólo conoce esto: le pasa snapshots y recibe
// clics. Phaser no sabe que existe React, y el servidor no sabe que existe Phaser.

/** Un dedo que se mueve menos que esto está tocando, no arrastrando. */
const DRAG_THRESHOLD = 8
const NARROW_WIDTH = 640
const MAX_UI_SCALE = 2.4
/** Más textura que esto no se nota y gasta memoria. */
const MAX_TEXTURE_SCALE = 2.5
/** Reducir más de la mitad una textura sin mipmaps deja los bordes serruchados. */
const MIN_TEXTURE_SCALE = 1

export interface OfficeGameOptions extends OfficeCallbacks {
  parent: HTMLElement
  fontFamily: string
  dark: boolean
}

export class OfficeGame {
  private game: Phaser.Game
  private scene: OfficeScene
  private parent: HTMLElement
  private observer: ResizeObserver
  private dpr: number
  private center = { x: WORLD.width / 2, y: WORLD.height / 2 }
  private zoom = 1
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null

  constructor(options: OfficeGameOptions) {
    const { parent, fontFamily, dark, ...callbacks } = options
    this.parent = parent
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5)

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    const fit = width < NARROW_WIDTH ? height / WORLD.height : Math.min(width / WORLD.width, height / WORLD.height)

    this.scene = new OfficeScene({
      ...callbacks,
      fontFamily,
      calm,
      // Se dibuja a la densidad en la que se va a ver: así no hay borrosidad ni serrucho.
      textureScale: Phaser.Math.Clamp(Math.ceil(fit * this.dpr * 4) / 4, MIN_TEXTURE_SCALE, MAX_TEXTURE_SCALE),
      // Más resolución no ayuda: reducir mucho una textura sin mipmaps la deja serruchada.
      textResolution: Math.ceil(this.dpr),
      onReady: () => {
        this.resize()
        this.scene.setDark(dark, true)
        callbacks.onReady()
      },
    })

    // El lienzo se dibuja en píxeles físicos y `zoom` lo vuelve a su tamaño CSS:
    // Phaser no contempla pantallas de alta densidad y sin esto todo sale borroso.
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      transparent: true,
      antialias: true,
      roundPixels: false,
      scale: {
        mode: Phaser.Scale.NONE,
        width: width * this.dpr,
        height: height * this.dpr,
        zoom: 1 / this.dpr,
      },
      // Sin esto Phaser se queda con los toques y en el celular no se puede scrollear.
      input: { touch: { capture: false } },
      banner: false,
      // Tope para pantallas de 120 Hz; la escena baja a la mitad cuando nadie camina.
      fps: { limit: BUSY_FPS },
      audio: { noAudio: true },
      scene: this.scene,
    })

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(parent)
    this.game.events.once(Phaser.Core.Events.READY, () => {
      // Phaser pone `none`: el dedo sobre la oficina no podría bajar por la página.
      this.game.canvas.style.touchAction = 'pan-y'
      this.resize()
      this.bindPan()
    })
  }

  private get narrow() {
    return this.parent.clientWidth < NARROW_WIDTH
  }

  private resize() {
    const width = this.parent.clientWidth
    const height = this.parent.clientHeight
    const camera = this.scene.cameras?.main
    if (!camera || width === 0 || height === 0) return

    this.game.scale.resize(width * this.dpr, height * this.dpr)
    camera.setViewport(0, 0, width * this.dpr, height * this.dpr)

    const fit = Math.min(width / WORLD.width, height / WORLD.height)
    const cover = Math.max(width / WORLD.width, height / WORLD.height)
    // En el celular la oficina entera quedaría diminuta: se llena el alto y se arrastra.
    this.zoom = this.narrow ? cover : fit
    camera.setZoom(this.zoom * this.dpr)
    this.scene.setUiScale(Math.min(MAX_UI_SCALE, 1 / this.zoom))
    this.applyCenter()
  }

  private applyCenter() {
    const camera = this.scene.cameras?.main
    if (!camera) return
    const viewW = this.parent.clientWidth / this.zoom
    const viewH = this.parent.clientHeight / this.zoom
    const clamp = (value: number, view: number, world: number) =>
      view >= world ? world / 2 : Phaser.Math.Clamp(value, view / 2, world - view / 2)
    this.center.x = clamp(this.center.x, viewW, WORLD.width)
    this.center.y = clamp(this.center.y, viewH, WORLD.height)
    camera.centerOn(this.center.x, this.center.y)
  }

  private bindPan() {
    const input = this.scene.input
    input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.drag = { x: pointer.x, y: pointer.y, cx: this.center.x, cy: this.center.y, moved: false }
      this.scene.setDragging(false)
    })
    input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const drag = this.drag
      if (!drag || !pointer.isDown) return
      const dx = (pointer.x - drag.x) / this.dpr
      const dy = (pointer.y - drag.y) / this.dpr
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      this.scene.setDragging(true)
      if (!this.narrow) return
      this.center.x = drag.cx - dx / this.zoom
      this.applyCenter()
    })
    input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.drag = null
      // Se limpia después: el clic del personaje corre en este mismo evento.
      window.setTimeout(() => this.scene.setDragging(false), 0)
    })
  }

  update(snapshot: OfficeSnapshot) {
    void this.scene.applySnapshot(snapshot)
  }

  select(agentId: string | null) {
    this.scene.select(agentId)
    if (!agentId || !this.narrow) return
    const position = this.scene.positionOf(agentId)
    if (position) this.panTo(position.x)
  }

  private panTo(x: number) {
    const state = { x: this.center.x }
    this.scene.tweens.add({
      targets: state,
      x,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.center.x = state.x
        this.applyCenter()
      },
    })
  }

  setDark(dark: boolean) {
    this.scene.setDark(dark)
  }

  destroy() {
    this.observer.disconnect()
    this.game.destroy(true)
  }
}
