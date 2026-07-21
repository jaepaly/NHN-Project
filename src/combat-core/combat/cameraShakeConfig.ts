export type CameraShakeTier = 'weak' | 'medium' | 'strong';

export interface CameraShakeProfile {
  durationMs: number;
  intensity: number;
}

export const CAMERA_SHAKE_CONFIG = {
  weak: { durationMs: 80, intensity: 0.0025 },
  medium: { durationMs: 130, intensity: 0.004 },
  strong: { durationMs: 200, intensity: 0.0062 },
  repeatCooldownMs: 90,
} satisfies Record<CameraShakeTier, CameraShakeProfile> & { repeatCooldownMs: number };

const TIER_RANK: Record<CameraShakeTier, number> = {
  weak: 1,
  medium: 2,
  strong: 3,
};

/** Stronger impacts may replace an active shake; weaker/repeated requests wait their turn. */
export class CameraShakeGate {
  private activeUntilMs = 0;
  private activeRank = 0;
  private lastAcceptedAtMs = Number.NEGATIVE_INFINITY;

  request(tier: CameraShakeTier, nowMs: number): CameraShakeProfile | null {
    const safeNow = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
    const rank = TIER_RANK[tier];
    const active = safeNow < this.activeUntilMs;
    if (active && rank <= this.activeRank) return null;
    if (!active && safeNow - this.lastAcceptedAtMs < CAMERA_SHAKE_CONFIG.repeatCooldownMs) {
      return null;
    }

    const profile = CAMERA_SHAKE_CONFIG[tier];
    this.activeRank = rank;
    this.activeUntilMs = safeNow + profile.durationMs;
    this.lastAcceptedAtMs = safeNow;
    return profile;
  }

  reset(): void {
    this.activeUntilMs = 0;
    this.activeRank = 0;
    this.lastAcceptedAtMs = Number.NEGATIVE_INFINITY;
  }
}
