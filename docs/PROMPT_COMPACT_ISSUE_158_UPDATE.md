## compact 프롬프트 A/B 결과 — NO-GO, production 미변경

별도 브랜치 [`codex/judge-prompt-compact-spike`](https://github.com/jaepaly/NHN-Project/tree/codex/judge-prompt-compact-spike)와 Cloudflare Version Preview에서만 검증했습니다. `wrangler deploy`/`versions deploy`는 실행하지 않았고 production 트래픽은 바꾸지 않았습니다.

### 변경·게이트

- 현행 named/nested JSON, enum, validator, 엔진은 유지
- prompt 7,016자 → compact-text 4,696자(-33.1%) → 보강 r3 4,918자(-29.9%)
- plan 내부 로컬 기본값과 재계산 필드만 생략
- 결과 전에 8종 smoke, 공개 30, held-out 12, 품질/지연 합격선을 동결
- 정적 계약, full/sparse validate→resolve 동등성, 기존 plan/sequence/fallback 회귀와 build 통과

### Preview 실측

1. `compact-text` (`9dbd68ab…`)
   - 명시 복합 3번째 입력에서 Gemini가 JSON 닫는 괄호를 끝내지 않아 Worker `invalid llm output` 502 → 재시도 없이 NO-GO.
2. `sparse-plan` (`37cda1a0…`)
   - 같은 입력을 유효 JSON으로 줄였지만 `적에게 파고들어 칼날로 벤다`를 single spell로 강등 → NO-GO.
3. `sparse-plan-r2/r3` (`598bfadf…`, `cc4231c3…`)
   - 이동+공격은 sequence로 복구.
   - `불사조의 낙화`, `심장이 두 번 뛰는 동안`을 계속 single로 강등했고 후자는 입력에 없는 heal까지 추가.
   - 마지막 표본 response 중앙값은 baseline 549B → candidate 343B(-37.5%)였으나 p50은 1,506ms → 1,567ms(+61ms)로 빨라지지 않음.

### 결정

품질 스모크가 먼저 실패했으므로 예정한 42종 품질 및 36콜 지연 집중 측정은 실행하지 않았습니다. 이 축약 후보는 PR·배포하지 않습니다. 결과 원문은 `docs/PROMPT_COMPACT_*_SMOKE_2026-07-29.json`, 설계·중단선·버전은 `docs/PROMPT_COMPACT_SPIKE_2026-07-29.md`에 남겼습니다.

다음 실험을 한다면 compact-text를 더 튜닝하기보다 **원본 v2.15 규칙은 보존하고 sparse output만 적용하는 별도 팔**로 다시 사전 게이트를 고정하는 편이 안전합니다.
