import type { SpellElement, SpellForm, SpellSize } from '../spell/types';

/**
 * 원소별 네온 팔레트 — GDD §7 아트 디렉션
 * core: 파티클 중심색 / glow: 외곽 발광색 / accent: 보조 스파크색
 */
export interface ElementPalette {
  core: number;
  glow: number;
  accent: number;
}

export const ELEMENT_LABELS: Record<SpellElement, string> = {
  fire: '화염',
  water: '해류',
  lightning: '뇌전',
  ice: '빙결',
  earth: '대지',
  wind: '질풍',
  light: '광휘',
  dark: '암영',
};

/** 폼(주문 형태) 한글 라벨 — 보상 카드에서 "무슨 주문이었는지" 상기시키는 용도 */
export const FORM_LABELS: Record<SpellForm, string> = {
  bolt: '투사체',
  beam: '광선',
  wave: '파도',
  nova: '폭발',
  rain: '낙하',
  wall: '벽',
  cage: '속박',
  orbit: '궤도',
  summon: '소환',
  buff: '강화',
  zone: '장판',
  chain: '연쇄',
};

// Phase 5 재정비 — 코어는 채도 높게(블룸이 흰 후광을 얹도록), 원소 간 색상(hue)은 멀게.
// 특히 파랑 3종을 분리: 해류=깊은 청록 / 빙결=밝은 하늘 / 뇌전=전기 남보라.
// 최종값은 블룸 켠 상태로 화면에서 튜닝 (계약·회귀 무영향, 이 파일만 조정).
export const ELEMENT_PALETTES: Record<SpellElement, ElementPalette> = {
  fire:      { core: 0xff4d1a, glow: 0xff2200, accent: 0xffd166 },
  water:     { core: 0x0fb4d6, glow: 0x0077ff, accent: 0xa8f0ff },
  lightning: { core: 0x6f7dff, glow: 0x4c66ff, accent: 0xffffff },
  ice:       { core: 0x7ec8ff, glow: 0x66ccff, accent: 0xe8ffff },
  earth:     { core: 0xdf9836, glow: 0x8a5a2b, accent: 0xf0d9a8 },
  wind:      { core: 0x45dd84, glow: 0x44cc88, accent: 0xe0ffe8 },
  light:     { core: 0xffe15c, glow: 0xffd700, accent: 0xffffff },
  dark:      { core: 0xb44dff, glow: 0x4b0082, accent: 0xd0a8ff },
};

export const SIZE_SCALE: Record<SpellSize, number> = {
  small: 0.6,
  medium: 1.0,
  large: 1.5,
  huge: 2.2,
};

/** Phaser 숫자 색상을 DOM 오버레이의 CSS 색상으로 공유한다. */
export function paletteColorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
