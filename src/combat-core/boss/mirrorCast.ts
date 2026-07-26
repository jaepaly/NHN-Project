import type { SpellSpec, SpellForm } from '../../spell/types';
import type { SpellImpact } from '../../render/spellRenderer';
import type { SpellHistory } from '../../spell/spellHistory';
import { bestEntryFromRun, specFromEntry } from '../../spell/grimoire';

/**
 * 미러 캐스트 — 기억 보스가 **플레이어의 주문을 그대로 되돌려 시전**한다 (총괄 발안).
 *
 * 왜: "보스가 기억하고 대응한다"가 셀링 포인트인데, 실제 대응이 내성 수치·패턴
 * 가중치라 화면에서 안 읽혔다(귀속이 2.8초 텍스트 한 줄뿐). 플레이어가 만든 주문이
 * **그 모습 그대로** 자신에게 날아오면, 렌더 동일성 덕에 설명 없이 즉시 읽힌다.
 * castSpell(spellRenderer)이 시전자 중립이라 렌더러는 한 줄도 안 고친다.
 *
 * 대처(플레이어 관점, 설계 규칙 2개):
 *  1) 피해 판정은 **임팩트 시점의 플레이어 위치** — 이동 시간이 있는 폼(bolt/wave/
 *     rain/zone/nova)은 WASD로 피한다. 기존 보스 볼리와 같은 문법.
 *  2) 즉발 폼(beam/slash/chain)은 원리상 이동 회피가 불가라 **텔레그래프 필수**.
 *     예고 문구가 주문명을 호명한다("보스가 『X』를 역영창한다") — 회피 유예 자체가
 *     "네 주문을 기억한다"의 전시가 된다. 표적은 예고 시작 시점에 고정.
 *  어느 쪽이든 세 번째 답이 있다: 예고를 보고 영창(슬로모)을 열어 보호막을 친다.
 */
export const MIRROR_CAST_CONFIG = {
  /**
   * 위력 배수 — 원본 그대로면 즉사급이다(power≈피해, 최대 HP 100, 시연 최강 주문 88).
   * 0.35면 88짜리가 ~31 — 아프지만 즉사 없음. loopDamageScale은 damagePlayer가 곱한다.
   */
  damageScale: 0.35,
  /**
   * 예고 시간(초). 보스 돌진 예고(0.7s)보다 길게 — 처음 보는 상황인 데다,
   * 3겹 연출(비네트·수렴선·수축 링)이 읽히려면 호흡이 필요하다
   * (총괄 피드백 "티가 안 남" 반영: 0.9 → 1.1 + 연출 격상).
   */
  telegraphSeconds: 1.1,
  /**
   * 같은 미러 캐스트가 플레이어를 다시 때릴 수 있기까지의 간격(초).
   * nova 링·zone 틱처럼 임팩트가 여러 번 오는 폼이 한 번에 HP를 갈아버리는 것 방지.
   * (zone 틱 간격보다 길어 지속 폼은 실질 2~3회로 제한된다)
   */
  hitCooldownSeconds: 0.9,
  /** 미러 발동 최소 재료 — 이 위력 미만의 주문뿐이면 미러를 생략한다(밋밋해서 역효과) */
  minPower: 20,
} as const;

/** 즉발 폼 — 이동 시간이 없어 텔레그래프 없이는 회피 불가 */
const INSTANT_FORMS: ReadonlySet<SpellForm> = new Set<SpellForm>(['beam', 'slash', 'chain']);

export function isInstantForm(form: SpellForm): boolean {
  return INSTANT_FORMS.has(form);
}

/**
 * 되돌릴 주문 선정 — 이번 런 최강 damage 주문.
 *
 * bestEntryFromRun(주문서 저장용)을 그대로 쓴다: damage만, 반복 페널티 전
 * basePower 기준. specFromEntry로 복원하므로 실제 플레이어가 도달한 스펙이다 —
 * 별도 선정 로직을 만들면 "네 주문"이라는 약속이 어긋날 수 있다.
 * orbit은 렌더러 switch에 없어 bolt로 폴백되므로(미러의 "그대로"가 깨짐) 제외.
 */
export function pickMirrorSpell(history: SpellHistory): SpellSpec | null {
  const entry = bestEntryFromRun(history, 'lose');
  if (!entry) return null;
  if (entry.power < MIRROR_CAST_CONFIG.minPower) return null;
  if (entry.form === 'orbit') return null;
  return specFromEntry(entry);
}

/**
 * 임팩트가 플레이어에게 닿았는가 — 명중 시점의 플레이어 위치와 대조 (순수).
 *
 * @param playerRadius 플레이어 히트 반경. point 임팩트(bolt 착탄 등)는 자체 반경이
 *        없어 이 값으로만 판정한다.
 */
export function mirrorImpactHitsPlayer(
  impact: SpellImpact,
  playerX: number,
  playerY: number,
  playerRadius: number,
): boolean {
  if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return false;
  const radius = Number.isFinite(playerRadius) ? Math.max(0, playerRadius) : 0;
  switch (impact.kind) {
    case 'point':
      return Math.hypot(impact.x - playerX, impact.y - playerY) <= radius;
    case 'circle':
      return Math.hypot(impact.x - playerX, impact.y - playerY)
        <= impact.radius + radius;
    case 'line': {
      const distance = pointToSegment(
        playerX, playerY, impact.fromX, impact.fromY, impact.toX, impact.toY,
      );
      return distance <= impact.width / 2 + radius;
    }
    default:
      return false;
  }
}

/** 미러 임팩트 1회의 피해량 — 폼별 배분(damageMultiplier)을 존중한다 (순수) */
export function mirrorImpactDamage(spec: SpellSpec, impactMultiplier?: number): number {
  const per = Number.isFinite(impactMultiplier) ? Math.max(0, impactMultiplier as number) : 1;
  return Math.max(0, spec.power) * MIRROR_CAST_CONFIG.damageScale * per;
}

function pointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
