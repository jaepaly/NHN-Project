import assert from 'node:assert/strict';

import {
  createLocalJudgeProxy,
  loadLocalProxyEnv,
  parseDevVars,
} from './local-judge-proxy.mjs';

const parsed = parseDevVars(`
# comment
GEMINI_API_KEY="fixture-key"
export ALLOWED_ORIGIN='https://example.test'
INVALID LINE
`);
assert.deepEqual(parsed, {
  GEMINI_API_KEY: 'fixture-key',
  ALLOWED_ORIGIN: 'https://example.test',
});

const loaded = loadLocalProxyEnv({
  processEnv: { GEMINI_API_KEY: 'environment-key' },
  varsFile: 'missing-local-judge-vars',
});
assert.equal(loaded.env.GEMINI_API_KEY, 'environment-key');

const requests = [];
const proxy = await createLocalJudgeProxy({
  port: 0,
  env: { GEMINI_API_KEY: 'fixture-key' },
  logger: { info() {}, error() {} },
  workerFetch: async (request, env) => {
    requests.push({
      path: new URL(request.url).pathname,
      method: request.method,
      body: await request.json(),
      keyBound: env.GEMINI_API_KEY === 'fixture-key',
    });
    return Response.json({ ok: true }, {
      status: 200,
      headers: { 'X-Worker-Contract': 'reused' },
    });
  },
});

try {
  const health = await fetch(`${proxy.url}/health`).then((response) => response.json());
  assert.deepEqual(health, {
    ok: true,
    service: 'incant-local-judge-proxy',
    ready: true,
  });

  const response = await fetch(`${proxy.url}/boss-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favoriteElement: 'ice' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-worker-contract'), 'reused');
  assert.ok(response.headers.get('x-incant-local-request-id'));
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(requests, [{
    path: '/boss-line',
    method: 'POST',
    body: { favoriteElement: 'ice' },
    keyBound: true,
  }]);
} finally {
  await proxy.close();
}

const keylessProxy = await createLocalJudgeProxy({
  port: 0,
  env: {},
  logger: { info() {}, error() {} },
});
try {
  const response = await fetch(keylessProxy.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '불꽃' }),
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'no_api_key_bound', keyLen: 0 });
} finally {
  await keylessProxy.close();
}

console.log('local judge proxy regression: ok');
