# 방 종류별 배경 생성 프롬프트 (Nano Banana)

총괄 요청: *"방 종류 새로 뽑자. 프롬프트 주면 내가 나노바나나로 뽑아올게."*

기존 배경(`arena-stage1.jpg`·`arena-stage2.jpg`·`arena-boss.jpg`)과 같은 계열을 유지하면서
정예·함정·보물·제단 네 종류를 추가한다. 현재는 그 넷이 바탕색·틴트로만 구분된다(#285).

---

## 0. 반드시 지킬 제약 (과거에 실제로 겪은 것들)

`docs/AI_USAGE_LOG.md` 2026-07-21 항목에서 배운 것이라 **반복하면 안 되는** 사항이다.

| 제약 | 이유 |
|---|---|
| **1920 × 1280** 정확히 | 월드 크기다. 다르면 `setDisplaySize`가 늘려 화질이 깨진다 |
| **어두운 바닥 · 낮은 하이라이트** | 지난번 배경이 너무 밝아 **스프라이트가 씻겨나갔다.** 톤커브(knee 0.40 / 최대 −42%)로 후보정해야 했다. 처음부터 어둡게 뽑으면 그 공정이 필요 없다 |
| **우하단 워터마크 확인** | Gemini가 우하단에 워터마크를 넣는다. 지난번 좌우대칭 거울 패치로 지웠고 1차 좌표 오차로 재작업했다. 뽑은 뒤 **우하단을 먼저 볼 것** |
| **글자·기호·UI 금지** | 룬 문양이 글자처럼 보이면 HUD와 섞여 읽힌다 |
| **탑다운(위에서 내려다본) 시점** | 스프라이트가 탑다운이라 원근이 섞이면 바닥이 기울어 보인다 |
| **중앙·좌우 끝을 비울 것** | 아래 §1 참조. 게임 오브젝트가 정해진 자리에 놓인다 |
| JPG로 저장 | 기존과 동일. 배경은 알파가 필요 없다 |

## 1. 비워둬야 하는 영역 (게임 오브젝트가 놓이는 자리)

배경에 **밝은 디테일·강한 무늬를 두면 안 되는** 좌표다. 어두운 바닥이면 된다.

```
1920 × 1280

 ┌──────────────────────────────────────────────────┐
 │ [HUD 좌상단 300×130]        [HUD 우상단 288×95]  │  ← 밝은 디테일 금지
 │                                                  │
 │   ●도착                    ◆설치물          ▣포탈│
 │  (176,640)                (960,640)      (1840,  │
 │                                          538·742)│
 │                                                  │
 │                                                  │
 └──────────────────────────────────────────────────┘
```

- **(176, 640) 반경 120** — 플레이어가 도착하는 자리
- **(960, 640) 반경 140** — 보물상자·제단이 서는 자리 (보물·제단 방만)
- **(1840, 538) / (1840, 742) 각 반경 90** — 출구 포탈
- **상단 좌 300×130 / 상단 우 288×95** — HUD가 덮는다. 밝은 무늬가 있으면 글씨가 안 읽힌다
- **함정방만**: 중앙을 지나는 **십자 통로(폭 128px)** 가 밝은 안전지대로 읽혀야 한다.
  가로는 y 576~704 전체 폭, 세로는 x 896~1024 전체 높이

## 2. 공통 접두 (네 프롬프트 앞에 그대로 붙인다)

```
Top-down orthographic view of an arcane arena floor, 1920x1280, dark low-key
lighting. Seamless flat floor plane seen from directly above — no perspective,
no horizon, no walls in view. Very dark base values (most of the image between
5% and 20% luminance) so bright game sprites layered on top stay readable.
Highlights only as thin faint lines, never large glowing areas. No text, no
letters, no numbers, no runes that resemble writing, no UI elements, no frame,
no vignette. Keep the exact center, the far-left middle, and the far-right edge
as plain uncluttered dark floor. Painted digital art, subtle grain, muted
saturation.
```

## 3. 방 종류별 프롬프트

### 정예방 (elite) → `arena-elite.jpg`

```
[공통 접두] Cracked obsidian battle floor with dried rust-red veins seeping
through the fractures, faint ember glow deep inside the cracks. Scorch marks
radiating outward from several impact points, as if something heavy landed here
repeatedly. Broken shards of dark iron half-buried in the stone. Oppressive and
narrow in feeling. Dominant hues: charcoal black, dried blood red, dull iron.
```

### 함정방 (trap) → `arena-trap.jpg`

```
[공통 접두] Corroded stone floor drowned in shallow toxic teal mist that pools
in the low areas, faint green bioluminescence from cracks. A clean dry raised
walkway forms a wide cross through the exact center of the image — horizontal
band and vertical band, both clearly lighter and clearly dry, meeting at the
middle. The mist stays outside that cross. Rusted grates and corroded metal
seams in the misted areas. Dominant hues: deep teal, sickly green, wet slate.
```

> ⚠️ 이 방만 십자 통로가 **필수**다. 안전지대라 밝고 마른 바닥으로 읽혀야 하고,
> 독기는 그 밖에만 깔려야 한다. 통로가 안 나오면 다시 뽑는 게 낫다.

### 보물방 (treasure) → `arena-treasure.jpg`

```
[공통 접두] Quiet vault floor of dark polished stone inlaid with thin tarnished
gold filigree lines that trace calm concentric patterns. Scattered dull coins
and a few small gemstones resting in the seams, catching only faint light. No
threat, no damage, no cracks — the floor is intact and swept. Warmer than the
other rooms but still dark. Dominant hues: near-black brown, tarnished gold,
warm amber shadow.
```

### 제단방 (altar) → `arena-altar.jpg`

```
[공통 접두] Ritual chamber floor of dark violet basalt, a single wide ring of
worn carved grooves encircling the exact center (the ring itself must stay
empty and dark inside). Old dried offering stains radiating from the ring.
Cold amethyst light bleeding faintly upward from the grooves. Solemn, still,
slightly unwelcoming — a place where something is given up. Dominant hues:
deep violet, cold amethyst, bruised purple-grey.
```

## 4. 뽑은 뒤 확인 순서

1. **우하단 워터마크** — 있으면 지워야 한다
2. **밝기** — 전체가 어두운가. 밝은 덩어리가 있으면 그 위의 몹이 안 보인다
3. **§1 영역** — 중앙·좌중앙·우측 끝이 비어 있나
4. **함정방만** — 십자 통로가 밝고 마른 바닥으로 읽히나
5. **글자처럼 보이는 무늬** — 있으면 HUD와 섞인다
6. 크기가 정확히 1920×1280인가

## 5. 배선 (파일 주시면 제가 합니다)

`public/assets/backgrounds/` 에 위 파일명으로 넣어주시면:

- `ProtoScene.preload`에 `bg-elite`·`bg-trap`·`bg-treasure`·`bg-altar` 로드 추가
- `applyRoomBackdrop`의 텍스처 선택을 노드 종류 기반으로 확장
  (지금은 `bg-boss` / `bg-stage2` / `bg-stage1` 세 갈래)
- 전용 배경이 붙는 종류는 `bgTint`를 흰색으로 되돌린다 —
  틴트는 아트가 없을 때의 대체 수단이고, `setTint`는 곱셈이라 재질감을 죽인다
  (스프라이트에서 이미 겪은 문제. AI_USAGE_LOG 2026-07-21)
- 로드 실패 시 기존 스테이지 배경으로 폴백 (배경 하나 없다고 방이 안 뜨면 안 된다)
- 회귀: 종류별 텍스처 키 매핑과 폴백 경로
