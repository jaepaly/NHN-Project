import { readFileSync } from 'node:fs';
import { rewardGlossaryFor } from '../src/ui/rewardGlossary';

/**
 * 보상 용어 사전 회귀 (총괄 제보 2026-08-06: *"정령이 뭔지, 각인이 뭔지, 친화도가 뭔지"*).
 *
 * 지키는 것 셋:
 *
 *  1. **빈 칸이 없다.** 한 종류라도 사전이 없으면 그 카드에서 패널이 사라져 화면이
 *     덜컥 움직인다. 타입(`Record`)이 컴파일 때 막지만, 값이 빈 문자열인 건 못 막는다.
 *  2. **카드 화면에 실제로 연결돼 있다.** 사전만 있고 `detailPanelFor`를 안 넘기면
 *     아무 데도 안 뜬다 — 파일은 멀쩡한데 기능이 없는 상태가 조용히 만들어진다.
 *  3. **카드 문구와 숫자가 어긋나지 않는다.** 마력 궤적이 "세 번"이라 적으면서 다섯 번
 *     터지고 있었다. 카드의 수와 구현의 수가 다르면 나머지 수치도 신뢰를 잃는다.
 */

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

// 번들 결과가 node_modules/.cache에 떨어지므로 import.meta.url 기준은 어긋난다.
// 다른 회귀 스크립트와 같이 저장소 루트(npm 실행 위치) 기준 상대 경로를 쓴다.
const read = (path: string): string => readFileSync(path, 'utf8');

// ── 1. 모든 종류가 실제 문장을 갖는다 ────────────────────────────────────────
// 카드 종류의 출처는 오버레이의 KIND_LABELS다 — 사전이 그것과 같은 집합을 덮어야 한다.
const overlay = read('src/ui/rewardCardOverlay.ts');
const labelsBlock = overlay.slice(
  overlay.indexOf('const KIND_LABELS'),
  overlay.indexOf('function altarGlyph'),
);
const kinds = [...labelsBlock.matchAll(/^\s*'?([a-z-]+)'?:\s*'/gm)].map((m) => m[1]);
check('KIND_LABELS를 읽었다', kinds.length >= 20, `${kinds.length}종`);

for (const kind of kinds) {
  const text = rewardGlossaryFor({ kind } as Parameters<typeof rewardGlossaryFor>[0]);
  check(`사전: ${kind}`, typeof text === 'string' && text.trim().length >= 20,
    `길이 ${text?.length ?? 0}`);
}

// 패널은 min-height 104px에 14px/1.7 — 너무 길면 카드가 화면 밖으로 밀린다.
for (const kind of kinds) {
  const text = rewardGlossaryFor({ kind } as Parameters<typeof rewardGlossaryFor>[0]);
  check(`사전 길이 상한: ${kind}`, text.length <= 220, `${text.length}자`);
}

// ── 2. 카드 화면에 연결돼 있다 ───────────────────────────────────────────────
const binding = read('src/ui/runUiBinding.ts');
check('전투 보상에 사전 연결', binding.includes('detailPanelFor: rewardGlossaryFor'));

const scene = read('src/scenes/ProtoScene.ts');
check('씬 보상 화면에 사전 연결', (scene.match(/detailPanelFor: rewardGlossaryFor/g) ?? []).length >= 3,
  `${(scene.match(/detailPanelFor: rewardGlossaryFor/g) ?? []).length}곳`);
// 연구 주제 카드는 자기 설명을 쓴다 — 사전으로 덮으면 주제 설명이 사라진다.
check('연구 카드는 자기 detailPanelFor 유지', scene.includes('detailPanelFor: (option) => {'));

// ── 3. 카드 문구가 구현과 맞는다 ─────────────────────────────────────────────
const altar = read('src/combat-core/run/altarOffer.ts');
const trailBursts = /for \(let i = 1; i <= (\d+); i \+= 1\) \{\s*const t = i \/ 6;/.exec(scene);
check('궤적 발동 횟수를 읽었다', trailBursts !== null);
if (trailBursts) {
  const word = ['', '한', '두', '세', '네', '다섯', '여섯'][Number(trailBursts[1])] ?? '';
  const trailCard = /trail: \{ title: '마력 궤적', description: '([^']*)'/.exec(altar)?.[1] ?? '';
  check('궤적 카드 문구 = 구현 횟수', trailCard.includes(`${word} 번`),
    `구현 ${trailBursts[1]}회(${word} 번) / 카드 "${trailCard.split('\\n')[0]}"`);
}

// ── 4. 사전이 카드 설명을 베끼지 않는다 ─────────────────────────────────────
// 사전은 **시스템**을 적고 카드는 **이번 수치**를 적는다. 사전에 방 등급으로 변하는
// 대표값을 박아 두면 카드와 어긋나 보이고, 어긋나면 둘 다 안 믿긴다.
for (const kind of ['affinity', 'max-hp', 'max-mana', 'ward-start', 'spirit-recovery']) {
  const text = rewardGlossaryFor({ kind } as Parameters<typeof rewardGlossaryFor>[0]);
  check(`사전에 고정 수치 없음: ${kind}`, !/[+\d]\d*(\.\d+)?\s*(회복|초마다|점|씩 오른)/.test(text)
    && !/\+\d/.test(text), text.slice(0, 40));
}

if (failures.length > 0) {
  console.error('보상 용어 사전 회귀 실패:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`보상 용어 사전 회귀 통과 — ${kinds.length}종 전부 채움, 연결 4곳, 궤적 문구 일치`);
