import type { SpellForm } from '../../spell/types';

export const KNOCKBACK_CONFIG = {
  standardDistance: 36,
  zoneDistance: 12,
  orbitDistance: 18,
  durationSeconds: 0.09,
} as const;

export function knockbackDistanceForForm(form: SpellForm): number {
  if (form === 'zone') return KNOCKBACK_CONFIG.zoneDistance;
  if (form === 'orbit') return KNOCKBACK_CONFIG.orbitDistance;
  return KNOCKBACK_CONFIG.standardDistance;
}
