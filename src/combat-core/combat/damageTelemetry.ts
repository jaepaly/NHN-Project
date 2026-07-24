import { flooredResistMultiplier } from './debuffFloor';

/**
 * 개발용 피해 로그가 전투 엔진의 보스 감쇠 계산과 같은 값을 쓰도록 만드는 순수 계측 함수.
 *
 * `effectivePower`에는 반복·친화·격상·다양성·버프·마나 감쇠가 이미 반영되어 있다.
 * 따라서 보스에게 실제로 적용되는 추가 배수는 전투 경로와 동일하게
 * `flooredResistMultiplier(escalation, rawBossResist)`로 계산해야 한다.
 */
export interface BossDamageTelemetry {
  /** activeBossResistances에 저장된 원시 보스 내성 */
  rawBossResist: number;
  /** 격상×내성 하한을 반영해, 격상 반영 후 power에 실제로 곱하는 배수 */
  appliedBossMultiplier: number;
  /** 원래 power 기준 격상×보스 내성의 최종 합산 배율 */
  combinedDebuff: number;
  /** 보스 감쇠까지 반영한 power 수준의 예상값 */
  finalVsBoss: number;
}

export function bossDamageTelemetry(
  effectivePower: number,
  escalation: number,
  rawBossResist: number,
): BossDamageTelemetry {
  const power = Number.isFinite(effectivePower) ? Math.max(0, effectivePower) : 0;
  const safeEscalation = Number.isFinite(escalation) && escalation > 0 ? escalation : 1;
  const safeRawResist = Number.isFinite(rawBossResist) ? Math.max(0, rawBossResist) : 1;
  const appliedBossMultiplier = flooredResistMultiplier(safeEscalation, safeRawResist);

  return {
    rawBossResist: safeRawResist,
    appliedBossMultiplier,
    combinedDebuff: safeEscalation * appliedBossMultiplier,
    finalVsBoss: Math.round(power * appliedBossMultiplier),
  };
}
