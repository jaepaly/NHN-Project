import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import judgeWorker from '../proxy/worker.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8788;
const DEFAULT_VARS_FILE = path.join(REPO_ROOT, 'proxy', '.dev.vars');
const MAX_BODY_BYTES = 1024 * 1024;

export function parseDevVars(source) {
  const values = {};

  for (const rawLine of String(source).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

export function loadLocalProxyEnv({ processEnv = process.env, varsFile } = {}) {
  const resolvedVarsFile = path.resolve(
    varsFile ?? processEnv.LOCAL_JUDGE_VARS_FILE ?? DEFAULT_VARS_FILE,
  );
  let fileValues = {};

  if (fs.existsSync(resolvedVarsFile)) {
    fileValues = parseDevVars(fs.readFileSync(resolvedVarsFile, 'utf8'));
  }

  const geminiApiKey = String(processEnv.GEMINI_API_KEY ?? fileValues.GEMINI_API_KEY ?? '').trim();
  const allowedOrigin = String(processEnv.ALLOWED_ORIGIN ?? fileValues.ALLOWED_ORIGIN ?? '').trim();

  return {
    env: {
      GEMINI_API_KEY: geminiApiKey,
      ...(allowedOrigin ? { ALLOWED_ORIGIN: allowedOrigin } : {}),
    },
    varsFile: resolvedVarsFile,
  };
}

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function requestUrl(request, host, port) {
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const protocol = forwardedProtocol === 'https' ? 'https' : 'http';
  const authority = request.headers.host || `${host}:${port}`;
  return new URL(request.url || '/', `${protocol}://${authority}`).toString();
}

async function toFetchRequest(request, host, port) {
  const method = request.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request);

  return new Request(requestUrl(request, host, port), {
    method,
    headers: request.headers,
    body,
  });
}

async function sendFetchResponse(nodeResponse, fetchResponse, requestId) {
  const headers = Object.fromEntries(fetchResponse.headers.entries());
  headers['X-Incant-Local-Request-Id'] = requestId;
  headers['Cache-Control'] ??= 'no-store';
  const body = Buffer.from(await fetchResponse.arrayBuffer());
  nodeResponse.writeHead(fetchResponse.status, headers);
  nodeResponse.end(body);
}

export async function createLocalJudgeProxy({
  host = process.env.LOCAL_JUDGE_HOST || DEFAULT_HOST,
  port = Number(process.env.LOCAL_JUDGE_PORT || DEFAULT_PORT),
  workerFetch = judgeWorker.fetch.bind(judgeWorker),
  env,
  varsFile,
  logger = console,
} = {}) {
  const loaded = env ? { env, varsFile: varsFile ?? null } : loadLocalProxyEnv({ varsFile });
  const workerEnv = loaded.env;

  const server = http.createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const pathname = new URL(request.url || '/', `http://${host}`).pathname;

    if ((request.method === 'GET' || request.method === 'HEAD') && pathname === '/health') {
      jsonResponse(response, 200, {
        ok: true,
        service: 'incant-local-judge-proxy',
        ready: Boolean(workerEnv.GEMINI_API_KEY),
      });
      return;
    }

    try {
      const fetchRequest = await toFetchRequest(request, host, port);
      const fetchResponse = await workerFetch(fetchRequest, workerEnv);
      await sendFetchResponse(response, fetchResponse, requestId);
      logger.info(
        `[local-judge] ${requestId} ${request.method} ${pathname} ${fetchResponse.status} ${(performance.now() - startedAt).toFixed(0)}ms`,
      );
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      jsonResponse(response, status, {
        error: status === 413 ? 'request_too_large' : 'local_proxy_error',
        requestId,
      });
      logger.error(
        `[local-judge] ${requestId} ${request.method} ${pathname} ${status} ${(performance.now() - startedAt).toFixed(0)}ms`,
      );
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    ready: Boolean(workerEnv.GEMINI_API_KEY),
    varsFile: loaded.varsFile,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function runCli() {
  const proxy = await createLocalJudgeProxy();
  console.log(`[local-judge] listening on ${proxy.url}`);
  console.log(`[local-judge] health: ${proxy.url}/health`);
  if (!proxy.ready) {
    console.warn(`[local-judge] GEMINI_API_KEY가 없습니다. ${proxy.varsFile} 파일을 준비하세요.`);
  }

  const shutdown = async () => {
    await proxy.close().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`[local-judge] 시작 실패: ${error.message}`);
    process.exitCode = 1;
  });
}
