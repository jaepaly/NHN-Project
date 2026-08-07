export type MoveDirection = 'up' | 'down' | 'left' | 'right';

const MOVE_CODE_DIRECTION: Readonly<Record<string, MoveDirection>> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

/** DOM 입력창이 keydown 전파를 막아도 capture 단계에서 실제 WASD 눌림을 보존한다. */
export class PhysicalMovementState {
  private readonly held = new Set<MoveDirection>();

  keyDown(code: string): void {
    const direction = MOVE_CODE_DIRECTION[code];
    if (direction) this.held.add(direction);
  }

  keyUp(code: string): void {
    const direction = MOVE_CODE_DIRECTION[code];
    if (direction) this.held.delete(direction);
  }

  isDown(direction: MoveDirection): boolean {
    return this.held.has(direction);
  }

  reset(): void {
    this.held.clear();
  }
}
