export const PLAYER_COMBAT_CONFIG = {
  maxHp: 100,
  maxMana: 100,
  // 임시값: 플레이테스트와 팀 논의 후 조정한다 (GDD에는 초당 n으로 표기).
  manaRegenPerSecond: 10,
  globalCooldownSeconds: 3,
} as const;

export class PlayerCombatState {
  readonly maxHp: number = PLAYER_COMBAT_CONFIG.maxHp;
  readonly maxMana: number = PLAYER_COMBAT_CONFIG.maxMana;

  hp: number = this.maxHp;
  mana: number = this.maxMana;
  cooldownRemaining: number = 0;

  get alive(): boolean {
    return this.hp > 0;
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, deltaSeconds);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);

    if (this.alive) {
      this.mana = Math.min(
        this.maxMana,
        this.mana + PLAYER_COMBAT_CONFIG.manaRegenPerSecond * delta,
      );
    }
  }

  trySpendMana(cost: number): boolean {
    const safeCost = Math.max(0, cost);
    if (!this.alive || safeCost > this.mana) return false;

    this.mana -= safeCost;
    return true;
  }

  startGlobalCooldown(): void {
    this.cooldownRemaining = PLAYER_COMBAT_CONFIG.globalCooldownSeconds;
  }

  takeDamage(amount: number): void {
    const damage = Math.max(0, amount);
    this.hp = Math.max(0, this.hp - damage);
  }
}
