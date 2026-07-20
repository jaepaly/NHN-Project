/**
 * Track B(#53) 시전 경제 모드 스위치.
 * - 기본('mana'): 현행 — 마나 소모 + 고정 쿨다운.
 * - 'cooldown': 실험 — 마나 없음 + 위력 비례 쿨다운.
 * 개발/데모에서 `VITE_CAST_ECONOMY=cooldown` 으로 A/B 전환한다.
 */
export type CastEconomyMode = 'mana' | 'cooldown';

export function castEconomyMode(): CastEconomyMode {
  return import.meta.env?.VITE_CAST_ECONOMY === 'cooldown' ? 'cooldown' : 'mana';
}
