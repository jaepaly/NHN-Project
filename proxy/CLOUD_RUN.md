# 고정 리전 Cloud Run 판정 프록시

Cloudflare Worker의 실행 egress가 Gemini에서 지역 미지원으로 판정될 때 쓰는 **공용 데모용 대체 배포 경로**다. Cloud Run 서비스를 Tokyo `asia-northeast1`에 명시적으로 만들고, 이 서버는 기존 [`worker.js`](worker.js)를 직접 실행한다. 따라서 Gemini 프롬프트, JSON 계약, CORS, rate limit, `/boss-line`, `/evolve-name` 로직을 별도로 복제하지 않는다.

> 이 구성은 지역을 고정해 장애 원인을 줄이는 방법이지, Gemini 무료 등급의 쿼터·모델 정책을 없애는 방법은 아니다. 실제 URL 전환 전에는 반드시 응답 상태와 지역 오류 0건을 확인한다.

## 비용·권한 경계

- Cloud Run은 요청 기반으로 scale-to-zero가 가능하고, Tokyo도 Cloud Run 무료 할당량 적용 대상이다. 다만 Google Cloud 프로젝트·결제 계정·서비스 생성 권한이 필요하다. 무료 할당량을 넘으면 비용이 발생할 수 있으므로 `min-instances=0`, `max-instances=3`을 유지하고 예산 알림을 설정한다.
- Gemini 키는 Secret Manager에만 저장한다. `GEMINI_API_KEY`를 저장소, GitHub Pages의 `VITE_` 변수, Cloud Build 업로드 파일에 넣지 않는다. `proxy/.gcloudignore`가 로컬 `.dev.vars` 업로드를 차단한다.
- `asia-northeast1`은 Tokyo다. 지역명이 배포 위치를 보장하지만 Gemini API의 서비스 약관·쿼터는 별도로 적용된다.

공식 참고: [Cloud Run Node 배포](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service), [Cloud Run 요금](https://cloud.google.com/run/pricing), [Secret Manager 연결](https://cloud.google.com/run/docs/configuring/services/secrets).

## 배포 전 준비

```powershell
$projectId = "YOUR_GCP_PROJECT_ID"
$service = "incant-judge-proxy"
$region = "asia-northeast1"

gcloud auth login
gcloud config set project $projectId
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

Secret Manager에서 `incant-gemini-api-key`라는 시크릿을 만들고, Cloud Run 런타임 서비스 계정에 그 시크릿의 `Secret Manager Secret Accessor` 권한만 부여한다. 키 원문은 터미널 히스토리·문서·커밋에 남기지 않는다.

## Tokyo 배포

리포지터리 최상위에서 실행한다. `--source proxy`는 `proxy/package.json`의 `start` 스크립트로 `cloud-run/server.mjs`를 실행한다.

```powershell
$origin = "https://jaepaly.github.io"

gcloud run deploy $service `
  --source proxy `
  --region $region `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 3 `
  --concurrency 4 `
  --set-env-vars "ALLOWED_ORIGIN=$origin,INCANT_DEPLOY_REGION=$region" `
  --set-secrets "GEMINI_API_KEY=incant-gemini-api-key:latest"
```

출력된 `https://...run.app` URL은 배포 직후 바로 Pages 기본값으로 바꾸지 않는다.

## 검증 및 전환

1. `GET <Cloud Run URL>/health`에서 `ok: true`, `ready: true`, `region: "asia-northeast1"`을 확인한다.
2. 캐시 없는 영창을 소수만 호출해 HTTP 200, `X-Incant-Judge-Attempts`, `Server-Timing`과 `User location is not supported` 오류 0건을 확인한다.
3. 통과한 뒤에만 GitHub Pages 배포 환경의 `VITE_JUDGE_PROXY_URL`을 Cloud Run URL로 변경하고 Pages를 재배포한다.
4. 실패·비용 우려·지역 오류 재발 시 그 값을 제거해 기존 Cloudflare Worker로 즉시 되돌린다. 클라이언트는 이미 실패 시 MockJudge fallback을 유지한다.

## 로컬 계약 검증

```powershell
npm run test:judge-cloudrun
```

이 회귀는 실제 Gemini를 호출하지 않는다. `/health`, 기존 Worker 직접 재사용, 키 미설정 안전 실패, 전달 IP의 rate-limit 호환만 확인한다.
