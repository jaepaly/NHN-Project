import type { SpellForm, SpellSpec } from './types';

/**
 * 자동 각인 가능한 폼의 단일 계약.
 *
 * wall·orbit은 전장에 지속 오브젝트를 남기는 수동 전용 폼이다. 자동 시전하면
 * 설치물이 주기적으로 쌓여 전투 화면과 공간 통제 밸런스를 깨므로 각인에서 제외한다.
 * 주문서 유산도 "Lv1 각인으로 시작"하는 기능이므로 반드시 같은 계약을 따른다.
 */
export function isAutoEngraveForm(form: SpellForm): boolean {
  return form !== 'wall' && form !== 'orbit';
}

export function isAutoEngraveSpell(
  spell: Pick<SpellSpec, 'effect' | 'form'>,
): boolean {
  return spell.effect === 'damage' && isAutoEngraveForm(spell.form);
}
