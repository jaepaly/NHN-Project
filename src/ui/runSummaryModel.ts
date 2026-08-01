import type { DiscoverySignature } from '../meta/discoverySignature';
import type { MetaUnlockId } from '../meta/metaRunSummary';
import { ELEMENT_LABELS, FORM_LABELS } from '../render/palette';
import type { SpellEffect, SpellElement, SpellForm } from '../spell/types';

const EFFECT_LABELS: Record<SpellEffect, string> = {
  damage: '피해',
  heal: '회복',
  shield: '보호막',
  buff: '강화',
  control: '제어',
  summon: '소환',
};

export const META_UNLOCK_LABELS: Record<MetaUnlockId, string> = {
  'basic-research': '기본 연구',
  'expanded-research': '확장 연구',
  'forbidden-research': '금기 연구',
  'advanced-records': '고급 연구 기록',
};

export function discoverySignatureLabel(signature: DiscoverySignature): string {
  const [effect, primary, secondary, form] = signature.split(':') as [
    SpellEffect,
    SpellElement,
    SpellElement | 'none',
    SpellForm,
  ];
  const elements = secondary === 'none'
    ? ELEMENT_LABELS[primary]
    : `${ELEMENT_LABELS[primary]}+${ELEMENT_LABELS[secondary]}`;
  return `${elements} · ${FORM_LABELS[form]} · ${EFFECT_LABELS[effect]}`;
}

export function representativeBuildLabel(
  element: SpellElement | null,
  form: SpellForm | null,
): string {
  if (element && form) return `${ELEMENT_LABELS[element]} ${FORM_LABELS[form]}술사`;
  if (element) return `${ELEMENT_LABELS[element]} 중심`;
  if (form) return `${FORM_LABELS[form]} 중심`;
  return '아직 형성되지 않음';
}
