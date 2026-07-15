/** R1 전투 코어의 플레이어 HP·마나·쿨다운 상태. */
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
  shield: number = 0;
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

  takeDamage(amount: number): { hpDamage: number; shieldDamage: number } {
    const damage = Math.max(0, amount);
    const shieldDamage = Math.min(this.shield, damage);
    this.shield -= shieldDamage;
    const hpDamage = Math.min(this.hp, damage - shieldDamage);
    this.hp -= hpDamage;
    return { hpDamage, shieldDamage };
  }

  heal(amount: number): number {
    if (!this.alive) return 0;
    const previous = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
    return this.hp - previous;
  }

  addShield(amount: number): number {
    if (!this.alive) return 0;
    const previous = this.shield;
    this.shield = Math.min(this.maxHp, this.shield + Math.max(0, amount));
    return this.shield - previous;
  }

  restoreMana(amount: number): number {
    if (!this.alive) return 0;
    const previous = this.mana;
    this.mana = Math.min(this.maxMana, this.mana + Math.max(0, amount));
    return this.mana - previous;
  }
}
