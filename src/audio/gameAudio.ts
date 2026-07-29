import Phaser from 'phaser';
import type { SpellElement } from '../spell/types';
import type { GameSettings } from '../run/gameSettings';
import { DEFAULT_SETTINGS } from '../run/gameSettings';

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
export type BgmName = 'combat' | 'boss';

/** 마스터 — 설정의 효과음·배경음악 크기가 이 위에 곱해진다 */
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
  private currentBgm: BgmName | null = null;
  private bgmGeneration = 0;
  private lastHitAt = -Infinity;
  /** 설정의 볼륨 — 일시정지 메뉴에서 조절하면 applySettings로 들어온다 */
  private settings: GameSettings = { ...DEFAULT_SETTINGS };

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
    scene.load.audio('audio-bgm-boss-intro', 'bgm-boss-intro.ogg');
    scene.load.audio('audio-bgm-boss-loop', 'bgm-boss-loop.ogg');
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.sound.volume = MASTER_VOLUME;
    scene.sound.mute = this.readStoredMute();
    scene.input.keyboard?.on('keydown-M', this.toggleMute, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** 설정 반영 — 재생 중인 BGM 볼륨도 즉시 바꿔 조절이 귀로 확인된다. */
  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    const bgm = MASTER_VOLUME * this.settings.bgmVolume;
    (this.intro as Phaser.Sound.WebAudioSound | null)?.setVolume?.(bgm);
    (this.loop as Phaser.Sound.WebAudioSound | null)?.setVolume?.(bgm);
  }

  playCast(element: SpellElement): void {
    this.scene.sound.play(CAST_KEYS[element], {
      volume: MASTER_VOLUME * this.settings.sfxVolume,
    });
  }

  playSfx(name: SfxName): void {
    if (name === 'hit') {
      const now = this.scene.time.now;
      if (now - this.lastHitAt < 35) return;
      this.lastHitAt = now;
    }
    this.scene.sound.play(SFX_KEYS[name], {
      volume: MASTER_VOLUME * this.settings.sfxVolume * (name === 'hit' ? 0.75 : 1),
    });
  }

  playBgm(name: BgmName = 'combat'): void {
    if (this.currentBgm === name && (this.intro?.isPlaying || this.loop?.isPlaying)) return;

    this.stopBgm();
    this.currentBgm = name;
    const generation = ++this.bgmGeneration;
    const bgmVolume = MASTER_VOLUME * this.settings.bgmVolume;
    this.intro = this.scene.sound.add(`audio-bgm-${name}-intro`, { volume: bgmVolume });
    this.loop = this.scene.sound.add(`audio-bgm-${name}-loop`, { loop: true, volume: bgmVolume });
    this.intro.once(Phaser.Sound.Events.COMPLETE, () => {
      if (this.currentBgm === name && this.bgmGeneration === generation) {
        this.loop?.play();
      }
    });
    this.intro.play();
  }

  private stopBgm(): void {
    this.bgmGeneration += 1;
    this.intro?.destroy();
    this.loop?.destroy();
    this.intro = null;
    this.loop = null;
    this.currentBgm = null;
  }

  /** 현재 음소거 상태 — 일시정지 메뉴가 라벨(켬/끔)에 쓴다. */
  get muted(): boolean {
    return this.scene.sound.mute;
  }

  /**
   * M 키와 같은 토글 — 설정 오버레이도 이걸 부른다(두 경로가 같은 상태를 공유).
   * **새 값을 반환한다**: 대입 직후 게터가 이전 값을 돌려주는 Phaser 타이밍 때문에
   * 호출측이 곧바로 muted를 다시 읽으면 반전된 라벨이 나온다.
   */
  readonly toggleMute = (): boolean => {
    // 다음 값을 먼저 계산해 저장 — mute 대입 직후 게터가 이전 값을 돌려주는
    // Phaser 내부 타이밍 때문에 게터 재읽기로 저장하면 반전값이 기록된다.
    const next = !this.scene.sound.mute;
    this.scene.sound.mute = next;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(next));
    } catch {
      // Storage can be unavailable in privacy modes; muting still works in-session.
    }
    return next;
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
    this.stopBgm();
  }
}
