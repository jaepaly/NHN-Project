import type { FormBehavior, ResolvedSpellPlan } from './sequencePlan';
import type { SpellSpec } from './types';

/**
 * R1 prototype policy for handing a composite incantation to R3's v1 engrave
 * system, which stores exactly one SpellSpec.
 *
 * - movement, wait, control, sustain and self effects do not become free damage
 * - wall/orbit retain the existing v1 engrave exclusion
 * - one representative form receives the pooled eligible damage budget, so
 *   sequence allocation and ENGRAVE_CONFIG.powerScale do not dilute power twice
 * - equal-power candidates prefer the later finisher
 */
export function sequenceEngraveCandidate(plan: ResolvedSpellPlan): SpellSpec | null {
  const eligible = plan.sequences.flatMap((sequence) => (
    sequence.behaviors.filter((behavior): behavior is FormBehavior => (
      behavior.type === 'form'
      && behavior.spec.effect === 'damage'
      && behavior.spec.form !== 'wall'
      && behavior.spec.form !== 'orbit'
      && behavior.spec.power > 0
    ))
  ));
  if (eligible.length === 0) return null;

  let representative = eligible[0];
  for (const behavior of eligible.slice(1)) {
    if (behavior.spec.power >= representative.spec.power) representative = behavior;
  }
  const pooledPower = Math.min(
    plan.power,
    eligible.reduce((sum, behavior) => sum + behavior.spec.power, 0),
  );
  return {
    ...representative.spec,
    name: `${plan.name} · ${representative.spec.name}`,
    status: [...representative.spec.status],
    power: pooledPower,
    cost: 0,
    flavor: `시퀀스 각인 투영 · ${eligible.length}개 공격 power 합산`,
  };
}
