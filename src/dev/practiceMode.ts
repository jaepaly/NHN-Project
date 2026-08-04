/** 개발 빌드 전용 피해 연습실의 순수 요청 상태와 허수아비 수치. */
export const PRACTICE_DUMMY_CONFIG = {
  /** 기본 기억 보스와 같은 기준 체력이라 피해 숫자 강조 단계도 실전과 비슷하다. */
  maxHp: 450,
  /** 처치되지 않는 대신 천천히 회복해 장시간 같은 대상을 반복 측정할 수 있다. */
  regenerationPerSecond: 90,
} as const;

let practiceRunRequested = false;

export function requestPracticeRun(): void {
  practiceRunRequested = true;
}

/** 타이틀에서 보낸 요청을 한 번만 소비한다. */
export function consumePracticeRunRequest(): boolean {
  const requested = practiceRunRequested;
  practiceRunRequested = false;
  return requested;
}
