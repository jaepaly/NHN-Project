import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import judgeWorker from '../worker.js';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8080;
const MAX_BODY_BYTES = 1024 * 1024;

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
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

function forwardedClientIp(request) {
  const forwardedFor = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);

  return forwardedFor || request.socket.remoteAddress || 'unknown';
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }

  // `CF-Connecting-IP` is what the shared Worker already uses for best-effort
  // per-IP limiting. Cloud Run has no such header, so derive it from the
  // platform-forwarded client chain instead of placing every caller in `unknown`.
  headers.delete('cf-connecting-ip');
  headers.set('CF-Connecting-IP', forwardedClientIp(request));
  return headers;
}

async function toFetchRequest(request, host, port) {
  const method = request.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request);

  return new Request(requestUrl(request, host, port), {
    method,
    headers: requestHeaders(request),
    body,
  });
}

async function sendFetchResponse(nodeResponse, fetchResponse, requestId) {
  const headers = Object.fromEntries(fetchResponse.headers.entries());
  headers['X-Incant-Cloud-Run-Request-Id'] = requestId;
  headers['Cache-Control'] ??= 'no-store';
  const body = Buffer.from(await fetchResponse.arrayBuffer());
  nodeResponse.writeHead(fetchResponse.status, headers);
  nodeResponse.end(body);
}

export async function createCloudRunJudgeProxy({
  host = process.env.HOST || DEFAULT_HOST,
  port = Number(process.env.PORT || DEFAULT_PORT),
  env = process.env,
  workerFetch = judgeWorker.fetch.bind(judgeWorker),
  logger = console,
} = {}) {
  const workerEnv = {
    GEMINI_API_KEY: String(env.GEMINI_API_KEY ?? '').trim(),
    ...(String(env.ALLOWED_ORIGIN ?? '').trim() ? { ALLOWED_ORIGIN: String(env.ALLOWED_ORIGIN).trim() } : {}),
  };

  const server = http.createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const pathname = new URL(request.url || '/', `http://${request.headers.host || host}`).pathname;

    if ((request.method === 'GET' || request.method === 'HEAD') && pathname === '/health') {
      jsonResponse(response, 200, {
        ok: true,
        service: 'incant-cloud-run-judge-proxy',
        ready: Boolean(workerEnv.GEMINI_API_KEY),
        region: String(env.INCANT_DEPLOY_REGION ?? 'unknown'),
      });
      return;
    }

    try {
      const fetchRequest = await toFetchRequest(request, host, port);
      const fetchResponse = await workerFetch(fetchRequest, workerEnv);
      await sendFetchResponse(response, fetchResponse, requestId);
      logger.info(
        `[cloud-run-judge] ${requestId} ${request.method} ${pathname} ${fetchResponse.status} ${(performance.now() - startedAt).toFixed(0)}ms`,
      );
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      jsonResponse(response, status, {
        error: status === 413 ? 'request_too_large' : 'cloud_run_proxy_error',
        requestId,
      });
      logger.error(
        `[cloud-run-judge] ${requestId} ${request.method} ${pathname} ${status} ${(performance.now() - startedAt).toFixed(0)}ms`,
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
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function runCli() {
  const proxy = await createCloudRunJudgeProxy();
  console.log(`[cloud-run-judge] listening on ${proxy.url}`);
  console.log(`[cloud-run-judge] health: ${proxy.url}/health`);

  const shutdown = async () => {
    await proxy.close().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  runCli().catch((error) => {
    console.error(`[cloud-run-judge] start failed: ${error.message}`);
    process.exitCode = 1;
  });
}
