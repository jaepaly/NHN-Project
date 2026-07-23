/**
 * 기억하는 보스 — R2 공개 계약 (Phase 3 트랙 2).
 *
 * 총괄 보스 코어·R3 UI는 **이 파일 하나**에서 필요한 타입·함수를 import 한다.
 * (구현은 각 소유 모듈: spellHistory / bossMemory / runMemory / bossLine)
 *
 * 사용 흐름:
 *  - 런 도중: `SpellHistory.record(...)` 로 성공 주문 기록 (R1이 이미 연결)
 *  - 보스방 진입: `computeResistance(history.bossMemory())` → 이번 런 적응(단기, 강)
 *  - 초기 저항: `longTermResistedElement(loadRunMemory())` → 지난 런 기억(장기, 부분)
 *  - 대사: `getBossLine(runMemory)` → 프록시 우선, 실패 시 템플릿 폴백
 *  - 런 종료: `saveRunMemory(updateRunMemory(prev, summarizeRun(history, result)))`
 */

// ── 런 내 주문 기록·요약 (단기 히스토리) ──
export { SpellHistory } from './spellHistory';
export type { SpellHistoryEntry, BossMemoryProfile, JudgeSource } from './spellHistory';

// ── ① 내성 프로필 (단기 적응) — 총괄이 피해·패턴에 적용 ──
export { computeResistance, RESISTANCE } from './bossMemory';
export type { BossResistanceProfile, BossCounterStrategy } from './bossMemory';

// ── ② 런 간 기억 (장기) — 초기 저항·대사 재료 ──
export {
  EMPTY_RUN_MEMORY,
  EMPTY_CURSE_BEHAVIOR,
  summarizeRun,
  updateRunMemory,
  longTermResistedElement,
  loadRunMemory,
  saveRunMemory,
} from './runMemory';
export type { CurseBehaviorMemory, RunMemory, RunOutcome, StorageLike } from './runMemory';

// ── ③ 보스 대사 — 프록시 우선, 템플릿 폴백 ──
export { getBossLine, templateBossLine, sanitizeLine, toBossLineRequest } from './bossLine';
export type { BossLine, BossLineRequest } from './bossLine';

// ── ⑤ 진화·융합 작명 (성장 시스템 ④가 소비) — 프록시 우선, 템플릿 폴백, localStorage 캐시 ──
//   진화: getEvolvedName({ kind: 'evolve', baseName, elements }) → 격상 주문명(string)
//   융합: getEvolvedName({ kind: 'fuse', elements: [a, b] }) → 융합 이름(string)
//   동일 요청은 캐시로 같은 이름 재사용(원소 순서 무관). 실패해도 항상 유효한 이름 반환(throw 없음).
export { getEvolvedName, templateEvolvedName, sanitizeName, evolveCacheKey } from './evolveName';
export type { EvolveNameRequest } from './evolveName';

// ── 런 반복 격상 (#77) — 회차(clears) 기반 격상 프로필 (전투·방·보스가 소비) ──
//   runEscalationProfile(runMemory) → { tier, weakenedElements, weakenMultiplier, gimmicksUnlocked, bossDualResistance }
//   weakenMultiplier: 시전 위력에 적용(과의존 원소 약화) / 플래그: R1·보스가 방기믹·이중저항에 적용
export { runEscalationTier, runEscalationProfile, RUN_ESCALATION_CONFIG } from './runEscalation';
export type { RunEscalationProfile } from './runEscalation';

// ── 다양성 보너스 (당근, #92) — 런 내 반복 억제를 "벌"이 아닌 "다양성 보상"으로 ──
//   diversityBonus(이번 시전, 최근 시전들) → 데미지 배율(≥1.0). basePower 불변, 피해 계산 시 곱함.
//   R2=순수함수 / R1=곱하는 위치·수치 튜닝(세면 maxBonus 낮춤, HP 인플레 금지).
export { diversityBonus, DIVERSITY_CONFIG } from './spellDiversity';
export type { DiversityCast } from './spellDiversity';
