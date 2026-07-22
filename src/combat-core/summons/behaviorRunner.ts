import type { SummonBehavior, SummonMoveStep } from '../../spell/summonBehavior';
import { BEHAVIOR_LIMITS } from '../../spell/summonBehavior';

/**
 * 소환수 행동 프로그램 해석기 (L3, #101) — 검증된 DSL의 스텝 시퀀스를 프레임 단위
 * 이동으로 실행한다. Phaser 비의존(순수)이라 회귀로 고정 가능.
 *
 * 표적이 없을 때: chase/dash/zigzag/retreat는 플레이어 기준으로 폴백해
 * "행동이 갑자기 멈추는" 어색함을 피한다.
 */

export interface BehaviorPoint { x: number; y: number }

export class SummonBehaviorRunner {
  private stepIndex = 0;
  private stepElapsed = 0;
  private zigzagPhase = 0;
  private orbitAngle = -Math.PI / 2;
  private finished = false;

  constructor(private readonly behavior: SummonBehavior) {}

  /** 현재 스텝 (finished면 마지막 스텝 유지) */
  private currentStep(): SummonMoveStep {
    return this.behavior.steps[Math.min(this.stepIndex, this.behavior.steps.length - 1)];
  }

  /** 다음 위치 계산. deltaSeconds만큼 현재 스텝을 실행하고 필요 시 다음 스텝으로 넘어간다. */
  advance(
    deltaSeconds: number,
    pos: BehaviorPoint,
    player: BehaviorPoint,
    target: BehaviorPoint | null,
  ): BehaviorPoint {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (!this.finished) {
      this.stepElapsed += delta;
      const step = this.currentStep();
      if (this.stepElapsed >= step.seconds) {
        this.stepElapsed = 0;
        this.stepIndex += 1;
        if (this.stepIndex >= this.behavior.steps.length) {
          if (this.behavior.loop) this.stepIndex = 0;
          else { this.stepIndex = this.behavior.steps.length - 1; this.finished = true; }
        }
      }
    }

    const step = this.currentStep();
    const speed = step.speed ?? BEHAVIOR_LIMITS.defaultSpeed;
    const anchor = target ?? player; // 표적 없으면 플레이어 기준 폴백

    switch (step.kind) {
      case 'hold':
        return pos;
      case 'orbit': {
        const radius = step.radius ?? BEHAVIOR_LIMITS.defaultRadius;
        this.orbitAngle += (speed / Math.max(1, radius)) * delta;
        return {
          x: player.x + Math.cos(this.orbitAngle) * radius,
          y: player.y + Math.sin(this.orbitAngle) * radius,
        };
      }
      case 'chase':
      case 'dash':
        return this.moveToward(pos, anchor, speed * (step.kind === 'dash' ? 1.6 : 1) * delta);
      case 'retreat': {
        const away = { x: pos.x * 2 - anchor.x, y: pos.y * 2 - anchor.y };
        return this.moveToward(pos, away, speed * delta);
      }
      case 'zigzag': {
        const amplitude = step.amplitude ?? BEHAVIOR_LIMITS.defaultAmplitude;
        this.zigzagPhase += delta * 9;
        const dx = anchor.x - pos.x;
        const dy = anchor.y - pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const fx = dx / len; const fy = dy / len;         // 전진 방향
        const px = -fy; const py = fx;                     // 수직 방향
        const wobble = Math.cos(this.zigzagPhase) * amplitude * delta * 6;
        const forward = speed * delta;
        return { x: pos.x + fx * forward + px * wobble, y: pos.y + fy * forward + py * wobble };
      }
      default:
        return pos;
    }
  }

  private moveToward(pos: BehaviorPoint, to: BehaviorPoint, maxDistance: number): BehaviorPoint {
    const dx = to.x - pos.x;
    const dy = to.y - pos.y;
    const len = Math.hypot(dx, dy);
    if (len <= maxDistance || len === 0) return { x: to.x, y: to.y };
    return { x: pos.x + (dx / len) * maxDistance, y: pos.y + (dy / len) * maxDistance };
  }
}
