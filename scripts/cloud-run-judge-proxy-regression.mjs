import assert from 'node:assert/strict';

import { createCloudRunJudgeProxy } from '../proxy/cloud-run/server.mjs';

const requests = [];
const proxy = await createCloudRunJudgeProxy({
  host: '127.0.0.1',
  port: 0,
  env: {
    GEMINI_API_KEY: 'fixture-key',
    ALLOWED_ORIGIN: 'https://jaepaly.github.io',
    INCANT_DEPLOY_REGION: 'asia-northeast1',
  },
  logger: { info() {}, error() {} },
  workerFetch: async (request, env) => {
    requests.push({
      path: new URL(request.url).pathname,
      body: await request.json(),
      keyBound: env.GEMINI_API_KEY === 'fixture-key',
      forwardedIp: request.headers.get('CF-Connecting-IP'),
    });
    return Response.json({ ok: true }, { headers: { 'X-Worker-Contract': 'reused' } });
  },
});

try {
  const health = await fetch(`${proxy.url}/health`).then((response) => response.json());
  assert.deepEqual(health, {
    ok: true,
    service: 'incant-cloud-run-judge-proxy',
    ready: true,
    region: 'asia-northeast1',
  });

  const response = await fetch(`${proxy.url}/boss-line`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.42, 10.0.0.1',
      'CF-Connecting-IP': 'spoofed-value',
    },
    body: JSON.stringify({ favoriteElement: 'ice' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-worker-contract'), 'reused');
  assert.ok(response.headers.get('x-incant-cloud-run-request-id'));
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(requests, [{
    path: '/boss-line',
    body: { favoriteElement: 'ice' },
    keyBound: true,
    forwardedIp: '203.0.113.42',
  }]);
} finally {
  await proxy.close();
}

const keylessProxy = await createCloudRunJudgeProxy({
  host: '127.0.0.1',
  port: 0,
  env: { INCANT_DEPLOY_REGION: 'asia-northeast1' },
  logger: { info() {}, error() {} },
});
try {
  const health = await fetch(`${keylessProxy.url}/health`).then((response) => response.json());
  assert.equal(health.ready, false);

  const response = await fetch(keylessProxy.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.43' },
    body: JSON.stringify({ text: '불꽃' }),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'no_api_key_bound', keyLen: 0 });
} finally {
  await keylessProxy.close();
}

console.log('cloud run judge proxy regression: ok');
