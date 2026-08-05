/**
 * UI 토큰 — R3 소유 오버레이가 공유하는 색·모서리·폰트·층위 (총괄 지적: "정돈이 안 됐다").
 *
 * 원래 잡은 것 (실측): 폰트 폴백 4가지 · 모서리 13종 · 패널 배경 7종 · z-index 충돌.
 * 그때는 "기존에 가장 많이 쓰인 값"을 정본으로 승격해 화면 인상을 유지했다.
 *
 * ## 마도서 톤으로 전환 (총괄 지시 2026-07-31)
 *
 * #301이 경로 선택 지도를 **먹빛 마도서 + 빛바랜 금색 + 탁한 보라**로 재설계했고,
 * 총괄이 *"이 스타일에 맞게 다른 UI도 다 통일시켜야 하지 않을까?"*라고 물었다.
 *
 * 실측해보니 통일 비용이 크지 않았다 — 새 팔레트가 기존 토큰과 **역할 대 역할로
 * 대응**했기 때문이다(재설계가 아니라 색 교체):
 *
 *   accent      #8fa4ff(청) → #d8bb72(금)
 *   textBright  #eef1ff     → #eadfc8(양피지)
 *   textSoft    #aeb9e8     → #aaa1c8(탁한 보라)
 *   danger      #ff8fa3     → #b95f72(탁한 자홍)
 *   panel       rgba(8,11,28,.94) → rgba(24,17,28,.985)
 *
 * ⚠️ 다만 **토큰이 사실상 죽어 있었다.** 실측: `settingsOverlay`만 토큰을 19회 쓰고
 * 나머지는 전부 하드코딩이었다(보상 카드 45건 · 도감 28건 · 경로 지도 78건 …).
 * 값만 바꿔서는 화면이 안 따라온다. 그래서 이번엔 **소비처를 함께 옮긴다.**
 *
 * ## 의미 색은 왜 따로 두는가
 *
 * HP·마나·실드·정상 표시는 장식이 아니라 **"무엇인지"를 색으로 구분**한다. 마도서
 * 톤으로 전부 밀면 HP와 마나가 구분되지 않는다. 그래서 `UI_SEMANTIC`으로 분리하고,
 * 색조는 유지하되 **채도만 낮춰** 금색·양피지와 어울리게 했다(총괄 결정: "채도만 낮춘다").
 */

/** 층위 — 숫자를 흩뿌리지 않는다. 위로 갈수록 앞. */
export const UI_LAYER = {
  /** 영창 입력 바 (index.html) */
  incant: 10,
  /** 런 진행 칩 (ROOM n/m) — 영창 디밍 위에 남아야 읽힌다 */
  runHud: 15,
  /** 보상 3택 */
  reward: 20,
  /** 방 전환 연출 */
  roomTransition: 30,
  /** 런 요약 */
  summary: 40,
  /** 도감 */
  codex: 44,
  /** 설정 — 일시정지 위에서도 열리므로 도감보다 위 */
  settings: 46,
  /** 보스 후 선택 — 런의 분기점이라 가장 앞 */
  bossChoice: 48,
} as const;

/**
 * 모서리 3단계. 그 이상 세분하면 다시 13종이 된다.
 * pill은 배지·알약 전용(999px), circle은 원형 글리프 전용.
 */
export const UI_RADIUS = {
  /** 버튼·작은 요소 */
  sm: '8px',
  /** 카드·패널 */
  md: '14px',
  pill: '999px',
  circle: '50%',
} as const;

export const UI_COLOR = {
  /** 오버레이 뒤 암막 — 먹빛 */
  scrim: 'rgba(6, 5, 10, 0.9)',
  /** 패널 바탕 — 마도서 표면 */
  panel: 'rgba(24, 17, 28, 0.985)',
  /** 패널 안쪽 면(카드·칸) — 표면보다 한 겹 아래 */
  panelInset: 'rgba(14, 10, 18, 0.94)',
  /** 패널 테두리 — 낡은 가죽 */
  border: '#4b3850',
  /** 강조 테두리(선택·호버) — 금박 */
  borderStrong: '#d8bb72',

  /** 제목·가장 밝은 텍스트 — 양피지 */
  textBright: '#eadfc8',
  /** 본문 */
  text: '#d8cdb8',
  /** 보조 — 탁한 보라 */
  textSoft: '#aaa1c8',
  /** 흐린 안내 */
  textMuted: '#8a7f96',
  /** 밝은 배경 위 잉크 (금박 배지 위 글자) */
  ink: '#24180c',

  /** 기본 강조 — 링크·수치·선택 표시. 빛바랜 금색 */
  accent: '#d8bb72',
  /** 강조 발광 */
  accentGlow: '#f0d79a',
  /** 긍정(정상·성공) — 채도를 낮춘 이끼빛 */
  positive: '#7fb79a',
  /** 주의·격상 — 호박색 */
  warm: '#e0a860',
  /** 위험·되돌릴 수 없음 — 탁한 자홍 */
  danger: '#b95f72',
} as const;

/**
 * 의미 색 — **장식이 아니라 정보다.** 마도서 톤으로 밀면 안 된다.
 *
 * HP를 금색으로 바꾸면 마나와 구분이 안 되고, 친화도 바는 원소색을 따라야 한다.
 * 색조(hue)는 지키되 **채도만 낮춰** 금색·양피지 화면에서 형광으로 튀지 않게 했다.
 *
 * 종전 값 → 지금 값 (색조 유지, 채도 하향):
 *   hp     #ff91ad → #d97f96
 *   mana   #91b7ff → #8098c9
 *   shield #72d8ff → #6fb3c9
 *   ok     #72f1b8 → #7fb79a
 */
export const UI_SEMANTIC = {
  /** 체력 */
  hp: '#d97f96',
  /** 마나 */
  mana: '#8098c9',
  /**
   * 보호막 — 청록.
   * ⚠️ 마나(#8098c9)와 **충분히 벌려야 한다.** 채도를 낮추다 보면 둘이 같은 흐린
   * 청색이 된다(실측: 종전 #6fb3c9는 마나와 채널 거리 44로 회귀에 걸렸다).
   * 지금 값은 거리 87 · 채도 49%로 구분과 톤을 둘 다 만족한다.
   */
  shield: '#63c4bb',
  /** 정상·준비됨 */
  ok: '#7fb79a',
  /** 자기 강화 */
  buff: '#a8d6bd',
} as const;

/**
 * 무지개 램프 — **만물 변주(합주 빌드)의 색 문법.**
 *
 * 코덱스 작업이 이 6색을 보상 카드의 세 곳(테두리 그라디언트·회전 콘·룬 글자)에
 * 그대로 복붙하면서 하드코딩 상한(85건)이 깨졌다. 같은 램프가 흩어져 있으면 나중에
 * 한 색만 바꿔도 세 곳이 갈린다 — 그래서 여기로 올린다.
 *
 * 순서는 색상환 순(적→황→녹→청→자)이라 그라디언트로 이으면 무지개로 읽힌다.
 */
export const UI_RAINBOW = [
  '#ff6f8f', '#ffd166', '#8cf0b5', '#72cfff', '#9c7dff', '#ed8cff',
] as const;

/** 무지개를 CSS 그라디언트 정지점 목록으로 — 끝에 첫 색을 되붙여 이음새를 없앤다 */
export function rainbowStops(loop = true): string {
  return loop ? [...UI_RAINBOW, UI_RAINBOW[0]].join(', ') : UI_RAINBOW.join(', ');
}

/** Phaser는 숫자 색을 쓴다 — 문자열 토큰을 한 곳에서 변환해 두 축이 안 갈리게 한다 */
export function hex(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}

/**
 * Phaser 씬(HUD·배너·미니맵)이 쓰는 숫자 색.
 *
 * DOM 오버레이는 문자열 토큰을 쓰고 Phaser는 숫자를 쓴다. 두 축을 따로 두면
 * "오버레이는 마도서인데 HUD만 청색"이 다시 생긴다 — 실제로 그래서 통일이 필요해졌다.
 * 그래서 **같은 파일에서 파생**시킨다.
 *
 * ⚠️ 여기 있는 것은 **크롬**(패널·테두리·트랙)뿐이다. HP·마나 같은 의미 색은
 * `UI_SEMANTIC`에서 `hex()`로 변환해 쓴다 — 그쪽은 색조를 지켜야 하므로 톤 교체
 * 대상이 아니다.
 */
export const UI_HEX = {
  /** 패널 바탕 (HUD 박스·우측 패널) */
  panel: 0x181120,
  /** 패널 테두리 */
  border: hex(UI_COLOR.border),
  /** 강조 테두리 */
  borderStrong: hex(UI_COLOR.borderStrong),
  /** 바 트랙(빈 게이지) — 패널보다 한 톤 밝게 */
  track: 0x241a2c,
  /** 강조 */
  accent: hex(UI_COLOR.accent),
  /** 보조 텍스트 */
  textSoft: hex(UI_COLOR.textSoft),
  /** 흐린 안내 */
  textMuted: hex(UI_COLOR.textMuted),
} as const;

/**
 * 폰트 — 역할별로 **하나씩**. 폴백을 통일해 로드 실패해도 화면 간 인상이 안 갈린다.
 * 게임 내 Phaser 텍스트도 같은 스택을 쓰도록 문자열을 공유한다.
 */
export const UI_FONT = {
  /** 한글 서사·라벨 */
  serif: '"Noto Serif KR", "Malgun Gothic", serif',
  /** 수치·시스템 (HP·초·퍼센트) */
  mono: '"Consolas", "D2Coding", monospace',
  /** DOM 산문 (설명·안내) */
  sans: '"Noto Sans KR", "Malgun Gothic", "Segoe UI", sans-serif',
  /** 로고 전용 — 타이틀에서만 */
  display: 'Georgia, "Times New Roman", serif',
} as const;

/**
 * 오버레이 공통 CSS — 각 오버레이가 자기 스타일 앞에 깐다.
 * 스크림·패널·전환을 한 곳에서 정의해 "도감은 둥근데 요약은 각진" 류를 없앤다.
 */
/**
 * 마도서 재질 — **색이 아니라 이것이 "마도서답다"를 만든다.**
 *
 * 총괄 지적: *"임재윤은 마도서처럼 만들려고 했는데, 사실상 현재 상태는 그냥 평범한
 * 박스에다가 테두리 색만 칠한 느낌"*. 맞는 진단이었다. 색을 금색으로 바꿔도
 * 구조가 그대로면 "빛나는 UI 컴포넌트"로 읽힌다.
 *
 * 경로 지도(#301)와 나머지를 실측 비교해 빠진 것을 뽑았다:
 *
 *   양피지 결      repeating-linear-gradient   지도 O / 나머지 X
 *   비대칭 얼룩    radial 4겹, 위치가 제각각    지도 O / 나머지 대각 1개
 *   잉크 번짐      drop-shadow filter          지도 O / 나머지 X
 *   낡은 채도      saturate(0.48)              지도 O / 나머지 0.9
 *   서체          serif 전면                   지도 O / 나머지 sans
 *   그림자        —                            **양쪽 다 `0 0 Npx` 네온 글로우**
 *
 * ⚠️ 마지막이 제일 크다. `box-shadow: 0 0 28px`는 **네온·SF 문법**이다. 종이는
 * 스스로 빛나지 않고 **아래로 그림자를 떨어뜨린다.** 색을 아무리 바꿔도 균일 글로우가
 * 남으면 홀로그램 카드로 읽힌다.
 */
export const UI_MATERIAL = {
  /** 양피지 결 — 비스듬한 미세 줄무늬. 각도를 90의 배수에서 어긋나게 해야 인쇄물이 아니라 종이가 된다 */
  grain: 'repeating-linear-gradient(102deg, transparent 0 54px, rgba(218, 193, 149, 0.014) 55px 56px)',
  /** 얼룩·번짐 — 위치가 대칭이면 그라데이션으로 읽힌다. 서로 다른 구석에 흩는다 */
  stain: [
    'radial-gradient(circle at 12% 22%, rgba(137, 102, 69, 0.10), transparent 31%)',
    'radial-gradient(circle at 88% 74%, rgba(95, 65, 114, 0.12), transparent 36%)',
    'radial-gradient(ellipse at 63% 12%, rgba(155, 112, 65, 0.06), transparent 28%)',
  ].join(', '),
  /** 종이 그림자 — **아래로** 떨어진다. 네온 글로우(0 0)를 이것으로 대체한다 */
  paperShadow: '0 14px 34px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4)',
  /** 들어올린 종이 (호버·선택) */
  paperShadowLift: '0 22px 52px rgba(0, 0, 0, 0.62), 0 3px 10px rgba(0, 0, 0, 0.45)',
  /** 금박 각인 — 발광이 아니라 **얇은 윤곽**. 잉크가 번진 정도로만 */
  gildEdge: 'drop-shadow(0 0 2px rgba(216, 187, 114, 0.5))',
  /** 낡음 — 채도를 깎아야 새 UI로 안 보인다 */
  aged: 'saturate(0.55)',
  /**
   * 모서리 — **네 귀퉁이를 다르게** 준다. 균일한 border-radius는 UI 컴포넌트의 문법이고
   * 손으로 자른 종이는 균일하지 않다. 값 차이는 작게(2~4px) — 크면 만화가 된다.
   */
  deckle: '13px 16px 12px 15px',
  /** 안쪽 장식 괘선 — 필사본 여백선. inset box-shadow로 테두리 없이 선을 넣는다 */
  rule: 'inset 0 0 0 1px rgba(216, 187, 114, 0.14)',
} as const;

export function overlayBaseCss(wrapId: string): string {
  return `
#${wrapId} {
  position: fixed; inset: 0;
  display: grid; place-items: center;
  background: ${UI_COLOR.scrim};
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
  font-family: ${UI_FONT.sans};
  color: ${UI_COLOR.text};
}
#${wrapId}.active { opacity: 1; visibility: visible; }
#${wrapId} .ui-panel {
  /* 재질 먼저, 바탕 나중 — 얼룩·결이 바탕 위에 얹힌다 */
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    ${UI_COLOR.panel};
  border: 1px solid ${UI_COLOR.border};
  border-radius: ${UI_MATERIAL.deckle};
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
}
@media (prefers-reduced-motion: reduce) { #${wrapId} { transition: none; } }
`;
}
