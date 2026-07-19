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
  summarizeRun,
  updateRunMemory,
  longTermResistedElement,
  loadRunMemory,
  saveRunMemory,
} from './runMemory';
export type { RunMemory, RunOutcome, StorageLike } from './runMemory';

// ── ③ 보스 대사 — 프록시 우선, 템플릿 폴백 ──
export { getBossLine, templateBossLine, sanitizeLine, toBossLineRequest } from './bossLine';
export type { BossLine, BossLineRequest } from './bossLine';

// ── ⑤ 진화·융합 작명 (성장 시스템 ④가 소비) — 프록시 우선, 템플릿 폴백, localStorage 캐시 ──
//   진화: getEvolvedName({ kind: 'evolve', baseName, elements }) → 격상 주문명(string)
//   융합: getEvolvedName({ kind: 'fuse', elements: [a, b] }) → 융합 이름(string)
//   동일 요청은 캐시로 같은 이름 재사용(원소 순서 무관). 실패해도 항상 유효한 이름 반환(throw 없음).
export { getEvolvedName, templateEvolvedName, sanitizeName, evolveCacheKey } from './evolveName';
export type { EvolveNameRequest } from './evolveName';
