/** R1 전투 코어의 플레이어 HP·마나·쿨다운 상태. */
export const PLAYER_COMBAT_CONFIG = {
  maxHp: 100,
  maxMana: 100,
  // 임시값: 플레이테스트와 팀 논의 후 조정한다 (GDD에는 초당 n으로 표기).
  manaRegenPerSecond: 10,
  globalCooldownSeconds: 3,
  /** 신속 영창을 아무리 쌓아도 이 밑으로는 안 내려감 (PROGRESSION_DESIGN §1) */
  globalCooldownFloorSeconds: 1,
} as const;

export class PlayerCombatState {
  private maxHpValue: number = PLAYER_COMBAT_CONFIG.maxHp;
  private maxManaValue: number = PLAYER_COMBAT_CONFIG.maxMana;
  private cooldownReductionSeconds = 0;
  private manaRegenMultiplierValue = 1;

  hp: number = this.maxHpValue;
  mana: number = this.maxManaValue;
  shield: number = 0;
  cooldownRemaining: number = 0;

  get maxHp(): number {
    return this.maxHpValue;
  }

  get maxMana(): number {
    return this.maxManaValue;
  }

  /** 신속 영창 반영 후 실제 글로벌 쿨다운 (하한 적용) */
  get globalCooldownSeconds(): number {
    return Math.max(
      PLAYER_COMBAT_CONFIG.globalCooldownFloorSeconds,
      PLAYER_COMBAT_CONFIG.globalCooldownSeconds - this.cooldownReductionSeconds,
    );
  }

  get manaRegenMultiplier(): number {
    return this.manaRegenMultiplierValue;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  update(deltaSeconds: number): void {
    const delta = Math.max(0, deltaSeconds);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);

    if (this.alive) {
      this.mana = Math.min(
        this.maxMana,
        this.mana
          + PLAYER_COMBAT_CONFIG.manaRegenPerSecond * this.manaRegenMultiplierValue * delta,
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
    this.cooldownRemaining = this.globalCooldownSeconds;
  }

  /** 신속 영창 보상 — 글로벌 쿨다운 감소 (하한은 globalCooldownSeconds getter가 보장) */
  addCooldownReduction(seconds: number): number {
    const amount = safePositiveAmount(seconds);
    this.cooldownReductionSeconds += amount;
    return amount;
  }

  /** 마나 격류 보상 — 재생 배율 증가 (+0.5 = +50%) */
  addManaRegenMultiplier(bonus: number): number {
    const amount = safePositiveAmount(bonus);
    this.manaRegenMultiplierValue += amount;
    return amount;
  }

  /** 새 런 시작 시 기본 수치로 초기화 (보상으로 늘어난 최대치 포함) */
  reset(): void {
    this.maxHpValue = PLAYER_COMBAT_CONFIG.maxHp;
    this.maxManaValue = PLAYER_COMBAT_CONFIG.maxMana;
    this.cooldownReductionSeconds = 0;
    this.manaRegenMultiplierValue = 1;
    this.hp = this.maxHpValue;
    this.mana = this.maxManaValue;
    this.shield = 0;
    this.cooldownRemaining = 0;
  }

  increaseMaxHp(amount: number): number {
    const increase = safePositiveAmount(amount);
    this.maxHpValue += increase;
    return increase;
  }

  increaseMaxMana(amount: number): number {
    const increase = safePositiveAmount(amount);
    this.maxManaValue += increase;
    return increase;
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

function safePositiveAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}
