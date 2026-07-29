import Phaser from 'phaser';
import type { AwakeningKind } from '../combat-core/run/awakening';
import type { SpellElement } from '../spell/types';
import { ELEMENT_PALETTES } from './palette';

/**
 * 각성 인장 — 각성한 원소로 영창할 때 시전자 발치에 잠깐 새겨지는 표식.
 *
 * ⚠️ **밝기를 더 올리지 않는다.** 친화 VFX 강도는 각성 임계(1.2)에서 이미 상한(8)이고,
 * #220에서 가산 발광 중첩을 광과민성 위험으로 보고 예산까지 넣었다. 그래서 각성은
 * "더 밝게"가 아니라 **형태를 추가**해서 구분한다 — 선만 쓰고(채우지 않음), 알파는
 * 낮게, 수명은 짧게. 밝기 예산을 안 쓰고도 "달라졌다"가 읽힌다.
 *
 * 세 갈래가 형태로 갈린다:
 *   작열 — 링 바깥으로 뻗는 갈퀴 (타오른다)
 *   연환 — 링에 이어 붙은 작은 링 (사슬)
 *   낙인 — 링 안의 십자 (표식이 찍힌다)
 */

export const SIGIL = {
  radius: 34,
  lineWidth: 2,
  /** 최고 알파 — ADD 블렌드를 쓰지 않으므로 이 값이 곧 체감 밝기다 */
  alpha: 0.85,
  durationMs: 420,
  /** 등장 배율 → 1.15까지 퍼지며 사라진다 */
  scaleFrom: 0.7,
  scaleTo: 1.15,
  /** 전투 개체(0)보다 아래, 바닥 데칼(-1.5)보다 위 — 발치에 새겨진 인장 */
  depth: -1,
} as const;

/** 각성 인장을 그린다. 순수 연출이라 판정·위력과 무관하다. */
export function playAwakeningSigil(
  scene: Phaser.Scene,
  x: number,
  y: number,
  element: SpellElement,
  kind: AwakeningKind,
): void {
  const color = ELEMENT_PALETTES[element].core;
  const g = scene.add.graphics().setDepth(SIGIL.depth).setAlpha(SIGIL.alpha);
  g.lineStyle(SIGIL.lineWidth, color, 1);
  const r = SIGIL.radius;

  g.strokeCircle(0, 0, r);
  if (kind === 'searing') {
    // 갈퀴 6개 — 링 바깥으로 짧게 뻗는다
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI * 2 * i) / 6;
      g.lineBetween(
        Math.cos(a) * r, Math.sin(a) * r,
        Math.cos(a) * (r + 10), Math.sin(a) * (r + 10),
      );
    }
  } else if (kind === 'chaining') {
    // 이어 붙은 작은 링 — 폼 글리프의 chain 어휘와 같은 형태
    g.strokeCircle(r * 0.82, 0, r * 0.42);
  } else {
    // 낙인 — 링 안의 십자(과녁)
    g.lineBetween(-r * 0.5, 0, r * 0.5, 0);
    g.lineBetween(0, -r * 0.5, 0, r * 0.5);
  }

  g.setPosition(x, y).setScale(SIGIL.scaleFrom);
  scene.tweens.add({
    targets: g,
    scale: SIGIL.scaleTo,
    alpha: 0,
    duration: SIGIL.durationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });
}
