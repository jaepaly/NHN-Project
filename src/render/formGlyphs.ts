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
  // 번개/화살표처럼 읽히지 않도록 둥근 탄환과 짧은 잔상으로 투사체를 표현한다.
  bolt: '<circle cx="17" cy="12" r="3.8" fill="currentColor" stroke="none"/><path d="M3 7.5h6.5M3 12h4.5M3 16.5h6.5"/>',
  beam: '<line x1="3" y1="12" x2="19" y2="12"/><circle cx="20" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  // 큰 봉우리가 앞으로 말려 올라가는 실루엣과 아래 물결을 겹쳐 '치는 파도'로 읽힌다.
  wave: '<path d="M3 17c2.1-5.8 6.3-9.4 10.2-8.7 3.5.6 5.2 4.1 4.1 6.8-1.1 2.7-4.6 3.8-6.8 2.4-1.7-1.1-2-3.5-.6-5.2-.2 2 .6 3.2 2.2 3.4 1.7.2 3.1-.9 3.1-2.5 0-1.9-1.7-3.5-3.7-3.5-3.2-.1-5.8 2.3-7.2 5.6"/><path d="M3.4 19c3.5-1.3 7.1-.7 10.1.9"/>',
  nova: '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  rain: '<path d="M7 4 5 11M12 3l-2 7M17 4l-2 7M8 14l-1 5M13 13l-1 5M18 14l-1 5"/>',
  wall: '<rect x="4" y="8" width="16" height="9" rx="1" fill="none"/><path d="M4 12.5h16M9 8v4.5M14 12.5V17"/>',
  // 가로 격자를 제거하고 세로 창살만 남겨 감옥/구속의 실루엣을 분명히 한다.
  cage: '<path d="M5 5.6c4.4-.7 9.6-.7 14 0v12.8c-4.4.7-9.6.7-14 0z"/><path d="M8.2 5.3v13.4M12 5v14M15.8 5.3v13.4"/>',
  orbit: '<circle cx="12" cy="12" r="7" fill="none"/><circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/>',
  summon: '<circle cx="12" cy="13" r="5.5" fill="none"/><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 4l1.5 3M15 4l-1.5 3"/>',
  buff: '<path d="M12 20V6M6.5 11.5 12 6l5.5 5.5" fill="none"/>',
  zone: '<circle cx="12" cy="12" r="8" fill="none" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  // 맞물린 타원 세 개로, 안경처럼 보이던 기존 두 원을 실제 사슬 고리로 바꾼다.
  chain: '<rect x="2.4" y="9.4" width="7" height="5.2" rx="2.6" transform="rotate(-38 5.9 12)"/><rect x="8.5" y="9.4" width="7" height="5.2" rx="2.6" transform="rotate(38 12 12)"/><rect x="14.6" y="9.4" width="7" height="5.2" rx="2.6" transform="rotate(-38 18.1 12)"/>',
  // 바깥·안쪽을 모두 원호로 깎은 초승형 칼날. 가운데 구체 없이도 원형 베기로 읽힌다.
  slash: '<path d="M17.8 4.5A9 9 0 1 0 17.8 19.5A6.5 6.5 0 1 1 17.8 4.5z" fill="currentColor" stroke="none"/>',
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
