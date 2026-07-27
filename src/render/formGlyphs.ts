import type { SpellForm } from '../spell/types';

/**
 * 폼 글리프 — 주문의 **형태**를 상징하는 선 아이콘 (도감·보상 카드·빌드 HUD 공용).
 *
 * 원래 codexOverlay 내부 const였는데, 도감은 타이틀 화면에만 있어서 **런 안에서
 * 글리프를 배울 자리가 없었다**. 보상 카드는 형태 정보가 없는 원형 그라데이션을 썼고,
 * 전투 HUD는 텍스트라 셋이 서로 다른 언어를 말했다. 여기로 모아 한 어휘로 통일한다:
 * 보상에서 고를 때 배우고 → 빌드 HUD에서 확인하고 → 도감에서 되짚는 학습 루프.
 *
 * 규약: 24×24 viewBox, stroke-width 1.9, 색은 currentColor(DOM) 또는 치환(Phaser).
 */

/** 폼별 SVG 내부 조각 — 원소색 위에 밝은 선으로 형태를 상징한다 (currentColor). */
export const FORM_GLYPHS: Record<SpellForm, string> = {
  bolt: '<path d="M14 3 6 15h4l-1 6 8-12h-4z" fill="currentColor"/>',
  beam: '<line x1="3" y1="12" x2="19" y2="12"/><circle cx="20" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  wave: '<path d="M3 12q3-7 6 0t6 0 6 0" fill="none"/>',
  nova: '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  rain: '<path d="M7 4 5 11M12 3l-2 7M17 4l-2 7M8 14l-1 5M13 13l-1 5M18 14l-1 5"/>',
  wall: '<rect x="4" y="8" width="16" height="9" rx="1" fill="none"/><path d="M4 12.5h16M9 8v4.5M14 12.5V17"/>',
  cage: '<rect x="5" y="5" width="14" height="14" rx="1" fill="none"/><path d="M9.5 5v14M14 5v14M5 9.5h14M5 14h14"/>',
  orbit: '<circle cx="12" cy="12" r="7" fill="none"/><circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/>',
  summon: '<circle cx="12" cy="13" r="5.5" fill="none"/><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 4l1.5 3M15 4l-1.5 3"/>',
  buff: '<path d="M12 20V6M6.5 11.5 12 6l5.5 5.5" fill="none"/>',
  zone: '<circle cx="12" cy="12" r="8" fill="none" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  chain: '<circle cx="7.5" cy="12" r="3.2" fill="none"/><circle cx="16.5" cy="12" r="3.2" fill="none"/><line x1="10.7" y1="12" x2="13.3" y2="12"/>',
  slash: '<path d="M6 18 16 6M10 19 20 7" fill="none"/>',
};

/** 시퀀스(다단계 영창)는 폼이 하나가 아니다 — 연결된 점으로 "단계"를 상징한다. */
export const SEQUENCE_GLYPH = '<circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M7.5 12h2M14.5 12h2"/>';

/** 텍스처 키 접두사 — Phaser 캐시에서 폼 글리프를 찾는 규약 */
export const FORM_GLYPH_TEXTURE_PREFIX = 'formglyph-';

export function formGlyphTextureKey(form: SpellForm | 'sequence'): string {
  return `${FORM_GLYPH_TEXTURE_PREFIX}${form}`;
}

function glyphInner(form: SpellForm | undefined): string {
  return form ? FORM_GLYPHS[form] : SEQUENCE_GLYPH;
}

/** DOM용 — currentColor를 그대로 두어 부모 색을 상속한다 (도감·보상 카드). */
export function glyphSvg(form: SpellForm | undefined): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphInner(form)}</svg>`;
}

/**
 * Phaser용 data URI — 래스터화 시점엔 CSS 컨텍스트가 없어 currentColor가 죽으므로
 * 흰색으로 치환해 굽고, 색은 씬에서 setTint로 입힌다 (한 텍스처 × 8원소 재사용).
 *
 * **base64여야 한다**: Phaser의 SVGFile 로더는 data URI를 만나면 atob로 디코드하므로
 * 퍼센트 인코딩을 주면 InvalidCharacterError로 로드가 통째로 실패한다.
 */
export function formGlyphDataUri(form: SpellForm | undefined): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"`
    + ` fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round"`
    + ` stroke-linejoin="round">${glyphInner(form).replace(/currentColor/g, '#ffffff')}</svg>`;
  // 글리프는 전부 ASCII(경로·hex색)라 btoa로 충분하다. 이 모듈은 렌더 레이어(브라우저) 전용.
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** 굽어야 할 전체 목록 — 씬 preload가 이걸 돌며 load.svg 한다. */
export function allGlyphTextures(): { key: string; dataUri: string }[] {
  const forms = Object.keys(FORM_GLYPHS) as SpellForm[];
  return [
    ...forms.map((form) => ({ key: formGlyphTextureKey(form), dataUri: formGlyphDataUri(form) })),
    { key: formGlyphTextureKey('sequence'), dataUri: formGlyphDataUri(undefined) },
  ];
}
