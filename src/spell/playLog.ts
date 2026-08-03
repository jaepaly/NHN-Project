export interface PlayLogEnvelopeOptions {
  sessionId?: string;
  atMs?: number;
}

function createSessionId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `play-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const PLAY_LOG_SESSION_ID = createSessionId();

export function createRequestId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function hashPlayLogInput(text: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'unavailable';
  }
}

/** 모든 DEV 플레이 이벤트에 같은 세션 ID와 절대시각을 붙인다. */
export function buildPlayLogRecord(
  event: Record<string, unknown>,
  options: PlayLogEnvelopeOptions = {},
): Record<string, unknown> {
  const atMs = options.atMs ?? Date.now();
  return {
    ...event,
    at: new Date(atMs).toISOString(),
    sessionId: options.sessionId ?? PLAY_LOG_SESSION_ID,
  };
}

/** DEV Vite 로거로 best-effort 전송. 실패해도 게임 진행에는 영향을 주지 않는다. */
export async function postPlayLog(event: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/__log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPlayLogRecord(event)),
    });
  } catch {
    // 개발 로깅은 관측 보조 기능 — 실패해도 판정·전투는 계속한다.
  }
}
