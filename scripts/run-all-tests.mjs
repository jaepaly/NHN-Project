#!/usr/bin/env node
/**
 * 회귀 전체 러너 — `npm test` / CI 진입점.
 *
 * 왜 목록을 하드코딩하지 않는가: 이 러너의 존재 이유가 "빠뜨림 방지"인데 목록을
 * 손으로 관리하면 새 스위트를 추가하고 여기 등록을 잊는 순간 조용히 빠진다.
 * package.json의 `test:*`를 **전부 자동으로** 긁어 돈다 — 스크립트를 추가하면
 * 아무것도 안 해도 CI가 집는다.
 *
 * 실패해도 즉시 멈추지 않고 끝까지 돌린 뒤 모아서 보고한다. CI에서 한 번 돌려
 * 깨진 걸 다 보는 편이, 하나 고치고 다시 밀어 다음 걸 보는 것보다 빠르다.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const suites = Object.keys(pkg.scripts ?? {}).filter((k) => k.startsWith('test:')).sort();

if (suites.length === 0) {
  console.error('실행할 test:* 스크립트가 없다 — package.json을 확인하라');
  process.exit(1);
}

// GitHub 러너는 코어가 적다. esbuild+node를 무제한으로 띄우면 오히려 느려진다.
const LIMIT = Number(process.env.TEST_CONCURRENCY) || 4;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** 한 스위트 실행 — 절대 throw하지 않고 결과 객체로 돌려준다 */
function runSuite(name) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    execFile(
      npm,
      ['run', name, '--silent'],
      { cwd: root, shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          name,
          ok: !error,
          ms: Date.now() - startedAt,
          // 실패했을 때만 쓰지만, 성공 로그의 마지막 줄(N군 통과)은 요약에 쓴다
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });
}

const lastLine = (text) => text.trimEnd().split('\n').pop() ?? '';

async function main() {
  console.log(`회귀 ${suites.length}종 실행 (동시 ${LIMIT})\n`);
  const results = [];
  let next = 0;

  const worker = async () => {
    while (next < suites.length) {
      const name = suites[next];
      next += 1;
      const r = await runSuite(name);
      results.push(r);
      const mark = r.ok ? '✓' : '✗';
      const detail = r.ok ? lastLine(r.stdout) : '실패';
      console.log(`${mark} ${name.padEnd(22)} ${String(r.ms).padStart(6)}ms  ${detail}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(LIMIT, suites.length) }, worker));

  const failed = results.filter((r) => !r.ok).sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\n${'─'.repeat(60)}`);

  if (failed.length === 0) {
    console.log(`회귀 ${results.length}종 전부 통과`);
    return;
  }

  // 실패 출력은 마지막에 몰아서 — 스크롤 위로 올라가 묻히지 않게
  for (const r of failed) {
    console.log(`\n▼ ${r.name}`);
    const body = (r.stdout + r.stderr).trimEnd();
    console.log(body ? body.split('\n').slice(-40).join('\n') : '(출력 없음)');
  }
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`실패 ${failed.length}/${results.length}: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

main().catch((error) => {
  console.error('러너 자체가 실패했다:', error);
  process.exit(1);
});
