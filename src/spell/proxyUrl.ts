/**
 * 판정 프록시(Cloudflare Worker) 기본 주소 — 판정·보스 대사·진화 작명이 같은 워커를 쓴다.
 *
 * 2026-10-20 사용자 본인 Cloudflare 계정의 워커로 옮겼다(종전 주소는 팀원 계정
 * `incant-judge-proxy.diawodbsdot.workers.dev`). 예전엔 세 모듈이 주소를 각자 들고 있어
 * 바꿀 때 한 곳만 빠뜨리면 그 기능만 옛 워커를 계속 불렀다 — 여기 한 곳에서 정한다.
 */
export const DEFAULT_PROXY_URL = 'https://incant-judge-proxy.jaepaly.workers.dev';
