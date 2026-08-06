import { readFileSync } from 'node:fs';

/**
 * 오버레이 활성화 예약 회귀.
 *
 * 완주 QA 자동 구동 중 첫 런 안내에서 재현된 버그를 잠근다: 오버레이를 **뜨기 전에**
 * 닫으면(Enter 연타·키 리피트), 닫는 쪽이 지운 `active`를 60ms 뒤 예약된 활성화가 도로
 * 붙이고, 그 뒤 내용 비우기는 "아직 active네" 하고 지나간다.
 *
 * 결과는 **닫혔는데 화면을 덮고 있는 전체 화면 모달**이다. 리스너는 이미 떼어졌으니 키로도
 * 못 닫고, 그 아래에서 게임은 정상적으로 돌아가고 있어 플레이어에겐 멈춘 것으로 보인다.
 *
 * 네 오버레이가 같은 패턴을 복사해 쓰고 있었다. 다시 복사되는 것을 막기 위해,
 * **날 rAF/setTimeout 쌍을 직접 쓰는 것 자체를** 금지한다.
 */

const OVERLAYS = [
  'src/ui/firstRunTutorial.ts',
  'src/ui/rewardCardOverlay.ts',
  'src/ui/roomChoiceOverlay.ts',
  'src/ui/runSummaryOverlay.ts',
];

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

// ── 헬퍼 자체 ────────────────────────────────────────────────────────────────
const helper = readFileSync('src/ui/overlayActivation.ts', 'utf8');
check('취소가 rAF를 거둔다', helper.includes('cancelAnimationFrame(frame)'));
check('취소가 타이머를 거둔다', helper.includes('window.clearTimeout(timer)'));
// 취소 시점에 이미 큐에 들어간 콜백이 돌 수 있다 — 플래그가 최후 방어선이다.
check('취소가 플래그도 세운다', /cancel\(\): void \{\s*\n(\s*\/\/[^\n]*\n)*\s*settled = true;/.test(helper));
check('한 번만 실행된다', helper.includes('if (settled) return;'));

// ── 네 오버레이 ──────────────────────────────────────────────────────────────
for (const path of OVERLAYS) {
  const src = readFileSync(path, 'utf8');
  const name = path.split('/').pop();

  check(`${name}: 헬퍼를 쓴다`, src.includes('scheduleOverlayActivation('));

  // 날 패턴 금지 — 이게 다시 들어오면 같은 버그가 되살아난다.
  check(`${name}: 날 rAF 활성화 없음`, !src.includes('requestAnimationFrame(activate)'));
  check(`${name}: 날 setTimeout 폴백 없음`, !src.includes('window.setTimeout(activate, 60)'));

  // 닫는 경로가 취소를 거친다.
  check(`${name}: 닫을 때 취소한다`, src.includes('activation?.cancel();'));

  // 진짜 불변식: **`active`를 지우기 전에** 취소한다.
  //
  // "닫는 함수 첫 줄"로 검사하면 안 된다 — 보상 카드의 `finish`는 `isDisabled` 가드로
  // 시작하는 게 맞다(비활성 카드는 아무것도 닫으면 안 된다). 순서만 지키면 된다.
  const cancelAt = src.indexOf('activation?.cancel();');
  const deactivateAt = src.indexOf("classList.remove('active')");
  check(`${name}: active 제거보다 취소가 먼저`, cancelAt >= 0 && cancelAt < deactivateAt,
    `cancel ${cancelAt} / remove ${deactivateAt}`);

  // 선언이 닫는 함수보다 앞에 있어야 참조된다.
  const decl = src.indexOf('let activation:');
  const use = src.indexOf('activation?.cancel();');
  check(`${name}: 선언이 사용보다 앞`, decl >= 0 && decl < use, `decl ${decl} / use ${use}`);
}

if (failures.length > 0) {
  console.error('오버레이 활성화 회귀 실패:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`오버레이 활성화 회귀 통과 — 헬퍼 4항 · 오버레이 ${OVERLAYS.length}종 각 6항`);
