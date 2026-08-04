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
  'ui-confirm',
  'mana-crystal-pickup',
  'route-transition',
  'player-hit',
  'title-start',
  'run-complete',
  'trap-room-enter',
  'elite-room-enter',
  'ui-cursor-move',
  'boss-volley-fire',
  'boss-charge-start',
  'boss-charge-end',
  'boss-pattern-warning',
  'boss-summon',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];
export type BgmName = 'combat' | 'boss' | 'title' | 'reward' | 'altar';

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
  'ui-confirm': 'audio-sfx-ui-confirm',
  'mana-crystal-pickup': 'audio-sfx-mana-crystal-pickup',
  'route-transition': 'audio-sfx-route-transition',
  'player-hit': 'audio-sfx-player-hit',
  'title-start': 'audio-sfx-title-start',
  'run-complete': 'audio-sfx-run-complete',
  'trap-room-enter': 'audio-sfx-trap-room-enter',
  'elite-room-enter': 'audio-sfx-elite-room-enter',
  'ui-cursor-move': 'audio-sfx-ui-cursor-move',
  'boss-volley-fire': 'audio-sfx-boss-volley-fire',
  'boss-charge-start': 'audio-sfx-boss-charge-start',
  'boss-charge-end': 'audio-sfx-boss-charge-end',
  'boss-pattern-warning': 'audio-sfx-boss-pattern-warning',
  'boss-summon': 'audio-sfx-boss-summon',
};

interface SfxPolicy {
  volumeScale: number;
  cooldownMs: number;
}

const DEFAULT_SFX_POLICY: SfxPolicy = { volumeScale: 1, cooldownMs: 0 };
const SFX_POLICY: Partial<Record<SfxName, SfxPolicy>> = {
  hit: { volumeScale: 0.5, cooldownMs: 35 },
  'enemy-defeat': { volumeScale: 0.6, cooldownMs: 50 },
  'player-hit': { volumeScale: 1, cooldownMs: 90 },
  'mana-crystal-pickup': { volumeScale: 0.65, cooldownMs: 110 },
  'ui-confirm': { volumeScale: 0.9, cooldownMs: 80 },
  'route-transition': { volumeScale: 1, cooldownMs: 250 },
  'title-start': { volumeScale: 1, cooldownMs: 250 },
  'run-complete': { volumeScale: 1, cooldownMs: 500 },
  'trap-room-enter': { volumeScale: 1.25, cooldownMs: 500 },
  'elite-room-enter': { volumeScale: 1.25, cooldownMs: 500 },
  'ui-cursor-move': { volumeScale: 0.55, cooldownMs: 45 },
  'boss-volley-fire': { volumeScale: 0.9, cooldownMs: 250 },
  'boss-charge-start': { volumeScale: 0.9, cooldownMs: 250 },
  'boss-charge-end': { volumeScale: 1.2, cooldownMs: 250 },
  'boss-pattern-warning': { volumeScale: 0.85, cooldownMs: 500 },
  'boss-summon': { volumeScale: 0.85, cooldownMs: 350 },
};

/** 같은 -6dBFS 마스터라도 곡의 밀도·대역에 따라 체감 음량이 달라 공간별로 보정한다. */
const BGM_VOLUME_SCALE: Partial<Record<BgmName, number>> = {
  altar: 1.2,
};

export class GameAudio {
  private readonly scene: Phaser.Scene;
  private intro: Phaser.Sound.BaseSound | null = null;
  private loop: Phaser.Sound.BaseSound | null = null;
  private currentBgm: BgmName | null = null;
  private bgmGeneration = 0;
  private readonly lastSfxAt = new Map<SfxName, number>();
  /** 설정의 볼륨 — 일시정지 메뉴에서 조절하면 applySettings로 들어온다 */
  private settings: GameSettings = { ...DEFAULT_SETTINGS };

  static preload(scene: Phaser.Scene): void {
    for (const element of Object.keys(CAST_KEYS) as SpellElement[]) {
      scene.load.audio(CAST_KEYS[element], `${AUDIO_PATH}sfx-cast-${element}.ogg`);
    }
    for (const name of SFX_NAMES) {
      this.preloadSfx(scene, name);
    }
    for (const name of ['combat', 'boss', 'reward', 'altar'] as BgmName[]) {
      this.preloadBgm(scene, name);
    }
  }

  /** 타이틀처럼 전체 GameAudio를 만들지 않는 씬에서 필요한 SFX 하나만 준비한다. */
  static preloadSfx(scene: Phaser.Scene, name: SfxName): void {
    const key = SFX_KEYS[name];
    if (scene.cache.audio.exists(key)) return;
    scene.load.audio(key, `${AUDIO_PATH}sfx-${name}.ogg`);
  }

  /** 타이틀 등 필요한 트랙만 싣는 씬과 전체 전투 preload가 공유하는 BGM 로더. */
  static preloadBgm(scene: Phaser.Scene, name: BgmName): void {
    const introKey = `audio-bgm-${name}-intro`;
    const loopKey = `audio-bgm-${name}-loop`;
    if (!scene.cache.audio.exists(introKey)) {
      scene.load.audio(introKey, `${AUDIO_PATH}bgm-${name}-intro.ogg`);
    }
    if (!scene.cache.audio.exists(loopKey)) {
      scene.load.audio(loopKey, `${AUDIO_PATH}bgm-${name}-loop.ogg`);
    }
  }

  /** 타이틀의 일회성 시작음처럼 GameAudio 인스턴스 밖에서 설정 볼륨을 지켜 재생한다. */
  static playOneShot(scene: Phaser.Scene, name: SfxName, settings: GameSettings): void {
    const policy = SFX_POLICY[name] ?? DEFAULT_SFX_POLICY;
    scene.sound.volume = MASTER_VOLUME;
    try {
      scene.sound.mute = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      // Storage can be unavailable; keep the current in-session mute state.
    }
    scene.sound.play(SFX_KEYS[name], {
      volume: settings.sfxVolume * policy.volumeScale,
    });
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.sound.volume = MASTER_VOLUME;
    scene.sound.mute = this.readStoredMute();
    scene.input.keyboard?.on('keydown-M', this.toggleMute, this);
    document.addEventListener('pointerover', this.onDomPointerOver, true);
    document.addEventListener('focusin', this.onDomFocusIn, true);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** 설정 반영 — 재생 중인 BGM 볼륨도 즉시 바꿔 조절이 귀로 확인된다. */
  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    const bgm = MASTER_VOLUME * this.settings.bgmVolume * this.currentBgmVolumeScale();
    (this.intro as Phaser.Sound.WebAudioSound | null)?.setVolume?.(bgm);
    (this.loop as Phaser.Sound.WebAudioSound | null)?.setVolume?.(bgm);
  }

  playCast(element: SpellElement): void {
    this.scene.sound.play(CAST_KEYS[element], {
      volume: MASTER_VOLUME * this.settings.sfxVolume,
    });
  }

  playSfx(name: SfxName): void {
    const policy = SFX_POLICY[name] ?? DEFAULT_SFX_POLICY;
    const now = this.scene.time.now;
    const lastAt = this.lastSfxAt.get(name) ?? -Infinity;
    if (now - lastAt < policy.cooldownMs) return;
    this.lastSfxAt.set(name, now);
    this.scene.sound.play(SFX_KEYS[name], {
      volume: MASTER_VOLUME * this.settings.sfxVolume * policy.volumeScale,
    });
  }

  /** 미러 캐스트는 영창 진입 뒤 원소 어택을 따로 내 보스 BGM 아래에서도 식별되게 한다. */
  playMirrorCast(element: SpellElement): void {
    this.playSfx('incant-enter');
    this.scene.time.delayedCall(90, () => {
      this.scene.sound.play(CAST_KEYS[element], {
        volume: MASTER_VOLUME * this.settings.sfxVolume * 1.4,
        detune: -180,
      });
    });
  }

  playBgm(name: BgmName = 'combat'): void {
    if (this.currentBgm === name && (this.intro?.isPlaying || this.loop?.isPlaying)) return;

    this.stopBgm();
    this.currentBgm = name;
    const generation = ++this.bgmGeneration;
    const bgmVolume = MASTER_VOLUME * this.settings.bgmVolume * this.currentBgmVolumeScale();
    this.intro = this.scene.sound.add(`audio-bgm-${name}-intro`, { volume: bgmVolume });
    this.loop = this.scene.sound.add(`audio-bgm-${name}-loop`, { loop: true, volume: bgmVolume });
    this.intro.once(Phaser.Sound.Events.COMPLETE, () => {
      if (this.currentBgm === name && this.bgmGeneration === generation) {
        this.loop?.play();
      }
    });
    this.intro.play();
  }

  /** 씬 전환 직전처럼 shutdown 이벤트보다 먼저 음악을 확실히 끊어야 할 때 사용한다. */
  stopBgm(): void {
    this.bgmGeneration += 1;
    this.intro?.destroy();
    this.loop?.destroy();
    this.intro = null;
    this.loop = null;
    this.currentBgm = null;
  }

  private currentBgmVolumeScale(): number {
    return this.currentBgm ? (BGM_VOLUME_SCALE[this.currentBgm] ?? 1) : 1;
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

  private readonly onDomPointerOver = (event: PointerEvent): void => {
    const target = this.interactiveDomTarget(event.target);
    if (!target) return;
    const previous = this.interactiveDomTarget(event.relatedTarget);
    if (previous === target) return;
    this.playSfx('ui-cursor-move');
  };

  private readonly onDomFocusIn = (event: FocusEvent): void => {
    if (this.interactiveDomTarget(event.target)) this.playSfx('ui-cursor-move');
  };

  private interactiveDomTarget(value: EventTarget | null): Element | null {
    if (!(value instanceof Element)) return null;
    const target = value.closest('button, [role="button"], [tabindex]');
    if (!target || target.getAttribute('aria-disabled') === 'true') return null;
    if (target instanceof HTMLButtonElement && target.disabled) return null;
    return target;
  }

  private destroy(): void {
    this.scene.input.keyboard?.off('keydown-M', this.toggleMute, this);
    document.removeEventListener('pointerover', this.onDomPointerOver, true);
    document.removeEventListener('focusin', this.onDomFocusIn, true);
    this.stopBgm();
  }
}
