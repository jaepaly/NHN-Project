import { spawn } from 'node:child_process';

import { createLocalJudgeProxy } from './local-judge-proxy.mjs';

const cloudflaredBin = process.env.CLOUDFLARED_BIN || 'cloudflared';
const proxy = await createLocalJudgeProxy();

if (!proxy.ready) {
  console.error(`[local-judge] Gemini API 키가 없습니다: ${proxy.varsFile}`);
  console.error('[local-judge] proxy/.dev.vars.example을 proxy/.dev.vars로 복사한 뒤 개인 키를 입력하세요.');
  await proxy.close();
  process.exit(1);
}

console.log(`[local-judge] local proxy: ${proxy.url}`);
console.log('[local-judge] Cloudflare Quick Tunnel을 여는 중...');

const tunnel = spawn(
  cloudflaredBin,
  ['tunnel', '--url', proxy.url, '--no-autoupdate'],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);

let announcedUrl = '';
const forwardOutput = (stream, output) => {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    output.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && match[0] !== announcedUrl) {
      announcedUrl = match[0];
      console.log('\n[local-judge] 연결 완료');
      console.log(`[local-judge] .env.local 설정: VITE_JUDGE_PROXY_URL=${announcedUrl}`);
      console.log('[local-judge] 위 주소를 설정한 뒤 게임 개발 서버를 다시 시작하세요.');
      console.log(`[local-judge] 확인 주소: ${announcedUrl}/health\n`);
    }
  });
};

forwardOutput(tunnel.stdout, process.stdout);
forwardOutput(tunnel.stderr, process.stderr);

const shutdown = async () => {
  if (!tunnel.killed) tunnel.kill();
  await proxy.close().catch(() => undefined);
};

tunnel.once('error', async (error) => {
  if (error.code === 'ENOENT') {
    console.error('[local-judge] cloudflared가 설치되어 있지 않습니다.');
    console.error('[local-judge] Windows 설치: winget install --id Cloudflare.cloudflared --exact');
  } else {
    console.error(`[local-judge] tunnel 시작 실패: ${error.message}`);
  }
  await shutdown();
  process.exitCode = 1;
});

tunnel.once('exit', async (code) => {
  await proxy.close().catch(() => undefined);
  if (code && code !== 0) process.exitCode = code;
});

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
