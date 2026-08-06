import Phaser from 'phaser';
import { BOSS_PULL_FX } from './bossPullFieldConfig';

/**
 * 보스 중력 인력 연출 (총괄 제보 2026-08-06: *"보스가 유저를 끌어당길 때도 뭔가
 * 이펙트가 있어야 할 거 같음."*).
 *
 * 종전엔 시스템 메시지 한 줄과 효과음뿐이었다 — `castBossPull`에 `add.*` 호출이
 * **하나도 없었다.** 화면에서는 아무 일도 안 일어나는데 플레이어만 보스 쪽으로 끌려간다.
 * "내가 왜 움직이지"가 되고, 조작이 고장 난 것처럼 읽힌다.
 *
 * ## 두 국면을 다르게 그린다
 *
 * 인력은 **예고 0.6초 → 흡인 1.6초** 구조다. 두 국면이 같아 보이면 예고의 의미가 없다:
 *
 *  - **예고** — 바깥에서 보스로 **조여드는 링**. "지금 뭔가 모이고 있다"를 말한다.
 *    아직 안 끌리므로 벗어날 시간이라는 신호다
 *  - **흡인** — 보스를 향해 **안쪽으로 흐르는 선**이 주기적으로 생긴다. 실제로 끌리는
 *    동안만 나오므로 화면의 움직임과 몸의 움직임이 일치한다
 *
 * ## 왜 선인가
 *
 * 방향이 있는 힘이라 방향을 가진 형태여야 한다. 원·파티클은 "여기 뭔가 있다"까지만
 * 말하고 어디로 끌리는지는 말하지 않는다. 선은 시작점과 끝점이 있어 **보스가 원점**임을
 * 한 컷에 보여준다.
 *
 * ⚠️ 보스 패턴 예고는 광량 예산(#220)에서 면제된다 — 위험 구역은 장식이 아니라
 * **정보**라 항상 최대 밝기를 쓴다(다른 보스 예고와 같은 규칙). 다만 흡인 선은
 * 1.6초 동안 반복되므로 **가늘게(2px) 짧게(320ms)** 유지한다.
 */

export { BOSS_PULL_FX } from './bossPullFieldConfig';

/**
 * 예고 — 바깥에서 보스로 조여드는 링 두 겹.
 *
 * 두 겹인 이유는 속도차로 "빨려든다"를 만들기 위해서다. 한 겹이면 단순한 축소 원이라
 * 무엇이 다가오는지 읽히지 않는다.
 *
 * @param seconds 예고 길이 — 링이 이 시간에 맞춰 닫힌다. 기계 수치와 어긋나면
 *   "링이 닫혔는데 아직 안 끌린다"가 되어 예고가 거짓말이 된다.
 */
export function playBossPullTelegraph(
  scene: Phaser.Scene,
  x: number,
  y: number,
  seconds: number,
): void {
  const durationMs = Math.max(120, seconds * 1000);
  for (let layer = 0; layer < 2; layer += 1) {
    const ring = scene.add.circle(x, y, BOSS_PULL_FX.telegraphStartRadius, 0x000000, 0)
      .setStrokeStyle(layer === 0 ? 3 : 1.5, BOSS_PULL_FX.color, layer === 0 ? 0.85 : 0.45)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    const state = { r: BOSS_PULL_FX.telegraphStartRadius };
    scene.tweens.add({
      targets: state,
      r: BOSS_PULL_FX.telegraphEndRadius,
      duration: durationMs * (layer === 0 ? 1 : 0.78),
      ease: 'Quad.easeIn',
      onUpdate: () => ring.setRadius(state.r),
      onComplete: () => ring.destroy(),
    });
  }
}

/**
 * 흡인 — 보스를 향해 안쪽으로 흐르는 짧은 선 몇 개.
 *
 * 각도를 난수로 흩되 **길이는 거리에 비례**시켜, 멀리서 시작한 선이 더 길게 흐르게 한다.
 * 균일한 길이면 방사형 무늬로 보이고 흐름이 안 읽힌다.
 */
export function spawnBossPullStreaks(
  scene: Phaser.Scene,
  x: number,
  y: number,
): void {
  for (let i = 0; i < BOSS_PULL_FX.streakCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const from = BOSS_PULL_FX.streakInnerRadius
      + Math.random() * (BOSS_PULL_FX.streakOuterRadius - BOSS_PULL_FX.streakInnerRadius);
    const to = from * 0.45;
    const line = scene.add.line(
      0, 0,
      x + Math.cos(angle) * from, y + Math.sin(angle) * from,
      x + Math.cos(angle) * to, y + Math.sin(angle) * to,
      BOSS_PULL_FX.color, 0.8,
    ).setOrigin(0, 0).setLineWidth(2).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: line,
      alpha: 0,
      duration: BOSS_PULL_FX.streakMs,
      ease: 'Quad.easeIn',
      onComplete: () => line.destroy(),
    });
  }
}
