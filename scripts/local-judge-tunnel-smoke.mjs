import { spawn } from 'node:child_process';

import { createLocalJudgeProxy } from './local-judge-proxy.mjs';

const cloudflaredBin = process.env.CLOUDFLARED_BIN || 'cloudflared';
const proxy = await createLocalJudgeProxy({
  port: 0,
  env: { GEMINI_API_KEY: 'health-check-only-not-a-real-key' },
  logger: { info() {}, error() {} },
});
const tunnel = spawn(
  cloudflaredBin,
  ['tunnel', '--url', proxy.url, '--no-autoupdate'],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);

let combinedOutput = '';
let settled = false;

const tunnelUrl = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    if (!settled) reject(new Error('Quick Tunnel URL was not emitted within 40 seconds'));
  }, 40_000);

  const inspect = (chunk) => {
    combinedOutput += chunk.toString();
    const match = combinedOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !settled) {
      settled = true;
      clearTimeout(timeout);
      resolve(match[0]);
    }
  };

  tunnel.stdout.on('data', inspect);
  tunnel.stderr.on('data', inspect);
  tunnel.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  tunnel.once('exit', (code) => {
    if (!settled) {
      clearTimeout(timeout);
      reject(new Error(`cloudflared exited before URL allocation (${code})\n${combinedOutput}`));
    }
  });
});

try {
  const deadline = Date.now() + 30_000;
  let health;
  let lastError;
  while (Date.now() < deadline && !health) {
    try {
      health = await fetch(`${tunnelUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      }).then((response) => response.json());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  if (!health) throw lastError ?? new Error('Quick Tunnel health check timed out');

  if (health.ok !== true || health.ready !== true) {
    throw new Error(`unexpected health response: ${JSON.stringify(health)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    service: health.service,
    ready: health.ready,
    tunnelHost: new URL(tunnelUrl).host,
  }));
} finally {
  tunnel.kill();
  await proxy.close();
}
