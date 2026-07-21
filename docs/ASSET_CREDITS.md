# Asset Credits

INCANT에 포함된 외부·AI 생성 에셋의 출처와 선정 근거를 기록한다. AI 생성 원본은 별도로 보관하고, 저장소에는 게임에서 사용하는 채택본만 포함한다.

## Audio

### 공통 생성 정보

- 효과음 생성 도구: Adobe Firefly — Generate Sound Effects
- BGM 생성 도구: Adobe Firefly — Generate Soundtrack (Beta)
- 생성일: Phase 3 에셋 2026-07-16, 보스 BGM 2026-07-19
- 생성 설정: 효과음 후보 Duration 1~2초, BGM Duration 90초, WAV 48 kHz stereo
- 이용 조건 확인일: 2026-07-17
- 이용 조건: Adobe 공식 안내에서 Generate Soundtrack 결과물을 royalty-free·상업적 사용 가능으로 명시하며, Firefly FAQ는 Beta 기능도 제품 내 별도 금지가 없는 한 상업 프로젝트에 사용할 수 있다고 안내한다.
- 효과음 라이선스 안내: <https://www.adobe.com/products/firefly/features/sound-effect-generator.html>
- 사운드트랙 라이선스 안내: <https://www.adobe.com/products/firefly/features/ai-music-generator.html>
- Firefly Beta 상업 이용 안내: <https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/adobe-firefly-faq.html>
- 게임 에셋 경로: `public/assets/audio/`
- Phaser 로드 기준: `load.setPath(import.meta.env.BASE_URL + 'assets/audio/')` (GitHub Pages 서브경로 대응, `/assets/...` 절대경로 금지)

### 공통 후처리

- 도구: 저장소의 `scripts/process-audio-assets.py` (표준 PCM16 WAV 처리)
- 무음 정리: -50dBFS 이상인 마지막 유효 신호 뒤 75ms를 남기고 후행 무음을 제거했다.
- 경계 처리: 출력 마지막 20ms에 선형 페이드아웃을 적용해 클릭과 절단감을 방지했다.
- 피크: 원소 발동·처치·방 클리어·보스 등은 -6dBFS, 타격은 -8dBFS, 불발은 -10dBFS, 영창 진입·보상 선택은 -7dBFS로 조정했다.
- 형식: WAV 원본 단계에서는 PCM16 stereo 48kHz를 유지했다. 최종 게임 포맷 변환과 인게임 체감 믹싱은 통합 QA에서 확정한다.

- BGM 편집: `scripts/create-bgm-loop.py`로 원본의 본격적인 첫 어택 직전인 10.05~16.81초를 6.76초 인트로로 사용하고, 14.25~75.69초 구간에 2.56초 equal-power 크로스페이드를 적용해 58.88초 길이의 `bgm-combat-loop.wav`를 만들었다.
- BGM 음량: 인트로와 루프에 동일한 게인을 적용해 피크를 -6dBFS로 맞췄으며, 인트로 종료 뒤 루프 본체가 이어지고 이후에는 루프 파일만 반복한다.
- 보스 BGM 편집: `boss-bgm_2.wav`의 저역 펄스가 시작되는 6.65~19.50초를 12.85초 인트로로 사용하고, 17.00~73.00초 구간에 2.50초 equal-power 크로스페이드를 적용해 53.50초 루프를 만들었다. 시작·종료 주변 평균 음량 차이는 약 0.02dB이며 피크는 -6dBFS로 맞췄다.
- 배포 포맷: 채택 WAV를 `scripts/convert-audio-assets.ps1`로 Vorbis OGG 128kbps, stereo 48kHz로 변환했다. WAV 원본은 외부 원본 백업에 보존하고 게임에는 OGG만 포함한다.
- 아래 채택 표의 `.wav` 게임 에셋명은 후처리 마스터 이름이며, 실제 `public/assets/audio/` 배포 파일은 같은 basename의 `.ogg`다.

### 채택 에셋

| 게임 에셋 | 원본 후보 | 프롬프트 | 선정 근거 |
|---|---|---|---|
| `sfx-cast-fire.wav` | `fire_1.wav` (Balanced) | `short arcane fire spell cast, immediate magical whoosh with crackling embers and a compact flame burst, dark fantasy arcade game SFX, powerful and clean, short decay, no large explosion, no voice, no music, 0.6 seconds` | 시작이 즉각적이고 Heavy 후보보다 감쇠가 빠르며, 불꽃 질감과 전투 믹싱 여유의 균형이 좋다. |
| `sfx-cast-water.wav` | `water_8.wav` (Water 8 — 집중 수류 방출, Duration 2초) | `arcane water spell cast, immediate focused surge of magical water with a strong liquid burst, flowing body, and a brief trailing splash with fading droplets, dark fantasy combat game SFX, fluid and energetic, clear sustained water texture, natural fully resolved ending, no tiny drip, no ocean ambience, no ice, no voice, no music, 0.85 seconds` | 기존 채택본보다 물의 몸체와 꼬리가 충분히 유지되면서 후처리 길이가 0.90초로 목표 범위에 맞고, 2초 출력 경계 전에 완전히 감쇠해 반복 전투에도 적합하다. |
| `sfx-cast-lightning.wav` | `electric_4.wav` (Lightning 6 — 번개 점화, Duration 2초) | `arcane lightning spell cast, immediate charged magical pulse with a powerful electric snap and a brief forked lightning discharge, followed by a short shimmering voltage trail, dark fantasy combat game SFX, energetic and versatile, natural controlled decay, fully resolved ending, no continuous current, no long tail, no thunder, no voice, no music, 0.7 seconds` | 기존 후보보다 시작이 빠르고 저역 몸체와 전기 고역의 균형이 좋아 강한 방전으로 들리며, 2초 출력 경계 전에 완전히 감쇠한다. |
| `sfx-cast-ice.wav` | `ice_2.wav` (Balanced) | `short arcane ice spell cast, immediate crystalline shimmer with a sharp frozen burst and a compact ice crack, dark fantasy arcade game SFX, cold and precise, short decay, no large glass crash, no voice, no music, 0.6 seconds` | Light 후보보다 저역이 적고 결정성 중고역이 뚜렷해 얼음 원소를 식별하기 쉬우며, 시작과 감쇠도 빠르다. |
| `sfx-cast-earth.wav` | `earth_9.wav` (Earth 13 — 대지 마력 파동, 변형 2, Duration 2초) | `stylized arcane earth spell cast, immediate deep magical earth pulse with a warm low-frequency swell, dense mineral resonance, and a short layer of smoothly shifting stone, dark fantasy action game SFX, powerful, polished, and clearly elemental, clean attack, controlled resolved decay, fully resolved ending, no rock crack, no fracture, no explosion, no debris, no realistic construction sound, no voice, no music, 0.8 seconds` | 동일 프롬프트 두 후보 중 끝 100ms 잔향이 약 7dB 더 낮아 경계가 깨끗하고, 기존 채택본의 강한 암석 파열음 대신 저역 마력 파동과 광물 공명을 중심으로 게임적인 대지 원소 질감을 제공한다. |
| `sfx-cast-wind.wav` | `wind_1.wav` (Balanced) | `short arcane wind spell cast, immediate fast magical air slash with a focused swirling gust, dark fantasy arcade game SFX, agile and sharp, short decay, no storm ambience, no voice, no music, 0.5 seconds` | Heavy 후보보다 저역 편중과 잔향이 적고 공기 흐름 대역이 상대적으로 살아 있어 빠른 돌풍으로 구분하기 쉽다. |
| `sfx-cast-light.wav` | `light_2.wav` (Light 5 — 응축된 광선 점화) | `short arcane light spell cast, immediate ignition of a focused magical light beam with a sharp radiant pulse and brief shimmering energy trail, dark fantasy combat game SFX, precise and energetic, short decay, no laser gun, no bell, no chime, no melody, no voice, no music, 0.6 seconds` | 추가 생성 후보 중 시작이 가장 빠르고 중고역·스파클 비중이 가장 높아 광선과 빛 에너지를 식별하기 좋다. |
| `sfx-cast-dark.wav` | `dark_1.wav` (Light — 그림자 스침) | `quick arcane dark spell cast, immediate shadow flick with a dry reversed whisper and tiny void pulse, dark fantasy arcade game SFX, subtle and sharp, very short decay, no horror voice, no music, 0.4 seconds` | Heavy 후보보다 시작이 빠르고 중고역의 그림자·왜곡 질감이 상대적으로 많아 어둠 원소를 구분하면서도 전투 반응성을 유지한다. |
| `sfx-hit.wav` | `hit_2.wav` (Hit 2 — 마력 파열, Duration 2초) | `very short arcane energy hit, immediate sharp magical crack with a compact force pulse and tiny dissipating energy particles, dark fantasy combat game SFX, clean and satisfying, fast natural decay, fully resolved ending, no fire, no lightning, no glass, no explosion, no voice, no music, 0.3 seconds` | 세 후보 중 활성 구간이 가장 짧고 시작이 빠르며, 타격 어택을 전달하는 중고역 비중이 가장 높아 반복 전투 가독성이 좋다. |
| `sfx-enemy-defeat.wav` | `defeat_2.wav` (Defeat 3 — 결정화 소멸, Duration 2초) | `short enemy defeated sound, immediate arcane fracture with a bright magical break and a brief shower of dissolving energy fragments, dark fantasy arcade combat game SFX, crisp and rewarding, natural decay, fully resolved ending, no glass crash, no elemental texture, no voice, no music, 0.6 seconds` | 동일 프롬프트 변형 중 저역 충격과 소멸 파편 대역의 균형이 좋고, 과도한 초고역과 피크를 피해 타격음과 구분되는 처치 피드백을 제공한다. |
| `sfx-fizzle.wav` | `fail_1.wav` (Fizzle 1 — 마력 소진, Duration 2초) | `short failed magic spell fizzle, immediate weak arcane sputter with a few fading sparks and a soft deflating magical puff, dark fantasy arcade game SFX, clearly unsuccessful and subtly comedic, fast natural decay, fully resolved ending, no voice, no music, 0.4 seconds` | 짧고 약한 음압으로 즉시 sputter한 뒤 사라져 성공한 공격과 혼동되지 않으며, 실패를 가볍고 명확하게 전달한다. |
| `sfx-incant-enter.wav` | `incant_4.wav` (Incant 4 — 마법진 전개, Duration 2초) | `arcane incantation mode activation, a magical circle rapidly unfolds with layered rune energy, rising luminous particles, and a focused shimmering lock at the end, dark fantasy spellcasting game SFX, mysterious and immersive, clear evolving motion, graceful natural decay, fully resolved ending, no heavy impact, no bass thump, no bell melody, no choir, no voice, no music, 1.1 seconds` | 약 1.2초 동안 중간 상승과 완료 후 감쇠 구조가 분명하고, 추가 후보 중 마법적 중고역이 가장 많아 영창 모드 전환의 몰입감을 잘 전달한다. |
| `sfx-reward-select.wav` | `reward_2.wav` (Reward 1 — 마법 보상 확정, 변형 2, Duration 2초) | `short magical reward selected sound, immediate bright arcane confirmation pulse with a compact sparkling flourish, dark fantasy game interface SFX, satisfying and elegant, fast natural decay, fully resolved ending, no melody, no coin sound, no voice, no music, 0.5 seconds` | 약 -6.9dBFS의 충분한 피크 여유와 선명한 중고역 확인음을 가져, 공격음과 구분되면서 짧고 만족스러운 선택 피드백을 제공한다. |
| `sfx-room-clear.wav` | `room_clear_2.wav` (Room Clear 2 — 봉인 해제, Duration 2초) | `short room clear confirmation, immediate release of dark magical tension followed by a radiant arcane bloom and a strong resolved energy finish, dark fantasy combat game SFX, triumphant but restrained, clear rising motion, fully resolved ending, no full song, no orchestral fanfare, no choir, no voice, 1.1 seconds` | 네 후보 중 저역 편중이 가장 낮고 마법적 중역이 가장 풍부해, 보상 선택음보다 크고 단순 충격음과 구분되는 방 클리어 완료감을 전달한다. |
| `sfx-boss-appear.wav` | `boss_appear_2.wav` (Boss Appear 1 — 고대 봉인 붕괴, 변형 2, Duration 2초) | `short ominous boss appearance stinger, immediate ancient magical seal breaking with a deep arcane impact and a threatening rising energy resonance, dark fantasy combat game SFX, intimidating and dramatic, fully resolved ending, no earthquake, no monster voice, no full music, no choir, 1.2 seconds` | 동일 프롬프트 변형 중 시작이 가장 빠르고 초저역 편중이 가장 낮으며 중저역·위협 질감이 풍부해 보스 출현의 위압감을 가장 명확하게 전달한다. |
| `bgm-combat-intro.wav`, `bgm-combat-loop.wav` | `combat_bgm_1.wav` (Combat BGM 1 — 다크 아케인 신스웨이브) | Vibe `intense, mysterious, hypnotic, steady`; Style `dark synthwave, electronic, arcane, instrumental`; Purpose `combat game`; Energy `High`; Tempo `Medium`; Duration `90 seconds` | 두 최종 후보의 음악적 품질은 모두 양호하나, 시작과 끝의 음량 차이가 약 0.8dB로 작고 저역 편중도 상대적으로 낮아 반복 재생과 SFX 믹싱에 더 적합하다. 저음량 도입부를 제외하고 첫 강한 어택 직전부터 재생하며, 사용자가 경계 미리듣기를 확인한 58.88초 루프 본체로 편집했다. |
| `bgm-boss-intro.wav`, `bgm-boss-loop.wav` | `boss-bgm_2.wav` (Boss BGM 2 — 공격적 다크 일렉트로닉) | Vibe `aggressive, urgent, climactic`; Style `dark electronic, industrial synthwave, driving rhythm, instrumental`; Purpose `boss battle`; Energy `High`; Tempo `Fast`; Duration `90 seconds` | 1번보다 저역 편중이 낮고 중역이 살아 있어 다양한 효과음과 섞기 쉬우며, 특정 최종 보스보다 여러 보스에 공통으로 사용할 수 있는 긴장도다. 사용자가 첫 저역 펄스부터 시작하는 인트로와 루프 경계를 확인했다. |

### 후보 판정 로그

| 원소 | 후보 | 프롬프트 방향 | 판정 | 사유 |
|---|---|---|---|---|
| Fire | `fire_1.wav` | Balanced — 불꽃 휩쓸기 | 채택 | 즉각적인 시작, 빠른 감쇠, 상대적으로 선명한 불꽃 질감으로 반복 전투에 적합하다. |
| Fire | `fire_2.wav` | Heavy — 압축된 화염 폭발 | 탈락 | 저음과 평균 음량이 과도해 BGM·타격음을 가리고 대지·어둠 계열과 혼동될 가능성이 있다. |
| Water | `water_1.wav` | Light — 물방울과 빠른 흐름 | 탈락 | 활성 구간이 약 0.26초로 매우 짧고 고역 중심이라 주문 발동음보다 물방울·UI음처럼 들릴 가능성이 있다. |
| Water | `water_2.wav` | Balanced — 소용돌이치는 물 | 교체 | 최초 채택했으나 약 0.94초까지 잔향이 이어져 1초 출력 경계에서 잘리는 느낌이 확인되어 재생성 후보로 교체했다. |
| Water | `water_3.wav` | Heavy — 깊은 수압 | 탈락 | 저역 에너지와 평균 음량이 가장 높아 대지 계열처럼 무겁게 느껴지고 반복 시 믹스를 가릴 가능성이 있다. |
| Water | `water_4.wav` | Water 4 — 응축된 물의 탄환 | 탈락 | 끝맺음은 개선됐지만 중고역 비중이 매우 높아 물보다는 얼음 결정이나 밝은 충격음과 겹칠 가능성이 있다. |
| Water | `water_5.wav` | Water 5 — 짧은 소용돌이 방출 | 탈락 | 끝부분은 자연스럽지만 실질적인 시작이 약 0.08초 늦어 주문 발동의 즉각성이 채택 후보보다 떨어진다. |
| Water | `water_6.wav` | Water 6 — 수압 파열 | 교체 | 1초 후보 중 가장 나아 임시 채택했으나, Duration 2초로 생성한 `water_7.wav`이 더 자연스럽게 끝나 최종 교체했다. |
| Water | `water_7.wav` | Water 4 — 응축된 물의 탄환 (Duration 2초) | 교체 | 끝단은 깨끗했지만 인게임에서 약 0.49초로 너무 짧고 약하게 들린다는 QA 결과에 따라 더 긴 수류 후보로 교체했다. |
| Water | `water_8.wav` | Water 8 — 집중 수류 방출 (Duration 2초) | 채택 | 후처리 길이 0.90초로 물의 몸체와 감쇠가 충분하며, 기존 채택본의 짧은 체감을 해결하면서 발동음 권장 범위에 맞는다. |
| Water | `water_9.wav` | Water 9 — 물의 소용돌이 (Duration 2초) | 탈락 | 후처리 길이가 약 1.91초로 길어 주문 반복 시 겹치고 전투 리듬을 흐릴 가능성이 있다. |
| Water | `water_10.wav` | Water 10 — 응축된 파도 충격 (Duration 2초) | 탈락 | 약 1.06초로 사용 가능한 수준이나, Water 8보다 길고 파도 충격 성격이 강해 범용 물 발동음으로는 우선순위가 낮다. |
| Lightning | `electric_1.wav` | Balanced — 마법 번개 방전 | 교체 | 밝고 선명하지만 고역 중심의 흐르는 전기처럼 느껴져, 더 강한 방전감과 자연스러운 끝맺음을 가진 2초 생성 후보로 교체했다. |
| Lightning | `electric_2.wav` | Heavy — 고전압 방출 | 탈락 | 6kHz 이상 고역 비중과 잔향이 더 커서 반복 재생 시 날카롭고 피로하게 들릴 가능성이 있다. |
| Lightning | `electric_4.wav` | Lightning 6 — 번개 점화 (Duration 2초) | 채택 | 약 0.01초에 시작하고 저역 몸체와 전기 고역을 함께 가져 강한 마법 방전으로 들리며, 약 1.17초에 감쇠해 다운로드 절단도 없다. |
| Ice | `ice_1.wav` | Light — 서리 결정 | 탈락 | 감쇠는 빠르지만 저역 비중이 상대적으로 높고 중고역의 결정성 질감이 약해 얼음 원소 식별성이 떨어진다. |
| Ice | `ice_2.wav` | Balanced — 결정화와 균열 | 채택 | 저역이 적고 1~6kHz 존재감이 뚜렷해 얼음 결정과 균열의 질감을 더 명확하게 전달한다. |
| Earth | `earth_1.wav` | Balanced — 암석 마찰과 충격 | 탈락 | 에너지 대부분이 120Hz 아래에 몰려 암석 마찰보다 저음 진동에 치우치고, 다른 전투음을 가릴 가능성이 있다. |
| Earth | `earth_2.wav` | Heavy — 지각의 진동 | 교체 | 최초 후보 중 원소 식별성이 좋아 임시 채택했으나, 약 0.97초까지 잔향이 이어져 다운로드 경계에서 잘리는 느낌 때문에 교체했다. |
| Earth | `earth_4.wav` | Earth 5 — 암석 분쇄 | 탈락 | 암석 질감은 선명하지만 실질적인 시작이 약 0.13초 늦고 마지막 5ms에도 비교적 강한 신호가 남아 절단 문제가 개선되지 않았다. |
| Earth | `earth_5.wav` | Earth 6 — 대지 충격파 | 탈락 | 시작은 빠르지만 활성 신호가 약 0.99초까지 이어지고 초저역 편중도 높아 기존 후보보다 끝맺음과 믹싱이 불리하다. |
| Earth | `earth_6.wav` | Earth 7 — 거대 암석 강타 (Duration 2초) | 교체 | 인게임에서 암석 파열음이 지나치게 강하고 현실적인 충돌음에 가까워, 게임용 대지 마법의 개성이 부족하다는 QA 결과에 따라 교체했다. |
| Earth | `earth_8.wav` | Earth 13 — 대지 마력 파동, 변형 1 (Duration 2초) | 탈락 | 스타일 방향은 적합하지만 마지막 100ms 잔향이 약 -33.0dBFS로 비교 후보보다 약 7dB 커서 반복 전투와 출력 경계에 불리하다. |
| Earth | `earth_9.wav` | Earth 13 — 대지 마력 파동, 변형 2 (Duration 2초) | 채택 | 끝 100ms 잔향이 약 -39.9dBFS로 더 깨끗하고, 파열 대신 저역 마력 파동과 광물 공명을 중심으로 한 게임용 대지 발동음 방향에 더 적합하다. |
| Earth | `earth_7.wav` | Earth 9 — 지맥 압축 충격 (Duration 2초) | 탈락 | 자연스럽게 끝나지만 저음 펄스 중심이고 암석 질감 대역이 적어 어둠 원소와 혼동될 가능성이 있다. |
| Wind | `wind_1.wav` | Balanced — 집중된 돌풍 | 채택 | Heavy 후보보다 저역과 잔향이 절제되고 공기 흐름을 나타내는 대역이 상대적으로 많아 빠른 바람 발동음에 적합하다. |
| Wind | `wind_2.wav` | Heavy — 압축 공기 폭발 | 탈락 | 에너지 91% 이상이 250Hz 아래에 몰리고 감쇠가 느려 바람보다 저음 폭발이나 대지 계열처럼 들릴 가능성이 있다. |
| Light | `light_1.wav` | Light 4 — 섬광 에너지 방출 | 탈락 | 감쇠는 빠르지만 에너지 대부분이 250Hz 아래에 몰리고 밝은 중고역이 거의 없어 빛 원소 식별성이 약하다. |
| Light | `light_2.wav` | Light 5 — 응축된 광선 점화 | 채택 | 세 후보 중 시작이 가장 빠르고 중고역 및 6kHz 이상 스파클 비중이 가장 높아 광선의 선명함을 전달하기 좋다. |
| Light | `light_3.wav` | Light 6 — 프리즘 파열 | 탈락 | 음압과 저역 비중이 높고 중고역 존재감이 채택 후보보다 낮아 빛보다 무거운 충격음처럼 들릴 가능성이 있다. |
| Dark | `dark_1.wav` | Light — 그림자 스침 | 채택 | 시작이 빠르고 Heavy 후보보다 중고역 왜곡 질감이 많아 짧은 그림자 발동음으로 구분하기 좋다. |
| Dark | `dark_2.wav` | Heavy — 심연의 압력 (변형 1) | 탈락 | 에너지 97% 이상이 120Hz 아래에 몰리고 감쇠가 느려 어둠 주문보다 지속적인 초저역 진동처럼 들릴 가능성이 있다. |
| Dark | `dark_3.wav` | Heavy — 심연의 압력 (변형 2) | 탈락 | 실질적인 시작이 약 0.2초 늦고 후반 음압이 크게 증가해 즉각적인 주문 피드백에 적합하지 않다. |
| Hit | `hit_1.wav` | Hit 1 — 아케인 충격 | 탈락 | 활성 구간은 짧지만 에너지 대부분이 저역에 몰려 선명한 타격보다 둔한 저음 충격처럼 들릴 가능성이 있다. |
| Hit | `hit_2.wav` | Hit 2 — 마력 파열 | 채택 | 약 0.015초에 시작해 0.11초에 감쇠하고, 세 후보 중 중고역 어택 비중이 가장 높아 빠른 반복 타격에 적합하다. |
| Hit | `hit_3.wav` | Hit 3 — 묵직한 마법 충돌 | 탈락 | 거의 전부 초저역으로 구성되어 타격 가독성이 낮고 대지 발동음과 혼동될 가능성이 있다. |
| Enemy defeat | `defeat_1.wav` | Defeat 3 — 결정화 소멸 (변형 1) | 탈락 | 8kHz 이상 에너지가 지나치게 많아 날카로운 유리 파손이나 얼음 원소 효과처럼 들리고 반복 시 피로할 가능성이 있다. |
| Enemy defeat | `defeat_2.wav` | Defeat 3 — 결정화 소멸 (변형 2) | 채택 | 저역 충격과 중고역 소멸 질감이 더 균형적이고 피크 여유가 있어 타격음 뒤에 겹쳐도 처치 여부를 구분하기 좋다. |
| Fizzle | `fail_1.wav` | Fizzle 1 — 마력 소진 | 채택 | 짧고 조용하며 약하게 sputter한 뒤 급격히 감쇠해 공격 성공음과 구분되고 불발의 힘 빠지는 인상을 전달한다. |
| Fizzle | `fail_2.wav` | Fizzle 2 — 불안정한 마법 붕괴 | 탈락 | 음압과 피크가 높아 실패음보다 작은 전기 폭발이나 공격 효과처럼 들릴 가능성이 있다. |
| Incant enter | `incant_1.wav` | Incant 1 — 룬 활성화 | 교체 | 신비로운 질감은 있으나 약 0.34초로 너무 짧고 다운로드 결과의 완성도가 부족해, 더 긴 상승 구조를 가진 후보로 교체했다. |
| Incant enter | `incant_2.wav` | Incant 3 — 주문서 개방 | 탈락 | 에너지 대부분이 저역에 몰려 UI 전환보다 둔한 충격이나 무거운 주문 발동음처럼 들릴 가능성이 있다. |
| Incant enter | `incant_4.wav` | Incant 4 — 마법진 전개 | 채택 | 약 1.2초 동안 에너지가 상승한 뒤 자연스럽게 감쇠하고, 새 후보 중 마법적 중고역 비중이 가장 높아 영창 진입 연출에 적합하다. |
| Incant enter | `incant_5.wav` | Incant 5 — 시간 감속과 마력 집중 | 탈락 | 거의 전부 초저역에 몰리고 음압도 높아 시간 감속 UI보다 무거운 충격이나 지속 저음처럼 들릴 가능성이 있다. |
| Incant enter | `incant_6.wav` | Incant 6 — 룬 공명과 영창 준비 (변형 1) | 탈락 | 초반 피크가 강하고 에너지 대부분이 초저역이라 단계적으로 룬이 깨어나는 상승감과 마법적 선명함이 부족하다. |
| Incant enter | `incant_7.wav` | Incant 6 — 룬 공명과 영창 준비 (변형 2) | 탈락 | 변형 1보다 상승 구조는 낫지만 마법적 중고역과 완료감이 `incant_4`보다 약해 최종 후보에서 제외했다. |
| Reward select | `reward_1.wav` | Reward 1 — 마법 보상 확정 (변형 1) | 탈락 | 매우 짧고 조용하며 초고역 비중이 높아 보상 확정보다 작은 반짝임이나 미세한 UI 클릭처럼 느껴질 가능성이 있다. |
| Reward select | `reward_2.wav` | Reward 1 — 마법 보상 확정 (변형 2) | 채택 | 약 0.34초의 선명한 중고역 확인음과 적절한 피크 여유로 짧고 만족스러운 선택 완료 피드백을 전달한다. |
| Reward select | `reward_3.wav` | Reward 2 — 룬 각인 | 탈락 | 저역 비중이 높고 전후반 음압이 비슷하게 유지되어 선택 확인음보다 둔한 충격이나 주문 효과처럼 들릴 가능성이 있다. |
| Room clear | `room_clear_1.wav` | Room Clear 1 — 마력 정화 | 탈락 | 활성 길이는 충분하지만 저역 편중이 강해 승리 스팅어보다 무거운 충격이나 대지 계열 효과처럼 들릴 가능성이 있다. |
| Room clear | `room_clear_2.wav` | Room Clear 2 — 봉인 해제 | 채택 | 비교 후보 중 저역 편중이 가장 낮고 마법적 중역이 가장 많아 긴장 해제와 밝은 완료감을 구분하기 좋다. |
| Room clear | `room_clear_3.wav` | Room Clear 3 — 승리 룬 완성 (변형 1) | 탈락 | 중간 상승과 피크 구조는 분명하지만 저역 중심이라 밝은 승리보다 무거운 마력 충격처럼 들릴 가능성이 있다. |
| Room clear | `room_clear_4.wav` | Room Clear 3 — 승리 룬 완성 (변형 2) | 탈락 | 상승 구조는 있으나 중고역의 보상감이 약하고 저역이 강해 보스 등장이나 대지 효과와 혼동될 가능성이 있다. |
| Boss appear | `boss_appear_1.wav` | Boss Appear 1 — 고대 봉인 붕괴 (변형 1) | 탈락 | 시작이 약 0.14초 늦고 초저역 편중이 강해 보스 연출보다 대지 충격이나 지속 저음처럼 들릴 가능성이 있다. |
| Boss appear | `boss_appear_2.wav` | Boss Appear 1 — 고대 봉인 붕괴 (변형 2) | 채택 | 즉시 시작하고 중저역과 위협 질감이 세 후보 중 가장 풍부해 약 1.86초 동안 보스 등장 위압감을 명확히 전달한다. |
| Boss appear | `boss_appear_3.wav` | Boss Appear 3 — 차원 균열 | 탈락 | 상승 구조는 있으나 초저역 편중이 높고 왜곡 질감이 약해 어둠·대지 원소음과 혼동될 가능성이 있다. |
| Combat BGM | `combat_bgm_1.wav` | Combat BGM 1 — 다크 아케인 신스웨이브 | 채택 | 시작·끝 음량이 유사하고 비교 후보보다 저역 편중이 낮아 루프 편집과 전투 SFX 믹싱에 유리하다. |
| Combat BGM | `combat_bgm_2.wav` | Combat BGM 2 — 빠른 전자 마법 전투 | 탈락 | 음악적 품질은 양호하지만 끝부분이 시작보다 약 7.9dB 크고 저역 비중이 높아 반복 경계와 저역 SFX 믹싱에 불리하다. |
| Boss BGM | `boss-bgm_1.wav` | Boss BGM 1 — 위압적 아케인 보스전 | 탈락 | 250Hz 이하 에너지가 약 92.6%로 저역과 압박감이 지나치게 강해 범용 보스전보다 최종 보스나 특수 페이즈에 가깝고, 전투 효과음을 가릴 가능성이 있다. |
| Boss BGM | `boss-bgm_2.wav` | Boss BGM 2 — 공격적 다크 일렉트로닉 | 채택 | 1번보다 주파수 균형과 전투 가독성이 좋고 과도하게 최고조에 고정되지 않아 범용 보스전 BGM에 적합하다. 17.00~73.00초 루프 경계의 음량과 청감을 확인했다. |

## Images (AI 생성)

### 공통 생성 정보

- 생성 도구: **Google Gemini — 이미지 생성 (Nano Banana 2)**
- 생성일: 2026-07-21
- 생성 주체: jaepaly(총괄)가 Gemini 웹에서 직접 생성. **프롬프트 설계는 Claude Code**, 후처리·통합도 Claude Code.
- 게임 에셋 경로: `public/assets/backgrounds/`, `public/assets/sprites/`
- 원본 보관: 저장소에는 가공된 채택본만 포함한다(오디오와 동일 원칙). 생성 원본 PNG는 외부 백업.
### 이용 조건 (확인일 2026-07-21)

**확인된 것**

- **Google은 생성물의 소유권을 주장하지 않는다.** Gemini 공식 도움말 문서에 그대로 명시돼 있다 — *"Google won't claim ownership over that content."* (출처: [Privacy and Terms of Use in Gemini Notebook](https://support.google.com/gemininotebook/answer/17004255))
- 현행 근거 문서는 **Google 이용약관**(시행 2024-05-22)이다. 과거의 `정책/약관/생성형 AI`(Generative AI Additional Terms, 2023-08-09)는 **2024-05-22부로 본 약관에 통합되어 더 이상 적용되지 않는다**(해당 페이지 상단 공지). 약관 링크: <https://policies.google.com/terms>
- 관련 제한 하나가 실제로 존재한다: Google 서비스의 **AI 생성물을 머신러닝 모델 학습에 사용하는 것은 금지**된다(Google 이용약관 "서비스 남용 금지"). → 본 프로젝트는 해당 없음(게임 내 표시용).

**확인되지 않은 것 (그대로 남긴다)**

- 오디오(Adobe Firefly)에는 *"royalty-free·상업적 사용 가능"* 을 명시한 공식 안내 페이지가 있으나, **Gemini 이미지 생성물에는 그에 대응하는 명시적 "상업적 이용 허용" 공식 문서를 찾지 못했다.** Google 이용약관 본문에도 AI 출력물의 소유권·상업 이용을 직접 규정한 조항은 없다. 검색 결과 상위에 뜨는 것들은 대부분 공식 문서가 아니라 커뮤니티 스레드다.
- 정리하면 **"소유권 주장 안 함"은 확인됐고, "상업적 이용 명시 허용"은 문서로 확인되지 않았다.** 둘은 다른 진술이므로 구분해서 기록한다.

**제출 관련 판단**

- 본 제출물은 해커톤 사전과제(포트폴리오·심사용)로 상업적 배포가 아니다. 위 "소유권 주장 안 함" + 본 문서의 출처 명시로 통상적인 요구는 충족한다고 본다.
- **NHN 해커톤 자체 규정에는 AI 생성 에셋 관련 조항이 없다** (총괄 확인, 2026-07-21). 주최 측이 정한 형식·제약이 없으므로, **고지 기준은 이 문서가 스스로 정한 수준을 따른다** — 생성 도구·주체·프롬프트 설계 근거·후처리 단계·채택 에셋을 전부 남긴다.
- 규정이 없다는 것이 기록을 줄일 이유는 아니다. **이 과제는 AI 활용 자체가 평가 대상**(제출물 ④)이라, 어디까지 AI가 만들고 어디서 사람이 판단했는지가 드러나는 기록은 준수 사항이 아니라 **제출물의 내용**이다.

### 공통 후처리 (Claude Code)

Gemini 출력은 **그대로 쓸 수 없어** 다음 처리를 거쳤다. 근거는 실측이다.

1. **워터마크 제거** — 모든 출력의 우하단에 Gemini 워터마크가 박힌다. 배경은 좌우대칭을 이용한 거울 패치를 페더링(smoothstep 알파) 합성해 이음새 없이 제거했고, 스프라이트는 피사체가 없는 모서리라 배경색으로 덮었다.
2. **누끼(배경 분리)** — **투명 PNG를 요청해도 실제 알파는 나오지 않는다.** Gemini는 알파 채널 대신 **체커보드 무늬를 픽셀로 그려서** 반환한다(생성 6종 실측: 전부 알파 0%·불투명 100%). 배경이 검정/체커보드(밝음·어두움)/흰색으로 갈려서, **테두리에서 배경 톤을 자동 검출한 뒤 flood-fill**로 바깥쪽만 제거했다. 단순 밝기 임계값은 어두운 결정판 내부까지 뚫려 못 쓴다. 알파 경계는 박스 블러로 페더링했다.
3. **재질/발광 분리** — 스프라이트를 통째로 `setTint`하면 곱셈이라 재질감이 죽고 단색 덩어리가 된다. 밝기 기준으로 **재질(`<key>.png`)과 발광 마스크(`<key>-glow.png`)** 두 장으로 분리해, 인게임에서 재질은 약한 틴트(40%)·발광은 타입 색 ADD로 합성한다(`src/render/spriteLayers.ts`).
4. **하이라이트 롤오프(배경)** — 보스 배경의 글리프 링이 너무 밝아 그 위에 올라간 몹이 씻겨나갔다. 밝은 영역만 선택적으로 누르는 톤커브(knee 0.40 / 최대 감쇠 42%, 피크 255→191)를 적용했다. 어두운 바닥 질감은 보존된다.

### 프롬프트 설계 규칙 (실패에서 도출)

| 규칙 | 근거 (실측된 실패) |
|---|---|
| 헥사 코드를 쓰지 않는다 | 프롬프트의 `#4C66FF`가 이미지에 **`4C66FF` 글자로 렌더**됐다 |
| 탑다운을 명시한다 (`straight from DIRECTLY ABOVE`, `NO horizon`) | 미지정 시 원근 아레나가 나와 탑다운 게임에 못 쓴다 |
| 투명 대신 순수 검정 배경 + `no haze/smoke/glow spill` | 투명은 안 나오고(위 2번), 코어 주변 연기가 남으면 누끼가 지저분해진다 |
| 글자·워터마크 금지를 명시한다 | 명시해도 워터마크는 붙지만 그 외 텍스트 혼입은 줄어든다 |
| `near-black`이 아니라 `mid-grey` 재질 | 너무 어두우면 인게임 크기(28~46px)에서 검은 덩어리로 뭉갠다 |
| 메커닉 요소(링 등)는 그리지 않게 한다 | 파수꾼 방패 링·보스 저항 링은 **정보를 담은 절차적 렌더**라 스프라이트가 그려오면 코어만 남기고 버려야 한다 |

### 채택 에셋

| 게임 에셋 | 용도 | 가공 | 비고 |
|---|---|---|---|
| `backgrounds/arena-stage1.jpg` | stage1·stage2 배경(월드 1920×1280 스크롤 맵) | 기존 아트를 월드 크기로 업스케일 + 절차적 질감(거친 얼룩·미세 그레인·샤픈) 합성 | stage2는 아직 이 이미지에 보라 틴트를 얹어 재사용 — 전용 배경은 #72 |
| `backgrounds/arena-boss.jpg` | 보스방 전용 배경 | 2528×1696 → 3:2 크롭 → 1920×1280, 워터마크 제거, 하이라이트 롤오프 | 탑다운 소환진 아레나. 중앙을 비워 전투 VFX 가독성 확보 |
| `sprites/enemy-shooter.png` (+`-glow`) | 사수 | 누끼·중심 정렬·256² | 타입 색 `0xffa62b` 주황 |
| `sprites/enemy-chaser.png` (+`-glow`) | 추격자 | 동일 | `0xff4d6d`. 스프라이트가 우향이라 회전 보정 0 |
| `sprites/enemy-splitter.png` (+`-glow`) | 분열체 | 동일 | `0x9f4dff` |
| `sprites/enemy-small-splitter.png` (+`-glow`) | 소형 분열체 | 동일 | `0xc56cff` |
| `sprites/enemy-shield-sentinel-core.png` (+`-glow`) | 파수꾼 **코어만** | 중앙 50% 크롭 + 원형 페더 | 방패 링은 **틈으로만 공격이 통하는 메커닉**이라 절차적 렌더 유지 |
| `sprites/enemy-boss-core.png` (+`-glow`) | 보스 **코어만** | 중앙 60% 크롭 + 원형 페더 | 저항 링은 **저항 원소를 색으로 알리는 정보**라 절차적 렌더 유지 |
| `sprites/player-invoker.png` (+`-glow`) | 플레이어 **인물만** | 중앙 42% 크롭 + 원형 페더 | 마법진은 절차적 렌더 유지(스프라이트의 링 내부 체커보드가 누끼로 안 빠짐) |

## Title and metadata

- `public/assets/favicon.svg`: INCANT 마법진과 중심 룬을 조합한 프로젝트 자체 제작 SVG. 외부 이미지 에셋이나 생성형 AI를 사용하지 않았다.
- `public/assets/og-incant.svg`: Phaser 타이틀 화면의 색상·마법진·코드 타이포그래피를 재사용한 프로젝트 자체 제작 1200×630 SVG 원본.
- `public/assets/og-incant.png`: 위 SVG를 Sharp로 1200×630 PNG 렌더링한 소셜 공유용 이미지.
- Noto Serif KR: 타이틀 카피와 주문명 각인에 사용. Google Fonts 공식 가변 TTF에서 영문·한글 자모·한글 완성형·기본 문장부호를 포함한 WOFF2를 제작해 `public/assets/fonts/NotoSerifKR-Variable.woff2`로 자체 호스팅한다. SIL Open Font License 1.1 원문은 `public/assets/fonts/OFL-NotoSerifKR.txt`에 포함했다. 출처: <https://github.com/google/fonts/tree/main/ofl/notoserifkr>
