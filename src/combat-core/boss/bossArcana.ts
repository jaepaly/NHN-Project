import type { SpellSpec } from '../../spell/types';
import { RAIN_CONFIG } from '../combat/areaSpellConfig';
import { SPELL_DAMAGE_CONFIG } from '../combat/combatConfig';

/**
 * 보스 비전(祕傳) 마법 — 최종(기억) 보스의 주문 목록과 제어 마법 수치 (총괄 발안 07-26).
 *
 * 왜: "말이 곧 마법" 세계의 최종 보스가 탄막·돌진·장판 — 전부 물리 패턴만 썼다.
 * 플레이어는 자유 영창으로 8원소를 부리는데 보스는 마법사가 아니었다.
 * 미러 캐스트가 만든 인프라(castSpell 시전자 중립 + 플레이어 피해 onHit)를
 * 재사용해 보스도 영창하게 한다: 원소 마법 + 제어 마법(시야 장막·중력 인력) + 미러.
 *
 * 밸런스 가드: 전부 패턴 슬롯에 편입 — 한 번에 하나만 나온다. 제어 마법은 피해 0
 * (순수 방해)이고 짧다. 시연 탭에서 심사위원이 죽으면 안 된다.
 */
export const BOSS_ARCANA_CONFIG = {
  /** 원소 마법 피해 배수 — 미러(0.35)보다 약간 약하게. 일상 패턴이지 필살기가 아니다 */
  damageScale: 0.3,
  /** 원소 마법 예고(초) — 가벼운 패턴이라 미러(1.1s)보다 짧다 */
  castTelegraphSeconds: 1.1,
  /**
   * 어둠 장막 지속(초) — 암전 저주(방 전체·상시)의 시야 시스템을 재사용하되
   * 짧은 방해로만. 길면 "답답함"이지 "위협"이 아니다.
   */
  shroudSeconds: 3.2,
  /**
   * 중력 인력: 초당 끌려가는 픽셀. 플레이어 이속(220)보다 확실히 낮아
   * **걸어서 저항 가능** — 제어는 죽이는 기술이 아니라 자리를 흐트러뜨리는 기술이다.
   */
  pullSpeedPerSecond: 130,
  pullDurationSeconds: 1.6,
  pullTelegraphSeconds: 0.6,
} as const;

/**
 * 보스 스펠북 — 원소·폼을 갈라 화면에서 서로 다르게 읽히는 4종.
 * rain은 하늘에서, nova는 보스 중심 확장, bolt는 직선 투사, wave는 전진 파도 —
 * 전부 이동 시간·전조가 있어 회피 문법이 성립하는 폼만 (즉발 beam/slash 배제).
 */
export const BOSS_SPELLBOOK: readonly SpellSpec[] = [
  {
    name: '재의 소나기', effect: 'damage', target: 'area', element_primary: 'fire',
    element_secondary: null, form: 'rain', size: 'medium', speed: 'normal',
    status: [], power: 48, cost: 0,
  },
  {
    name: '혹한의 파열', effect: 'damage', target: 'area', element_primary: 'ice',
    element_secondary: null, form: 'nova', size: 'large', speed: 'normal',
    status: [], power: 45, cost: 0,
  },
  {
    name: '추격하는 뇌창', effect: 'damage', target: 'enemy', element_primary: 'lightning',
    element_secondary: null, form: 'bolt', size: 'large', speed: 'fast',
    status: [], power: 52, cost: 0,
  },
  {
    name: '심연의 해일', effect: 'damage', target: 'area', element_primary: 'dark',
    element_secondary: null, form: 'wave', size: 'large', speed: 'slow',
    status: [], power: 50, cost: 0,
  },
];

/** 스펠북 순환 — 항상 사본을 돌려준다 (시전측 변형이 원본을 오염시키지 않게) */
export function bossArcanaSpell(index: number): SpellSpec {
  const safe = Number.isFinite(index) ? Math.abs(Math.floor(index)) : 0;
  const spec = BOSS_SPELLBOOK[safe % BOSS_SPELLBOOK.length];
  return { ...spec, status: [...spec.status] };
}

/** 표적 지점 예고는 실제 범위를 읽게 해야 회피가 성립한다. */
export function bossArcanaTelegraphRadius(spec: Pick<SpellSpec, 'form' | 'size' | 'power'>): number {
  const scale = spec.size === 'small' ? 0.6 : spec.size === 'large' ? 1.5 : spec.size === 'huge' ? 2.2 : 1;
  if (spec.form === 'rain') return RAIN_CONFIG.baseAreaRadius * scale;
  if (spec.form === 'nova') return (SPELL_DAMAGE_CONFIG.novaBaseRadius + Math.max(0, spec.power)) * scale;
  return 48 * scale;
}
