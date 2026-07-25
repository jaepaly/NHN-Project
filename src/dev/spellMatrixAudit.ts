/**
 * 주문 소비 매트릭스 감사 (DEV 전용) — effect × form × target **전수**.
 *
 * 왜: 판정이 옳게 읽어도 **엔진이 그 의미를 흘리면** 플레이어에겐 "말이 안 통하는" 게임이 된다.
 * 실제로 `effect:'shield'`가 `form:'wall'`을 삼켜 "장벽으로 길을 막는다"가 보호막만 주던 결함이
 * 이 방식으로 잡혔다. 입력을 사람이 상상하지 않고 **enum에서 전개**하므로 폼·효과가 늘어나면
 * 자동으로 커버된다(문장 표본과 달리 커버리지 공백이 없다).
 *
 * 격리가 이 감사의 전부다 — 초기 시도들이 전부 오염으로 거짓 신호를 냈다:
 *   1) 기본탄이 자동 발사돼 모든 조합에 '피해'가 찍힘      → 매 프레임 쿨다운 봉인 + 원장 기반 측정
 *   2) createSummon이 먼저 clear를 불러 before==after       → 조합마다 생성물 전부 리셋
 *   3) 같은 적을 재사용해 앞선 제어가 다음 측정의 바닥이 됨 → **조합마다 새 적을 스폰**
 *      (새 적은 제어 상태 엔트리가 없어 기준선이 항상 1.0)
 */

import { EFFECTS, FORMS, TARGETS } from '../spell/types';
import type { SpellEffect, SpellForm, SpellSpec, SpellTarget } from '../spell/types';

/** 감사가 필요로 하는 씬 표면 — 런타임 접근이므로 구조만 기술한다. */
interface AuditScene {
  player: { x: number; y: number };
  enemies: Array<{ alive: boolean; x: number; y: number; hp: number }>;
  playerState: {
    hp: number; shield: number;
    /** 자기 강화는 종류가 넷이다 — 하나만 보면 나머지 셋을 '무반응'으로 오인한다 */
    damageOutMultiplier: number;   // empower
    moveSpeedMultiplier: number;   // haste
    damageInMultiplier: number;    // ward (피해 감소)
    invulnerable: boolean;         // ward 극단값
    /** 시간제 버프까지 비운다 — 안 지우면 첫 조합만 델타가 보이고 나머지가 '무반응'이 된다 */
    reset(): void;
  };
  enemyControlState: { movementMultiplierFor(enemy: unknown): number };
  damageLedger: { manual: number };
  activeWall: unknown;
  activeOrbit: unknown;
  activeSummons: unknown[];
  friendlyMissiles: unknown[];
  basicAttackCooldownRemaining: number;
  spawnEnemy(kind: string, x: number, y: number): void;
  clearActiveWall(): void;
  clearActiveOrbit(): void;
  clearSummon(): void;
  applySpellEffect(spec: SpellSpec): void;
}

export interface MatrixRow {
  effect: SpellEffect;
  form: SpellForm;
  target: SpellTarget;
  /** 관측된 반응 — 비면 '엔진이 이 조합을 소비하지 않았다' */
  fired: string[];
  error?: string;
}

/** 측정 창 — 지속형(zone/rain)이 최소 한 번 틱할 만큼 (프레임 16ms 기준 약 0.8초) */
const FRAMES = 50;
/** rain은 여러 번에 걸쳐 낙하해 첫 착탄이 늦다 — 이 폼만 창을 넉넉히 준다 */
const RAIN_FRAMES = 160;

function makeSpec(effect: SpellEffect, form: SpellForm, target: SpellTarget): SpellSpec {
  return {
    name: 'MATRIX', effect, target,
    element_primary: 'ice', element_secondary: null, form,
    size: 'medium', speed: 'normal', status: [], power: 50, cost: 0,
  };
}

/**
 * @param stepFrame 한 프레임 진행 (백그라운드 탭에서는 game.loop.step을 감싸 넘긴다)
 */
export function runSpellMatrixAudit(
  scene: AuditScene,
  stepFrame: () => void,
): MatrixRow[] {
  const rows: MatrixRow[] = [];

  for (const effect of EFFECTS) {
    for (const form of FORMS) {
      for (const target of TARGETS) {
        // ── 격리 ①: 이전 조합의 생성물 제거
        scene.clearActiveWall();
        scene.clearActiveOrbit();
        scene.clearSummon();
        scene.friendlyMissiles.length = 0;
        // 시간제 버프(haste·empower·ward)가 다음 조합으로 새지 않게 완전 초기화
        scene.playerState.reset();
        scene.playerState.hp = 60;

        // ── 격리 ②: 새 적 — 제어 상태·HP를 앞 조합과 공유하지 않는다
        for (const enemy of scene.enemies) enemy.alive = false;
        scene.spawnEnemy('chaser', scene.player.x + 40, scene.player.y);
        const subject = scene.enemies.filter((e) => e.alive).pop();
        if (!subject) {
          rows.push({ effect, form, target, fired: [], error: 'no subject enemy' });
          continue;
        }
        subject.hp = 99_999; // 죽어서 측정이 끊기지 않게
        const baseline = scene.enemyControlState.movementMultiplierFor(subject);

        const before = {
          manual: scene.damageLedger.manual,
          wall: scene.activeWall ? 1 : 0,
          orbit: scene.activeOrbit ? 1 : 0,
          summons: scene.activeSummons.length,
          missiles: scene.friendlyMissiles.length,
          shield: scene.playerState.shield,
          hp: scene.playerState.hp,
          empower: scene.playerState.damageOutMultiplier,
          haste: scene.playerState.moveSpeedMultiplier,
          ward: scene.playerState.damageInMultiplier,
          playerX: scene.player.x,
          playerY: scene.player.y,
        };

        let error: string | undefined;
        try {
          scene.applySpellEffect(makeSpec(effect, form, target));
        } catch (e) {
          error = String((e as Error)?.message ?? e);
        }

        // ── 격리 ③: 측정 중 기본탄 봉인 + 제어는 **최솟값**으로 (만료를 미적용으로 오인 방지)
        let minMultiplier = baseline;
        // 회복은 순간값이라 창 끝에서 보면 적의 반격에 상쇄된다 — 최댓값으로 잡는다
        let maxHp = scene.playerState.hp;
        const frames = form === 'rain' ? RAIN_FRAMES : FRAMES;
        for (let i = 0; i < frames; i += 1) {
          scene.basicAttackCooldownRemaining = 9_999;
          stepFrame();
          const m = scene.enemyControlState.movementMultiplierFor(subject);
          if (m < minMultiplier) minMultiplier = m;
          if (scene.playerState.hp > maxHp) maxHp = scene.playerState.hp;
        }
        scene.basicAttackCooldownRemaining = 0;

        const fired: string[] = [];
        if ((scene.activeWall ? 1 : 0) > before.wall) fired.push('wall');
        if ((scene.activeOrbit ? 1 : 0) > before.orbit) fired.push('orbit');
        if (scene.activeSummons.length > before.summons) fired.push('summon');
        if (scene.friendlyMissiles.length > before.missiles) fired.push('missile');
        if (scene.playerState.shield > before.shield) fired.push('shield');
        if (maxHp > before.hp) fired.push('heal');
        if (scene.damageLedger.manual > before.manual) fired.push('damage');
        if (minMultiplier < baseline) fired.push('control');
        // 자기 강화 — 네 종류를 모두 본다(empower만 보면 haste·ward·dash를 놓친다)
        if (scene.playerState.damageOutMultiplier > before.empower) fired.push('empower');
        if (scene.playerState.moveSpeedMultiplier > before.haste) fired.push('haste');
        if (scene.playerState.damageInMultiplier < before.ward
          || scene.playerState.invulnerable) fired.push('ward');
        if (Math.hypot(scene.player.x - before.playerX, scene.player.y - before.playerY) > 1) {
          fired.push('dash');
        }

        rows.push({ effect, form, target, fired, error });
      }
    }
  }
  return rows;
}

/** 사람이 읽을 요약 — 무반응(엔진이 흘린 조합)을 앞세운다. */
export function summarizeMatrix(rows: MatrixRow[]): string {
  const dead = rows.filter((r) => r.fired.length === 0 && !r.error);
  const errors = rows.filter((r) => r.error);
  const lines = [
    `주문 소비 매트릭스: ${rows.length}조합 · 무반응 ${dead.length} · 예외 ${errors.length}`,
  ];
  if (errors.length) {
    lines.push('── 예외 ──');
    errors.forEach((r) => lines.push(`  ${r.effect}/${r.form}/${r.target}: ${r.error}`));
  }
  if (dead.length) {
    lines.push('── 무반응 (엔진이 이 조합을 소비하지 않음) ──');
    dead.forEach((r) => lines.push(`  ${r.effect}/${r.form}/${r.target}`));
  }
  return lines.join('\n');
}
