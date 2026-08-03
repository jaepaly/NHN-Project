const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/u;

function fallbackRequestId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeRequestId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : fallbackRequestId();
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildJudgeTimingLog({
  requestId,
  route,
  inputLength,
  inputHash,
  attempts,
  retryReason,
  outcome,
  validation,
  elapsedMs,
  geminiElapsedMs,
  colo,
  ...extra
}) {
  return {
    event: 'judge_timing',
    requestId,
    route,
    inputLength,
    inputHash,
    attempts,
    retryReason,
    outcome,
    validation,
    elapsedMs,
    geminiElapsedMs,
    colo: colo ?? null,
    ...extra,
  };
}
