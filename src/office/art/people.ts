import type { AgentAppearance, HairStyle, OutfitStyle } from '@/domain/types'
import { edge, ellipse, INK, light, panel, path, rect, shade, stroke, type Art } from './svg'

// Personajes por partes: cada pieza es una textura y el motor las anima por
// separado. Se generan de `appearance`, así un agente nuevo se dibuja solo. Las medidas
// son las del muñeco de pie: 144 de alto, tres cabezas y media.

/** Largo de cada tramo: `character.ts` arma las articulaciones con esto. */
export const RIG = {
  hip: 52,
  torso: 48,
  shoulder: 44,
  shoulderX: 19,
  hipX: 8,
  thigh: 27,
  shin: 25,
  upper: 24,
  fore: 23,
  headY: 118,
}

/** Caja de cabeza y pelo. La cara se apoya en su centro. */
export const HEAD_BOX = { w: 72, h: 80, cx: 36, cy: 40 }
const TORSO_BOX = { w: 60, h: 56 }
/** Caja del pelo que cae detrás del cuerpo. Es más alta para el pelo largo. */
export const UNDER_BOX = { w: 76, h: 114, cx: 38, cy: 40 }

function pantsColor(style: OutfitStyle) {
  return { blazer: '#2F3A49', sweater: '#4A5568', hoodie: '#384152', shirt: '#55606F' }[style]
}

const SHOE: Record<OutfitStyle, string> = {
  blazer: '#2A2F38',
  sweater: '#8E6F58',
  hoodie: '#F1EDE3',
  shirt: '#2A2F38',
}

function head(skin: string) {
  const under = shade(skin, 0.16)
  return [
    path('M17 37C17 23 25 17 36 17C47 17 55 23 55 37C55 52 46 63 36 63C26 63 17 52 17 37Z', skin, edge(skin, 1.2)),
    path('M19 46C23 57 30 63 36 63C43 63 50 57 53 46C47 55 26 56 19 46Z', under, 'opacity="0.42"'),
  ].join('')
}

const highlight = (d: string, color: string, width = 2.2) => stroke(d, light(color, 0.3), width, 'opacity="0.7"')

/** Capa de pelo que va encima de la cabeza, de frente. */
const HAIR_FRONT: Record<HairStyle, (hair: string, skin: string) => string> = {
  bob: h =>
    path('M14 42C11 21 23 9 37 9C51 9 61 21 58 42C57 48 55 50 53 50C54 38 52 30 47 25C39 31 26 31 21 25C18 31 18 40 19 50C17 50 15 48 14 42Z', h, edge(h, 1.1)) +
    highlight('M25 15C33 11 45 12 51 19', h),
  curly: h => {
    const puffs: [number, number, number][] = [
      [17, 34, 8], [15, 25, 7.5], [21, 16, 8], [30, 11, 8], [41, 11, 8], [50, 15, 8], [56, 24, 7.5], [56, 34, 7.5], [28, 20, 7], [43, 20, 7], [36, 16, 7],
    ]
    return [
      ...puffs.map(([x, y, r]) => ellipse(x, y, r, r, h, edge(h, 1.1))),
      ...puffs.map(([x, y, r]) => ellipse(x, y, r - 0.9, r - 0.9, h)),
      ellipse(29, 12, 2.4, 1.5, light(h, 0.32)),
      ellipse(44, 13, 2.4, 1.5, light(h, 0.32)),
      ellipse(20, 22, 2, 1.3, light(h, 0.26)),
    ].join('')
  },
  short: h =>
    path('M16 36C13 20 24 10 37 10C50 10 60 20 56 36C54 30 51 27 46 25C42 29 36 28 33 25C28 30 22 31 19 30C17 31 16 33 16 36Z', h, edge(h, 1.1)) +
    highlight('M27 15C34 12 44 13 50 18', h),
  bun: h =>
    ellipse(36, 8, 9, 7.5, h, edge(h, 1.1)) +
    path('M16 36C15 19 26 12 36 12C47 12 57 19 56 36C50 27 43 24 36 24C29 24 22 27 16 36Z', h, edge(h, 1.1)) +
    highlight('M26 17C33 14 42 15 48 20', h),
  buzz: (h, skin) => path('M17 34C17 20 26 13 36 13C46 13 55 20 55 34C49 26 43 23 36 23C29 23 23 26 17 34Z', `${shade(h, 0)}`, `opacity="0.9" ${edge(skin, 0.4)}`),
  long: h =>
    path('M15 41C12 20 24 9 36 9C48 9 60 20 57 41C55 32 51 26 44 22C38 28 27 29 22 24C18 29 16 34 15 41Z', h, edge(h, 1.1)) +
    highlight('M25 15C33 11 44 12 51 18', h),
}

/** Pelo que cae por detrás de la cara: va debajo del cuerpo. */
const HAIR_UNDER: Partial<Record<HairStyle, (hair: string) => string>> = {
  bob: h => path('M16 34C14 56 17 66 25 68H51C59 66 62 56 60 34Z', shade(h, 0.14), edge(h, 1.1)),
  long: h => path('M15 34C10 62 10 96 19 106H57C66 96 66 62 61 34Z', shade(h, 0.12), edge(h, 1.1)),
  curly: h =>
    [[19, 44, 8], [57, 44, 8], [21, 54, 7], [55, 54, 7]]
      .map(([x, y, r]) => ellipse(x, y, r, r, shade(h, 0.12), edge(h, 1.1)))
      .join(''),
}

const TORSO = 'M8 20C9 13 15 10 22 9L38 9C45 10 51 13 52 20L49 42L47 54H13L11 42Z'

function torsoBase(color: string, skin: string) {
  return [
    rect(24, 0, 12, 15, 4, shade(skin, 0.1)),
    path(TORSO, color, edge(color, 1.2)),
    // Sombra de costado: da volumen sin agregar líneas.
    path('M42 10C46 11 51 14 52 20L49 42L47 54H40C44 40 45 24 42 10Z', shade(color, 0.14), 'opacity="0.55"'),
  ].join('')
}

const OUTFIT: Record<OutfitStyle, (color: string, skin: string) => string> = {
  blazer: (c, s) =>
    [
      torsoBase(c, s),
      path('M23 9L30 28L37 9Z', '#FBF9F4', edge('#FBF9F4', 0.9)),
      path('M26 9L30 16L34 9Z', s),
      path('M23 9L30 28L26 34L18 13Z', shade(c, 0.16), edge(c, 1)),
      path('M37 9L30 28L34 34L42 13Z', shade(c, 0.16), edge(c, 1)),
      ellipse(30, 38, 1.5, 1.5, shade(c, 0.5)),
      ellipse(30, 45, 1.5, 1.5, shade(c, 0.5)),
    ].join(''),
  sweater: (c, s) =>
    [
      torsoBase(c, s),
      ellipse(30, 10.5, 9, 3.6, s, edge(c, 1.6)),
      stroke('M11 30H50M12 36H49', light(c, 0.3), 2.4, 'opacity="0.75"'),
      rect(12, 49, 36, 5, 1.5, shade(c, 0.16)),
    ].join(''),
  hoodie: (c, s) =>
    [
      torsoBase(c, s),
      ellipse(30, 11, 13, 6, shade(c, 0.18), edge(c, 1)),
      ellipse(30, 10, 6.6, 3, s),
      stroke('M26 16V26M34 16V26', '#FBF9F4', 1.6),
      path('M18 38H42L45 50H15Z', shade(c, 0.12), edge(c, 1)),
    ].join(''),
  shirt: (c, s) =>
    [
      torsoBase(c, s),
      path('M25 9L30 18L35 9Z', s),
      path('M22 8L30 18L26 22L18 11Z', light(c, 0.3), edge(c, 1)),
      path('M38 8L30 18L34 22L42 11Z', light(c, 0.3), edge(c, 1)),
      stroke('M30 19V53', shade(c, 0.24), 1.4),
    ].join(''),
}

function upperArm(color: string) {
  return panel(2, 1, 14, 28, 7, color, 1.1)
}

function forearm(color: string, skin: string) {
  return [panel(3, 0, 12, 25, 6, color, 1.1), ellipse(9, 27, 5.4, 5.8, skin, edge(skin, 1))].join('')
}

function thigh(color: string) {
  return panel(2, 1, 16, 31, 8, color, 1.1)
}

function shin(color: string, shoe: string) {
  return [panel(4, 0, 14, 27, 6.5, color, 1.1), path('M4 24H18C23 25 28 27 28 31C28 33 27 33.5 26 33.5H4Z', shoe, edge(shoe, 1))].join('')
}

export function agentArts(id: string, a: AgentAppearance): Art[] {
  const under = HAIR_UNDER[a.hairStyle]
  const pants = a.pants ?? pantsColor(a.outfitStyle)
  const arts: Art[] = [
    { key: `${id}-head`, width: HEAD_BOX.w, height: HEAD_BOX.h, body: head(a.skin) },
    { key: `${id}-ear`, width: 12, height: 16, body: ellipse(6, 8, 3.8, 5.6, shade(a.skin, 0.06), edge(a.skin, 1)) },
    { key: `${id}-hair`, width: HEAD_BOX.w, height: HEAD_BOX.h, body: HAIR_FRONT[a.hairStyle](a.hair, a.skin) },
    { key: `${id}-body`, width: TORSO_BOX.w, height: TORSO_BOX.h, body: OUTFIT[a.outfitStyle](a.outfit, a.skin) },
    { key: `${id}-upper`, width: 18, height: 30, body: upperArm(a.outfit) },
    { key: `${id}-fore`, width: 18, height: 34, body: forearm(a.outfit, a.skin) },
    { key: `${id}-thigh`, width: 20, height: 33, body: thigh(pants) },
    { key: `${id}-shin`, width: 30, height: 35, body: shin(pants, SHOE[a.outfitStyle]) },
  ]
  if (under) arts.push({ key: `${id}-hair-under`, width: UNDER_BOX.w, height: UNDER_BOX.h, body: under(a.hair) })
  return arts
}

export function sharedPersonArts(): Art[] {
  const mouth = (key: string, d: string, fill = 'none') => ({
    key,
    width: 20,
    height: 14,
    body: `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  })
  return [
    {
      key: 'eye',
      width: 12,
      height: 14,
      body: `${ellipse(6, 7, 3.3, 4.3, INK)}${ellipse(7.4, 5.2, 1.2, 1.4, '#FFFFFF')}`,
    },
    { key: 'brow', width: 14, height: 6, body: stroke('M2 4C5 1.8 9 1.8 12 4', INK, 1.7) },
    { key: 'nose', width: 8, height: 8, body: stroke('M3 1.5C2 4 3 6 5.4 6', '#1F2A33', 1.1, 'opacity="0.35"') },
    { key: 'blush', width: 14, height: 9, body: ellipse(7, 4.5, 6, 3.4, '#F08B8B', 'opacity="0.34"') },
    mouth('mouth-smile', 'M5 5C8 9 12 9 15 5'),
    mouth('mouth-happy', 'M4 4H16C16 10 12 12 10 12C8 12 4 10 4 4Z', '#C2483F'),
    mouth('mouth-flat', 'M6 7H14'),
    mouth('mouth-sad', 'M5 9C8 5.4 12 5.4 15 9'),
    mouth('mouth-open', 'M7 4C7 3 13 3 13 4C14 8 12 10 10 10C8 10 6 8 7 4Z', '#C2483F'),
    {
      key: 'glasses',
      width: 40,
      height: 16,
      body: `<g fill="#FFFFFF" fill-opacity="0.16" stroke="${INK}" stroke-width="1.5"><rect x="3" y="2" width="14" height="12" rx="5"/><rect x="23" y="2" width="14" height="12" rx="5"/></g>${stroke('M17 7C19 5.6 21 5.6 23 7', INK, 1.5)}`,
    },
    {
      key: 'headset',
      width: 64,
      height: 58,
      body: [
        stroke('M9 34C7 12 20 4 32 4C44 4 57 12 55 34', '#2E3944', 3.4),
        panel(3, 26, 10, 18, 4.5, '#3F4D5A', 1),
        panel(51, 26, 10, 18, 4.5, '#3F4D5A', 1),
        stroke('M8 44C10 51 17 52 22 50', '#2E3944', 1.8),
        ellipse(23.5, 49.6, 2.2, 2.2, '#F2A59A'),
      ].join(''),
    },
    {
      key: 'shadow',
      width: 64,
      height: 18,
      body: ellipse(32, 9, 26, 6, '#1F2A33', 'opacity="0.24" filter="url(#soft)"'),
    },
    {
      key: 'held-mug',
      width: 16,
      height: 16,
      body: `${stroke('M11 4c4 0 4 6 0 6', '#AEB7C0', 1.6)}${panel(1.5, 1.5, 11, 12, 2.6, '#FBF9F4', 1)}`,
    },
    {
      key: 'held-folder',
      width: 30,
      height: 24,
      body: `${panel(2, 3, 26, 19, 2, '#F4D68B', 1)}${rect(5, 7, 20, 2.6, 1, '#FBF9F4')}`,
    },
  ]
}

export function fxArts(): Art[] {
  const glyph = (key: string, body: string) => ({ key, width: 22, height: 22, body })
  const line = (d: string) => stroke(d, '#FFFFFF', 3)
  return [
    glyph('bit-code', line('M8 5L3 11L8 17M14 5L19 11L14 17')),
    glyph('bit-doc', `${rect(5, 3, 12, 16, 2, '#FFFFFF')}${stroke('M8 8h6M8 12h6', '#8F8AA6', 1.8)}`),
    glyph('bit-chart', `${rect(3, 12, 4, 7, 1, '#FFFFFF')}${rect(9, 7, 4, 12, 1, '#FFFFFF')}${rect(15, 3, 4, 16, 1, '#FFFFFF')}`),
    glyph('spark', path('M11 1L13.5 8.5L21 11L13.5 13.5L11 21L8.5 13.5L1 11L8.5 8.5Z', '#FFFFFF')),
    glyph('bit-heart', path('M11 19C3 13 1 8 4 5C6.5 2.6 9.6 3.4 11 6C12.4 3.4 15.5 2.6 18 5C21 8 19 13 11 19Z', '#FFFFFF')),
    { key: 'confetti', width: 10, height: 14, body: rect(0, 0, 10, 14, 2, '#FFFFFF') },
    {
      key: 'plane',
      width: 40,
      height: 34,
      body: `${path('M3 16L37 3L25 31L18 21Z', '#FBF9F4', edge('#D9DEE3', 1.4))}${path('M18 21L37 3L14 19Z', '#DFE4EA', edge('#D9DEE3', 1))}`,
    },
    {
      key: 'light-pool',
      width: 128,
      height: 128,
      defs: '<radialGradient id="pool"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>',
      body: '<circle cx="64" cy="64" r="64" fill="url(#pool)"/>',
    },
    { key: 'steam', width: 14, height: 14, body: ellipse(7, 7, 6, 6, '#FFFFFF') },
  ]
}
