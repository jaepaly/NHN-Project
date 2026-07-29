## 원본 v2.15 + sparse output A/B 결과 — NO-GO

compact-text NO-GO의 후속으로, 이번에는 원본 v2.15 규칙·우선순위·12개 예시를 전부 보존하고 `spell_plan` 기본값 생략 지시만 추가했습니다.

### 격리·로컬 검증

- 별도 branch: [`codex/judge-sparse-output-spike`](https://github.com/jaepaly/NHN-Project/tree/codex/judge-sparse-output-spike)
- Preview Version: `e54fada5-60cd-4829-9417-0d7d8d181ce5`
- production traffic 0%, `wrangler deploy`/`versions deploy` 미실행
- sparse 지시·예시를 역변환한 prompt의 LF SHA-256이 원본 Git blob `1279f406…`과 일치
- full/sparse plan이 validate→resolve 뒤 동일
- 로컬 sample 484B→360B(-25.6%)
- 기존 judge fallback·plan validate·sequence 회귀와 build 통과

### 라이브 스모크

첫 실행 S5 `심장이 두 번 뛰는 동안`은 baseline/candidate가 모두 single+무단 지원 효과로 같은 기존 오판을 냈습니다. 원본 보존 실험의 비열화 기준에 맞게 smoke safety를 paired baseline보다 증가하지 않음으로 정정했고, 42종 품질의 절대 0건 기준은 유지했습니다.

재실행은 S6 `팔원소 대합창`에서 명확한 candidate 전용 회귀로 중단했습니다.

- baseline: 3 sequence, 6 damage form, 1,844B, 무단 지원 0
- candidate: 2 sequence, 4 form, 1,006B, 입력에 없는 `shield/self` 1건
- candidate가 medium/normal 등 일부 기본값을 계속 출력했으므로, 큰 bytes 감소는 순수 필드 생략이 아니라 6→4 form 의미 축소의 영향도 큼
- S1~S6 candidate p50 1,670ms, p90 3,418ms, 3.2초 초과 1건(지연 집중 표본이 아니므로 속도 결론에는 사용하지 않음)

### 결정

paired safety가 0→1로 악화해 사전 중단선에 걸렸습니다. 42종 품질과 36콜 지연 집중은 실행하지 않았고, 이 후보는 PR·production 배포하지 않습니다. 원문 응답은 `docs/SPARSE_OUTPUT_SMOKE_2026-07-29.json`과 `docs/SPARSE_OUTPUT_SMOKE_R2_2026-07-29.json`에 남겼습니다.

결론적으로 Gemini에 “기본 필드만 생략”을 지시해도 단순 직렬화 압축이 아니라 계획 내용 선택까지 달라집니다. 프롬프트만으로 안전한 출력 압축을 얻는 두 접근(compact-text, 원본+sparse)은 모두 NO-GO입니다.
