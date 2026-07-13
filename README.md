# INCANT (가칭) — 말이 곧 마법이 되는 로그라이크

> **NAN 2026 (NHN Game × AI Hackathon) 사전과제 제출작**
> 정해진 스킬은 없다. 당신이 입력한 문장이 곧 주문이 된다.

자유 텍스트로 주문을 영창하면 LLM이 의미·창의성을 판정해 실시간 이펙트로 구현하는 **AI-네이티브 로그라이크**.
보스는 당신이 쓴 주문을 기억하고 대비한다 — 매 순간 새로운 마법을 창작해야 살아남는다.

## 🎮 플레이

- **데모**: https://jaepaly.github.io/NHN-Project/ (기술검증 프로토타입)
- **조작**: WASD 이동 / **Enter** 영창 모드(슬로모션) → 아무 문장이나 입력 → 그것이 주문이 된다

## 🛠 로컬 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 프로덕션 빌드 (dist/)
```

LLM 판정은 기본적으로 로컬 MockJudge(키워드 판정)로 동작하므로 API 키 없이 실행 가능.
실제 LLM 판정을 쓰려면 [proxy/README.md](proxy/README.md)를 따라 프록시를 배포하고 `.env`에 URL 설정.

## 📚 문서

| 문서 | 내용 |
|---|---|
| [docs/GDD.md](docs/GDD.md) | 게임 디자인 문서 (컨셉·주문 시스템·기억 보스·아키텍처) |
| [docs/ROLES.md](docs/ROLES.md) | 팀원 역할 분담 |
| [docs/SUBMISSION_PLAN.md](docs/SUBMISSION_PLAN.md) | 제출물 5종 계획 + 주차별 마일스톤 |
| [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md) | AI 활용 로그 (전원 기록 의무) |

## 🏗 기술 스택

TypeScript · Vite · Phaser 3 · Gemini Flash (Cloudflare Workers 프록시) · GitHub Pages

## 팀

3인 팀 — 전원 AI 에이전트(Claude Code / Codex) 주도 개발. 역할은 [docs/ROLES.md](docs/ROLES.md) 참조.
