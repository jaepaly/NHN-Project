export const SPELL_CAST_LOG = {
  maxEntries: 3,
  holdMs: 5_000,
  fadeMs: 1_200,
  mergeWindowMs: 1_000,
} as const;

export type SpellCastLogKind = 'manual' | 'auto' | 'chorus';

export interface SpellCastLogInput {
  kind: SpellCastLogKind;
  label: string;
  color: string;
  now: number;
}

export interface SpellCastLogEntry extends SpellCastLogInput {
  count: number;
  expiresAt: number;
}

/**
 * 좌하단 마도 기록의 순수 상태 모델.
 *
 * 피해 숫자와 달리 "무슨 발동이 일어났는지"만 남긴다. 같은 자동 효과가 짧은 시간에
 * 연속되면 새 줄을 쌓지 않고 ×N으로 합쳐 화면을 채팅창처럼 만들지 않는다.
 */
export function appendSpellCastLog(
  entries: readonly SpellCastLogEntry[],
  input: SpellCastLogInput,
): SpellCastLogEntry[] {
  const label = input.label.trim();
  if (!label) return [...entries];

  const previous = entries.at(-1);
  const isSameBurst = previous
    && previous.kind === input.kind
    && previous.label === label
    && input.now - previous.now <= SPELL_CAST_LOG.mergeWindowMs;
  if (isSameBurst) {
    return [
      ...entries.slice(0, -1),
      {
        ...previous,
        now: input.now,
        count: previous.count + 1,
        expiresAt: input.now + SPELL_CAST_LOG.holdMs,
      },
    ];
  }

  return [
    ...entries,
    {
      ...input,
      label,
      count: 1,
      expiresAt: input.now + SPELL_CAST_LOG.holdMs,
    },
  ].slice(-SPELL_CAST_LOG.maxEntries);
}

export function activeSpellCastLogs(
  entries: readonly SpellCastLogEntry[],
  now: number,
): SpellCastLogEntry[] {
  return entries.filter((entry) => entry.expiresAt > now);
}

export function spellCastLogAlpha(entry: SpellCastLogEntry, now: number): number {
  const remaining = entry.expiresAt - now;
  if (remaining <= 0) return 0;
  if (remaining >= SPELL_CAST_LOG.fadeMs) return 1;
  return remaining / SPELL_CAST_LOG.fadeMs;
}
