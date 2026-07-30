import Phaser from 'phaser';

/**
 * VFX 밝기 — **이펙트만** 어둡게 하는 축 (팀 의견: "이펙트가 너무 밝다").
 *
 * ## 화면 밝기와 다른 것
 *
 * 기존 `brightness`(gameSettings)는 월드 위에 검은 막을 씌운다(`brightnessVeil`,
 * 깊이 98). 그래서 이펙트를 낮추려고 내리면 **배경 아트와 적 스프라이트까지** 같이
 * 어두워진다 — 적이 안 보이는 건 접근성 개선이 아니라 새 문제다.
 *
 * 이 축은 시전 연출이 만드는 GameObject의 알파만 곱한다. 배경·적·HUD는 그대로다.
 *
 * ## 왜 생성 직후에 곱하는가
 *
 * 시전 연출은 `castSpell`(9개 폼)과 `playAffinityImpactFlourish`(원소 8종)에서
 * 각자 Graphics·파티클을 만든다. 알파 지정 지점이 31곳, 트윈이 29개라 전부 손대는
 * 것은 프리즈 앞에서 위험하다.
 *
 * 대신 **진입점 두 곳에서 새로 생긴 객체만 골라** 알파를 곱한다. 실측 근거가 있다:
 * 알파를 건드리는 트윈 17개가 **전부 0으로 페이드아웃**한다. 시작 알파를 줄이면
 * 수명 내내 줄어든 채로 남는다.
 *
 * ⚠️ 예외는 `alpha: { from: ... }`으로 **시작값을 명시하는 트윈 3건**이다. 그건
 * 생성 시점 알파를 덮어쓰므로 그 자리에서 직접 곱해야 한다(spellRenderer 참조).
 * 파티클 이미터의 `alpha: { start, end }`도 같은 이유로 직접 곱한다.
 *
 * ## 정보인 VFX는 건드리지 않는다
 *
 * 보스 위험구역 예고처럼 "장식이 아니라 정보"인 연출은 이 축 밖이다 — 흐려지면
 * 피할 수 없다. 그래서 씬이 직접 만드는 텔레그래프·필드는 진입점을 지나지 않는다.
 */

export const VFX_BRIGHTNESS_CONFIG = {
  /**
   * 하한 0.3 — 0으로 두면 이펙트가 아예 안 보여 "무엇이 맞았는지" 판단이 불가능해진다.
   * 밝기가 아니라 **가독성**이 무너지는 지점이라 완전 소거는 허용하지 않는다.
   */
  min: 0.3,
  max: 1,
} as const;

let scale = 1;

/** 현재 배율 (0.3~1). 렌더 모듈이 알파를 직접 곱할 때 쓴다. */
export function vfxBrightness(): number {
  return scale;
}

export function setVfxBrightness(value: number): void {
  scale = clampVfxBrightness(value);
}

export function clampVfxBrightness(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(
    VFX_BRIGHTNESS_CONFIG.max,
    Math.max(VFX_BRIGHTNESS_CONFIG.min, value),
  );
}

/** 알파 하나에 배율을 적용 — 시작값을 명시하는 트윈·이미터가 직접 부른다 */
export function scaledAlpha(alpha: number): number {
  return Number.isFinite(alpha) ? alpha * scale : alpha;
}

/**
 * 콜백이 만든 GameObject의 알파에 배율을 적용한다 (순수하지 않음 — 씬을 읽는다).
 *
 * 표시 목록을 앞뒤로 비교해 **새로 생긴 것만** 고른다. 기존 객체(배경·적·HUD)는
 * 건드리지 않으므로 반복 호출해도 알파가 누적으로 줄지 않는다.
 *
 * 배율이 1이면 목록 비교조차 하지 않는다 — 기본 설정에서 비용이 0이어야 한다.
 */
export function withVfxBrightness(scene: Phaser.Scene, run: () => void): void {
  if (scale >= 1) { run(); return; }
  const list = scene.children?.list;
  if (!list) { run(); return; }
  const before = new Set(list);
  run();
  for (const child of list) {
    if (before.has(child)) continue;
    const target = child as Phaser.GameObjects.GameObject & { alpha?: number };
    if (typeof target.alpha === 'number') target.alpha *= scale;
  }
}
