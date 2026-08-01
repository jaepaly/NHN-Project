import type { ResolvedSpellPlan } from '../spell/sequencePlan';
import {
  EFFECTS,
  ELEMENTS,
  FORMS,
  type SpellEffect,
  type SpellElement,
  type SpellForm,
  type SpellSpec,
} from '../spell/types';

export type DiscoverySignature =
  `${SpellEffect}:${SpellElement}:${SpellElement | 'none'}:${SpellForm}`;

const EFFECT_SET = new Set<string>(EFFECTS);
const ELEMENT_SET = new Set<string>(ELEMENTS);
const FORM_SET = new Set<string>(FORMS);

/** 이름이나 수치가 아닌, 실제 실행된 주문의 의미 구조만 발견 단위로 삼는다. */
export function discoverySignatureFromSpec(spec: SpellSpec): DiscoverySignature {
  return `${spec.effect}:${spec.element_primary}:${spec.element_secondary ?? 'none'}:${spec.form}`;
}

/**
 * 일반 수동 복합 영창에서 실행된 form 행동만 추출한다.
 * wait와 필살영창은 발견 대상이 아니며, 한 영창 안의 같은 행동은 한 번만 센다.
 */
export function discoverySignaturesFromPlan(
  plan: ResolvedSpellPlan,
): DiscoverySignature[] {
  if (plan.castMode !== 'normal') return [];

  const signatures = new Set<DiscoverySignature>();
  for (const sequence of plan.sequences) {
    for (const behavior of sequence.behaviors) {
      if (behavior.type !== 'form') continue;
      signatures.add(discoverySignatureFromSpec(behavior.spec));
    }
  }
  return [...signatures];
}

export function isDiscoverySignature(value: unknown): value is DiscoverySignature {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 4) return false;
  const [effect, primary, secondary, form] = parts;
  return EFFECT_SET.has(effect)
    && ELEMENT_SET.has(primary)
    && (secondary === 'none' || ELEMENT_SET.has(secondary))
    && FORM_SET.has(form);
}
