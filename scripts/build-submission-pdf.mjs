// 제출물 md → PDF 변환기 (③⑤ 등 한글 문서용)
//
// 사용:  node scripts/build-submission-pdf.mjs docs/SUBMISSION_ROLES.md [out.pdf]
//
// 경로: md → (자체 미니 변환기) HTML → Chrome headless --print-to-pdf.
// reportlab 대신 Chrome을 쓰는 이유: 한글(말군고딕)·표 레이아웃을 브라우저 엔진이
// 그대로 처리해서 폰트 등록·셀 줄바꿈 문제가 아예 없다. 외부 npm 의존성 0.
//
// 지원 문법(제출 문서가 실제로 쓰는 것만): 제목 #~####, 표, 목록(-, 중첩 2칸),
// 인용 >, 코드펜스 ```, 인라인 **굵게**·*기울임*·`코드`, 링크, 수평선 ---.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const [, , srcArg, outArg] = process.argv;
if (!srcArg) {
  console.error('사용: node scripts/build-submission-pdf.mjs <입력.md> [출력.pdf]');
  process.exit(1);
}
const srcPath = resolve(srcArg);
const outPath = resolve(outArg ?? srcArg.replace(/\.md$/i, '.pdf'));
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('Chrome/Edge를 찾지 못했다 — CHROME_CANDIDATES에 경로를 추가하라.');
  process.exit(1);
}

// ── 인라인 문법 ──────────────────────────────────────────────────────
const escapeHtml = (s) => s
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // 이미지가 링크보다 **먼저** — `!` 접두를 못 보면 `[alt](src)`로 잡혀 링크가 된다.
    // src는 md 파일 기준 상대 경로다(HTML을 같은 디렉터리에 쓰므로 그대로 동작).
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * 내부 전용 구간 제거.
 *
 * md는 팀 작업 문서라 버전 이력·갱신분·확정 전 체크리스트를 안고 있다. 그건 우리가
 * 읽는 것이지 심사위원이 읽을 것이 아니다. `<!-- pdf:skip -->` ~ `<!-- /pdf:skip -->`
 * 사이를 통째로 걷어내 **한 파일로 작업본과 제출본을 동시에** 유지한다.
 * (문서를 둘로 쪼개면 반드시 한쪽만 갱신되는 날이 온다)
 */
function stripInternal(md) {
  return md
    .replace(/<!--\s*pdf:skip\s*-->[\s\S]*?<!--\s*\/pdf:skip\s*-->\n?/g, '')
    // 남은 HTML 주석(작업 TODO 등)도 걷어낸다 — escapeHtml이 `<!--`를 `&lt;!--`로
    // 바꿔 버려서, 안 지우면 주석이 본문에 그대로 인쇄된다.
    .replace(/<!--[\s\S]*?-->/g, '');
}

// ── 블록 변환 ────────────────────────────────────────────────────────
function mdToHtml(md) {
  const lines = stripInternal(md).replaceAll('\r\n', '\n').split('\n');
  const out = [];
  let i = 0;
  const listStack = [];   // 중첩 목록 깊이 추적

  const closeLists = (depth = 0) => {
    while (listStack.length > depth) { out.push('</ul>'); listStack.pop(); }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {            // 코드펜스
      closeLists();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre>${escapeHtml(buf.join('\n'))}</pre>`);
      continue;
    }

    const h = line.match(/^(#{1,4}) (.+)$/);  // 제목
    if (h) {
      closeLists();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i += 1; continue;
    }

    if (/^---+\s*$/.test(line)) { closeLists(); out.push('<hr>'); i += 1; continue; }

    if (line.startsWith('|')) {              // 표 (다음 줄이 구분선일 때만)
      closeLists();
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i += 1; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const header = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push('<table><thead><tr>'
        + header.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    if (line.startsWith('>')) {              // 인용 (연속 병합)
      closeLists();
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(inline(lines[i].replace(/^>\s?/, '')));
        i += 1;
      }
      out.push(`<blockquote>${buf.join('<br>')}</blockquote>`);
      continue;
    }

    const li = line.match(/^(\s*)- (.+)$/);   // 목록 (2칸 들여쓰기 = 1중첩)
    if (li) {
      const depth = Math.floor(li[1].length / 2) + 1;
      while (listStack.length < depth) { out.push('<ul>'); listStack.push(1); }
      closeLists(depth);
      out.push(`<li>${inline(li[2])}</li>`);
      i += 1; continue;
    }

    if (line.trim() === '') { closeLists(); i += 1; continue; }

    closeLists();
    out.push(`<p>${inline(line)}</p>`);
    i += 1;
  }
  closeLists();
  return out.join('\n');
}

// ── HTML 셸 (제출용 인쇄 스타일) ─────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 10.5pt; line-height: 1.55;
         color: #1a1a2e; margin: 0; }
  h1 { font-size: 19pt; border-bottom: 2.5px solid #2a2a4a; padding-bottom: 6px; margin: 0 0 10px; }
  h2 { font-size: 14pt; border-bottom: 1px solid #c9c9d9; padding-bottom: 3px;
       margin: 18px 0 8px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14px 0 6px; page-break-after: avoid; }
  p { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.5pt;
          page-break-inside: avoid; }
  th { background: #eef0f7; text-align: left; }
  th, td { border: 1px solid #b9bccc; padding: 4.5px 8px; vertical-align: top; }
  blockquote { border-left: 3px solid #8fa4ff; background: #f5f7ff; margin: 8px 0;
               padding: 7px 12px; font-size: 9.5pt; color: #3a3a55; }
  code { font-family: Consolas, monospace; background: #f0f0f5; padding: 0 3px;
         border-radius: 3px; font-size: 0.92em; }
  pre { background: #f0f0f5; padding: 9px 12px; border-radius: 5px;
        font-family: Consolas, monospace; font-size: 8.8pt; overflow: hidden;
        page-break-inside: avoid; }
  ul { margin: 5px 0; padding-left: 22px; }
  li { margin: 2.5px 0; }
  hr { border: none; border-top: 1px solid #c9c9d9; margin: 14px 0; }
  a { color: #3d5af1; text-decoration: none; }
  /* 스크린샷 — 페이지 폭에 맞추고 쪽 경계에서 잘리지 않게 한다.
     1920×1080 원본이라 폭을 안 잡으면 인쇄 폭을 넘겨 잘린다. */
  img { display: block; width: 100%; height: auto; margin: 10px auto 6px;
        border: 1px solid #b9bccc; border-radius: 4px; page-break-inside: avoid; }
`;

/**
 * 강조 짝이 안 맞는 줄을 경고한다.
 *
 * `inline()`은 **줄 단위**로 돌고 `[^*]+`로 안쪽을 잡는다. 그래서 두 경우가 조용히 깨진다:
 *   ① `**굵게\n줄바꿈**` — 여는 짝과 닫는 짝이 다른 줄에 있어 매칭 실패
 *   ② `**A *B* C**`      — 중첩 강조. 안쪽 `*` 때문에 바깥 `**`가 매칭 실패
 * 둘 다 **별표가 본문에 그대로 인쇄된다.** 제출본에서 실제로 두 번 났고, PDF를 열어보기
 * 전에는 아무도 모른다 — 그래서 변환 시점에 짚는다.
 */
function warnUnbalancedEmphasis(md) {
  let inFence = false;
  let hits = 0;
  stripInternal(md).replaceAll('\r\n', '\n').split('\n').forEach((line, i) => {
    if (line.startsWith('```')) { inFence = !inFence; return; }
    if (inFence) return;
    // 개수를 세지 않고 **실제 변환 결과**를 본다. 중첩 강조(`**A *B* C**`)는 별표 개수가
    // 짝이 맞아서 산술 검사로는 안 잡힌다 — 돌연변이 시험으로 확인했다.
    // 코드 스팬 안의 별표는 원래 리터럴이므로 걷어내고 본다.
    const rendered = inline(line).replace(/<code>[\s\S]*?<\/code>/g, '');
    if (rendered.includes('*')) {
      hits += 1;
      console.warn(`  ⚠ ${i + 1}행: 강조가 변환되지 않는다 — 별표가 그대로 인쇄된다`);
      console.warn(`     ${line.trim().slice(0, 90)}`);
    }
  });
  if (hits) console.warn(`  ⚠ 총 ${hits}행 — 줄바꿈을 넘는 강조나 중첩 강조(**A *B***)를 확인하라\n`);
}

const md = readFileSync(srcPath, 'utf8');
warnUnbalancedEmphasis(md);
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${basename(srcPath)}</title><style>${CSS}</style></head>
<body>${mdToHtml(md)}</body></html>`;

const htmlPath = outPath.replace(/\.pdf$/i, '.render.html');
writeFileSync(htmlPath, html, 'utf8');

execFileSync(chrome, [
  '--headless', '--disable-gpu', '--no-pdf-header-footer',
  '--print-to-pdf-no-header',
  `--print-to-pdf=${outPath}`,
  `file:///${htmlPath.replaceAll('\\', '/')}`,
], { stdio: 'pipe', timeout: 60_000 });

console.log(`PDF 생성: ${outPath}`);
