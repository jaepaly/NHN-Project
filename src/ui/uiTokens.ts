/**
 * UI 토큰 — R3 소유 오버레이가 공유하는 색·모서리·폰트·층위 (총괄 지적: "정돈이 안 됐다").
 *
 * 문제였던 것 (실측):
 *  - 폰트: 같은 Noto Serif KR인데 폴백이 4가지(Malgun Gothic·Consolas·Georgia·sans-serif)
 *    → 폰트 로드 실패 시 화면마다 전혀 다른 모습이 된다
 *  - 모서리: 13종(3·5·7·8·9·10·12·13·14·16·50%·999px) — 스케일이 아니라 임의값
 *  - 패널 배경: 7종이 미묘하게 다름(rgba(3,5,16,.9) vs rgba(8,11,28,.92) …)
 *  - z-index: 46이 둘(보스 선택·설정) — 충돌 가능
 *
 * 값은 **새로 만들지 않았다.** 기존에 가장 많이 쓰인 것을 정본으로 승격했다
 * (#7f8aba 11회 · #dfe6ff 9회 · #eef1ff 6회 · #aeb9e8 6회 …). 그래서 이 파일을
 * 적용해도 화면 인상은 그대로고, 흔들리던 변형만 사라진다.
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
  /** 오버레이 뒤 암막 */
  scrim: 'rgba(3, 5, 16, 0.9)',
  /** 패널 바탕 — 기존 rgba(8,11,28,·)의 정본 */
  panel: 'rgba(8, 11, 28, 0.94)',
  /** 패널 테두리 */
  border: '#2f3d76',
  /** 강조 테두리(선택·호버) */
  borderStrong: '#4c66ff',

  /** 제목·가장 밝은 텍스트 */
  textBright: '#eef1ff',
  /** 본문 */
  text: '#dfe6ff',
  /** 보조 */
  textSoft: '#aeb9e8',
  /** 흐린 안내 */
  textMuted: '#7f8aba',
  /** 밝은 배경 위 잉크 (배지 등) */
  ink: '#0a0e22',

  /** 기본 강조 — 링크·수치·선택 표시 */
  accent: '#8fa4ff',
  /** 강조 발광 */
  accentGlow: '#4c66ff',
  /** 긍정(정상·성공) */
  positive: '#72f1b8',
  /** 주의·격상 */
  warm: '#ffd166',
  /** 위험·되돌릴 수 없음 */
  danger: '#ff8fa3',
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
  background: ${UI_COLOR.panel};
  border: 1px solid ${UI_COLOR.border};
  border-radius: ${UI_RADIUS.md};
}
@media (prefers-reduced-motion: reduce) { #${wrapId} { transition: none; } }
`;
}
