/** HUD와 런 요약에서 동일하게 쓰는 플레이 타임 표기. */
export function formatRunElapsed(elapsedMs: number): string {
  const tenths = Math.max(0, Math.floor(Number.isFinite(elapsedMs) ? elapsedMs / 100 : 0));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}
