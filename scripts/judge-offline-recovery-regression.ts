import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { JudgeOptions, SpellJudge } from '../src/spell/judge';
import { MockJudge } from '../src/spell/mockJudge';
import { OFFLINE_FALLBACK_THRESHOLD, RunRecoveryJudge } from '../src/spell/runRecoveryJudge';
import type { SpellJudgement } from '../src/spell/types';

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  constructor() {
    this.promise = new Promise((resolve) => { this.resolvePromise = resolve; });
  }
  resolve(value: T): void { this.resolvePromise(value); }
}

class ScriptedRemote implements SpellJudge {
  readonly name = 'ScriptedRemote';
  lastSource: string | undefined;
  lastFallbackReason: string | undefined;
  judgeCalls = 0;
  probeCalls = 0;
  probe = new Deferred<boolean>();
  private readonly result = new MockJudge();

  constructor(private readonly sources: string[]) {}

  async judge(text: string, options?: JudgeOptions): Promise<SpellJudgement> {
    this.judgeCalls += 1;
    this.lastSource = this.sources.shift() ?? 'gemini';
    this.lastFallbackReason = this.lastSource === 'fallback' ? 'timeout' : undefined;
    return this.result.judge(text, options);
  }

  probeRemote(): Promise<boolean> {
    this.probeCalls += 1;
    return this.probe.promise;
  }
}

const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };
const mock = new MockJudge();

assert.equal(OFFLINE_FALLBACK_THRESHOLD, 2);

// 1) 두 영창이 최종 fallback으로 끝난 뒤에만 오프라인 우선 모드로 전환한다.
const remote = new ScriptedRemote(['fallback', 'fallback']);
const judge = new RunRecoveryJudge(remote, mock);
await judge.judge('화염 화살');
assert.equal(judge.offlineMode, false);
await judge.judge('얼음 창');
assert.equal(judge.offlineMode, true);
assert.equal(remote.judgeCalls, 2, '영창 내부 재시도 수와 무관하게 최종 fallback 영창만 센다');

// 2) 오프라인 상태에서는 로컬 결과를 즉시 반환하고 실제 원격 probe는 하나만 띄운다.
const offlineResult = await judge.judge('번개 폭풍');
assert.equal(offlineResult.disposition, 'cast');
assert.equal(judge.lastSource, 'mock');
assert.equal(remote.judgeCalls, 2, '오프라인 영창은 일반 원격 judge를 기다리지 않는다');
assert.equal(remote.probeCalls, 1);
await judge.judge('돌의 파도');
assert.equal(remote.probeCalls, 1, '진행 중인 복구 요청은 중복 생성하지 않는다');

// 3) 성공 응답은 이미 실행한 주문을 바꾸지 않고 다음 영창부터 원격 판정을 복구한다.
remote.probe.resolve(true);
await flush();
assert.equal(judge.offlineMode, false);
await judge.judge('빛의 창');
assert.equal(remote.judgeCalls, 3);
assert.equal(judge.lastSource, 'gemini');

// 4) 정상·캐시·로컬 판정은 연속 fallback을 끊는다.
for (const interruptingSource of ['gemini', 'cache', 'local']) {
  const interrupted = new RunRecoveryJudge(
    new ScriptedRemote(['fallback', interruptingSource, 'fallback']),
    mock,
  );
  await interrupted.judge('첫 주문');
  await interrupted.judge('중간 주문');
  await interrupted.judge('마지막 주문');
  assert.equal(interrupted.offlineMode, false, `${interruptingSource}가 연속 fallback을 끊어야 한다`);
}

// 5) 실패한 probe 뒤 다음 영창에서 재시도한다.
const failingRemote = new ScriptedRemote(['fallback', 'fallback']);
const failing = new RunRecoveryJudge(failingRemote, mock);
await failing.judge('첫 주문');
await failing.judge('둘째 주문');
await failing.judge('셋째 주문');
failingRemote.probe.resolve(false);
await flush();
assert.equal(failing.offlineMode, true);
failingRemote.probe = new Deferred<boolean>();
await failing.judge('넷째 주문');
assert.equal(failingRemote.probeCalls, 2);

// 6) 런 리셋은 오프라인 상태를 해제하고 이전 런의 늦은 probe 결과를 무시한다.
const resetRemote = new ScriptedRemote(['fallback', 'fallback', 'fallback']);
const resetJudge = new RunRecoveryJudge(resetRemote, mock);
await resetJudge.judge('첫 주문');
await resetJudge.judge('둘째 주문');
await resetJudge.judge('셋째 주문');
assert.equal(resetJudge.offlineMode, true);
resetJudge.resetRun();
assert.equal(resetJudge.offlineMode, false);
resetRemote.probe.resolve(true);
await flush();
await resetJudge.judge('새 런 첫 주문');
assert.equal(resetJudge.offlineMode, false, '이전 런 probe가 새 런 카운터를 변경하지 않는다');

// 7) UI와 실제 Gemini 복구 probe가 배선되어 있어야 한다.
const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const geminiSource = readFileSync('src/spell/geminiJudge.ts', 'utf8');
assert.match(sceneSource, /오프라인 판정 · 연결 확인 중/);
assert.match(sceneSource, /this\.judge\.resetRun\?\.\(\)/);
assert.match(geminiSource, /async probeRemote/);
assert.match(geminiSource, /fetchWithFastRetry/);

console.log('judge offline recovery regression: 임계치·즉시로컬·단일probe·자동복구·연속성·실패재시도·런리셋·UI배선 8군 통과');
