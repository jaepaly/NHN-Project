import Phaser from 'phaser';
import type { SpellElement } from '../spell/types';

export const SFX_NAMES = [
  'hit',
  'enemy-defeat',
  'fizzle',
  'incant-enter',
  'reward-select',
  'room-clear',
  'boss-appear',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

const MASTER_VOLUME = 0.5;
const MUTE_STORAGE_KEY = 'incant.audio.muted';
const AUDIO_PATH = `${import.meta.env.BASE_URL}assets/audio/`;

const CAST_KEYS: Record<SpellElement, string> = {
  fire: 'audio-cast-fire',
  water: 'audio-cast-water',
  lightning: 'audio-cast-lightning',
  ice: 'audio-cast-ice',
  earth: 'audio-cast-earth',
  wind: 'audio-cast-wind',
  light: 'audio-cast-light',
  dark: 'audio-cast-dark',
};

const SFX_KEYS: Record<SfxName, string> = {
  hit: 'audio-sfx-hit',
  'enemy-defeat': 'audio-sfx-enemy-defeat',
  fizzle: 'audio-sfx-fizzle',
  'incant-enter': 'audio-sfx-incant-enter',
  'reward-select': 'audio-sfx-reward-select',
  'room-clear': 'audio-sfx-room-clear',
  'boss-appear': 'audio-sfx-boss-appear',
};

export class GameAudio {
  private readonly scene: Phaser.Scene;
  private intro: Phaser.Sound.BaseSound | null = null;
  private loop: Phaser.Sound.BaseSound | null = null;
  private lastHitAt = -Infinity;

  static preload(scene: Phaser.Scene): void {
    scene.load.setPath(AUDIO_PATH);
    for (const element of Object.keys(CAST_KEYS) as SpellElement[]) {
      scene.load.audio(CAST_KEYS[element], `sfx-cast-${element}.ogg`);
    }
    for (const name of SFX_NAMES) {
      scene.load.audio(SFX_KEYS[name], `sfx-${name}.ogg`);
    }
    scene.load.audio('audio-bgm-combat-intro', 'bgm-combat-intro.ogg');
    scene.load.audio('audio-bgm-combat-loop', 'bgm-combat-loop.ogg');
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.sound.volume = MASTER_VOLUME;
    scene.sound.mute = this.readStoredMute();
    scene.input.keyboard?.on('keydown-M', this.toggleMute, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  playCast(element: SpellElement): void {
    this.scene.sound.play(CAST_KEYS[element]);
  }

  playSfx(name: SfxName): void {
    if (name === 'hit') {
      const now = this.scene.time.now;
      if (now - this.lastHitAt < 35) return;
      this.lastHitAt = now;
    }
    this.scene.sound.play(SFX_KEYS[name], {
      volume: name === 'hit' ? 0.75 : 1,
    });
  }

  playBgm(): void {
    if (this.intro?.isPlaying || this.loop?.isPlaying) return;

    this.intro = this.scene.sound.add('audio-bgm-combat-intro');
    this.loop = this.scene.sound.add('audio-bgm-combat-loop', { loop: true });
    this.intro.once(Phaser.Sound.Events.COMPLETE, () => this.loop?.play());
    this.intro.play();
  }

  private readonly toggleMute = (): void => {
    // 다음 값을 먼저 계산해 저장 — mute 대입 직후 게터가 이전 값을 돌려주는
    // Phaser 내부 타이밍 때문에 게터 재읽기로 저장하면 반전값이 기록된다.
    const next = !this.scene.sound.mute;
    this.scene.sound.mute = next;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(next));
    } catch {
      // Storage can be unavailable in privacy modes; muting still works in-session.
    }
  };

  private readStoredMute(): boolean {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private destroy(): void {
    this.scene.input.keyboard?.off('keydown-M', this.toggleMute, this);
    this.intro?.destroy();
    this.loop?.destroy();
    this.intro = null;
    this.loop = null;
  }
}
