/**
 * 마도서 장식 — **UI가 "디자인된 것"으로 보이게 하는 실제 그림.**
 *
 * 총괄 지적: *"그냥 상자 하나 띄우고 색만 칠한 거잖아. 디자인이 없어."*
 *
 * 맞다. 그때까지 한 것은 색 교체 → 재질(결·얼룩) 추가였고, 둘 다 **표면 처리**다.
 * 표면을 아무리 손봐도 형태가 `둥근 사각형 + 테두리 + 가운데 정렬`이면 기본값으로
 * 보인다. 필사본이 필사본으로 보이는 이유는 종이 질감이 아니라 **그려 넣은 것들**이다:
 * 모서리 당초무늬, 장식 괘선, 머리글자, 봉랍.
 *
 * ## 왜 SVG인가
 *
 * CSS로는 곡선 장식을 만들 수 없다. `border-radius`·`box-shadow`로 흉내내면
 * 결국 "둥근 사각형"이라 지금 문제가 반복된다. 실제로 선을 그어야 한다.
 *
 * ## 왜 인라인인가
 *
 * 외부 파일로 두면 로드 실패 시 장식만 사라져 화면이 다시 밋밋해진다. 배경 아트가
 * 실패해도 방이 떠야 하는 것(#283)과 같은 원칙 — 다만 여기는 **실패하지 않는 쪽**을
 * 택했다. 문자열이라 번들에 들어가고 네트워크를 타지 않는다.
 *
 * ⚠️ 모든 장식은 `currentColor`를 쓴다. 색을 여기 박으면 팔레트를 바꿀 때 장식만
 * 옛 색으로 남는다 — 이번 통일에서 실제로 겪은 실패다.
 */

/**
 * 모서리 당초무늬 — 네 귀퉁이에 놓는다.
 *
 * 대칭 도형이 아니라 **한쪽으로 뻗는 덩굴**이다. 네 귀퉁이에 같은 것을 회전시켜
 * 놓으면 손으로 그린 테두리처럼 읽힌다. 좌상단 기준으로 그리고 CSS가 회전시킨다.
 */
export function cornerFlourish(): string {
  return `<svg class="orn-corner" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M2 30 L2 8 Q2 2 8 2 L30 2" stroke="currentColor" stroke-width="1.4" opacity="0.75"/>
    <path d="M7 26 L7 11 Q7 7 11 7 L26 7" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>
    <path d="M12 34 Q12 18 24 14 Q30 12 32 18 Q33 23 27 24 Q22 25 22 20"
          stroke="currentColor" stroke-width="1.2" opacity="0.62"/>
    <path d="M34 12 Q40 10 44 13" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <circle cx="22" cy="20" r="1.6" fill="currentColor" opacity="0.7"/>
    <circle cx="45.5" cy="13.5" r="1.2" fill="currentColor" opacity="0.55"/>
  </svg>`;
}

/**
 * 장식 괘선 — 제목 아래. **단순한 1px 선이 아니다.**
 *
 * 가운데 마름모를 두고 양쪽으로 가늘어지는 이중선. 필사본에서 절을 나누는 그 형태다.
 * 단선을 쓰면 그것 자체가 "기본값"으로 읽힌다.
 */
export function divider(): string {
  return `<svg class="orn-divider" viewBox="0 0 320 14" fill="none" aria-hidden="true" preserveAspectRatio="none">
    <path d="M4 7 L140 7" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
    <path d="M180 7 L316 7" stroke="currentColor" stroke-width="1.1" opacity="0.55"/>
    <path d="M28 4.2 L136 4.2" stroke="currentColor" stroke-width="0.6" opacity="0.3"/>
    <path d="M184 4.2 L292 4.2" stroke="currentColor" stroke-width="0.6" opacity="0.3"/>
    <path d="M160 1 L167 7 L160 13 L153 7 Z" stroke="currentColor" stroke-width="1.1"
          fill="currentColor" fill-opacity="0.22" opacity="0.85"/>
    <circle cx="146" cy="7" r="1.5" fill="currentColor" opacity="0.6"/>
    <circle cx="174" cy="7" r="1.5" fill="currentColor" opacity="0.6"/>
  </svg>`;
}

/**
 * 봉랍 — 선택·격상 표시.
 *
 * 알약 배지(`border-radius: 999px`)를 대체한다. 알약은 웹 UI의 문법이고, 마도서에서
 * "이것이 특별하다"를 말하는 물건은 **밀랍 도장**이다. 가장자리를 불규칙하게 해
 * 눌러 찍힌 느낌을 낸다.
 */
export function waxSeal(glyph = '✦'): string {
  return `<svg class="orn-seal" viewBox="0 0 44 44" fill="none" aria-hidden="true">
    <path d="M22 1.5 C29 1 35 4 39 10 C43 16 43 25 40 31 C37 37 30 42 22 42.5
             C14 42 7 37 4 31 C1 25 1 16 5 10 C9 4 15 1 22 1.5 Z"
          fill="currentColor" fill-opacity="0.92"/>
    <path d="M22 5 C27.5 4.6 32.5 7 35.8 12 C39 17 39 24.5 36.6 29.5 C34 34.5 28.5 38.6 22 39
             C15.5 38.6 10 34.5 7.4 29.5 C5 24.5 5 17 8.2 12 C11.5 7 16.5 4.6 22 5 Z"
          stroke="#1a1206" stroke-width="1" opacity="0.35"/>
    <text x="22" y="28" text-anchor="middle" font-size="17" fill="#1a1206"
          fill-opacity="0.72" font-family="serif">${glyph}</text>
  </svg>`;
}

/**
 * 표제 표식 — 제목 앞에 놓는 장식 인장 (head ornament).
 *
 * ⚠️ **머리글자(drop cap)를 쓰면 안 된다.** 처음엔 제목 첫 글자를 떼어 틀에
 * 넣었는데(라틴 필사본의 illuminated initial), 총괄이 바로 지적했다:
 * *"왜 '공'만 상자에 들어있는 거임?"*
 *
 * 그 관습은 **라틴 문자 전제**다. 알파벳은 낱자가 단위라 첫 글자를 떼도 나머지가
 * 읽히지만, 한글은 음절 블록이 단어의 일부다. "공명의 대가를 선택하라"에서 「공」을
 * 떼면 단어가 쪼개지고, 「공」 홀로는 뜻까지 달라진다.
 *
 * 한국어·일본어 책 디자인은 같은 자리에 **글자가 아니라 표식**을 놓는다. 그래서
 * 틀 안에 문자를 넣지 않고 인장을 그린다 — 장식 효과는 같고 제목은 온전히 남는다.
 */
export function titleSigil(): string {
  return `<svg class="orn-sigil" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="49" height="49" stroke="currentColor"
          stroke-width="1.2" opacity="0.55"/>
    <rect x="5" y="5" width="42" height="42" stroke="currentColor"
          stroke-width="0.6" opacity="0.3"/>
    <path d="M1.5 12 L1.5 1.5 L12 1.5" stroke="currentColor" stroke-width="2.2" opacity="0.85"/>
    <path d="M50.5 40 L50.5 50.5 L40 50.5" stroke="currentColor" stroke-width="2.2" opacity="0.85"/>
    <!-- 인장 — 육각 별과 내접원. 마법진의 축약형으로 읽힌다 -->
    <path d="M26 13 L34.5 18 L34.5 28 L26 33 L17.5 28 L17.5 18 Z"
          stroke="currentColor" stroke-width="1.3" opacity="0.8"/>
    <circle cx="26" cy="23" r="4.4" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>
    <path d="M26 13 L26 33 M17.5 18 L34.5 28 M34.5 18 L17.5 28"
          stroke="currentColor" stroke-width="0.55" opacity="0.32"/>
    <circle cx="26" cy="23" r="1.5" fill="currentColor" opacity="0.85"/>
    <path d="M20 40 L32 40" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
  </svg>`;
}

/**
 * 페이지 가장자리 마스크 — 손으로 자른 종이의 불규칙한 변(deckle edge).
 *
 * `border-radius`로는 **절대 못 만든다** — 그건 항상 매끈한 호를 그린다.
 * SVG 마스크로 변을 미세하게 흔들어야 종이가 된다.
 *
 * @returns CSS `mask-image`에 넣을 data URI
 */
export function deckleMask(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
    <path d="M0.6,2 Q1.4,0.7 3,0.6 L96.5,0.9 Q99.2,1.1 99.4,3.2 L99.1,96.6
             Q99.3,99.1 96.8,99.3 L3.4,99.1 Q0.8,99.2 0.7,96.7 Z" fill="#fff"/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 장식이 쓰는 공통 CSS — 각 오버레이가 자기 스타일에 깐다 */
export function ornamentCss(wrapId: string): string {
  return `
#${wrapId} .orn-corner {
  position: absolute; width: 46px; height: 46px; pointer-events: none;
  color: var(--orn, currentColor); opacity: 0.85;
}
#${wrapId} .orn-corner.tl { top: 6px; left: 6px; }
#${wrapId} .orn-corner.tr { top: 6px; right: 6px; transform: scaleX(-1); }
#${wrapId} .orn-corner.bl { bottom: 6px; left: 6px; transform: scaleY(-1); }
#${wrapId} .orn-corner.br { bottom: 6px; right: 6px; transform: scale(-1); }
#${wrapId} .orn-divider {
  display: block; width: min(320px, 76%); height: 14px; margin: 10px auto 18px;
  color: var(--orn, currentColor);
}
#${wrapId} .orn-seal { width: 30px; height: 30px; color: var(--seal, currentColor); }
#${wrapId} .orn-sigil { width: 46px; height: 46px; color: var(--orn, currentColor); }
`;
}
