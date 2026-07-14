import type { SpellElement, SpellSize } from '../../spell/types';

/**
 * 원소별 네온 팔레트 — GDD §7 아트 디렉션
 * core: 파티클 중심색 / glow: 외곽 발광색 / accent: 보조 스파크색
 */
export interface ElementPalette {
  core: number;
  glow: number;
  accent: number;
}

export const ELEMENT_PALETTES: Record<SpellElement, ElementPalette> = {
  fire:      { core: 0xff6b2b, glow: 0xff2200, accent: 0xffd166 },
  water:     { core: 0x2bd9d9, glow: 0x0077ff, accent: 0xa8f0ff },
  lightning: { core: 0x8fd6ff, glow: 0x4c66ff, accent: 0xffffff },
  ice:       { core: 0xbfefff, glow: 0x66ccff, accent: 0xe8ffff },
  earth:     { core: 0xd9a05b, glow: 0x8a5a2b, accent: 0xf0d9a8 },
  wind:      { core: 0xa8f0c0, glow: 0x44cc88, accent: 0xe0ffe8 },
  light:     { core: 0xfff3b0, glow: 0xffd700, accent: 0xffffff },
  dark:      { core: 0x9b5cff, glow: 0x4b0082, accent: 0xd0a8ff },
};

export const SIZE_SCALE: Record<SpellSize, number> = {
  small: 0.6,
  medium: 1.0,
  large: 1.5,
  huge: 2.2,
};
