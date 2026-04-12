# 논문체 변환기 (kmucloud-04)

구어체·일상 문장을 Gemini AI로 학술 논문 어투로 다시 써주는 웹 애플리케이션.

## 아키텍처

```
[사용자 브라우저]
       │  HTTP
       ▼
[S3 Static Website] ──── 정적 리소스 서빙 (React build)
       │
       │ fetch
       ▼
[EC2 / Express API]  ──── 요청 검증 · DB 기록 · Lambda 호출
       │                         │
       │ mysql2                  │ HTTPS POST
       ▼                         ▼
[RDS MySQL]              [Lambda + Gemini API]
  translations 테이블       stateless 변환
```

## 사용한 AWS 리소스

| 리소스 | 용도 |
|---|---|
| **S3** (`kmucloud-04-s3`) | React 빌드 산출물(`client/build/`) 정적 호스팅. 정적 웹사이트 엔드포인트(HTTP)로 서빙 |
| **EC2** (`50.19.56.81:8080`) | Node.js + Express API 서버. pm2로 상시 구동 |
| **RDS MySQL** (`nxt-kmucloud-3tier.cj24wem202yj.us-east-1.rds.amazonaws.com`) | `translations` 테이블에 변환 기록 영구 저장 |
| **Lambda** (Function URL) | Gemini API 호출 전용. stateless, DB 접근 없이 입력 문장만 받아 변환 결과 반환 |
| **IAM** | Lambda 실행 역할, S3 버킷 정책(`s3:GetObject *`) |

## 프로젝트 구조

```
kmucloud-04/
├── client/           React 프론트엔드 (S3 배포 대상)
├── server/           Express API 서버 (EC2 배포 대상)
└── gemini-lambda/    Gemini 호출 Lambda 핸들러
```

## 실행 방법

### 사전 준비
- Node.js 18+ / npm
- MySQL 접근 가능한 RDS 인스턴스
- Google AI Studio에서 발급받은 `GEMINI_API_KEY`

### 1. Lambda (로컬 테스트)
```bash
cd gemini-lambda
npm install
echo "GEMINI_API_KEY=<your-key>" > .env
node local.js          # http://localhost:3001 에서 대기
```

테스트:
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"sourceText":"오늘 날씨 좋네. 산책 가야겠다."}'
# → {"translatedText":"금일 기상 상태는 양호한 것으로 ..."}
```

### 1'. Lambda (AWS 배포)
```bash
cd gemini-lambda
npm install
zip -r function.zip index.js package.json node_modules
# 콘솔에서 .zip 업로드 후:
#  - 런타임: Node.js 20.x
#  - 핸들러: index.handler
#  - 환경 변수: GEMINI_API_KEY
#  - Function URL 활성화 (Auth: NONE)
```

### 2. Server (EC2 / 로컬)
```bash
cd server
npm install
cp .env.example .env   # 값 채우기
node server.js
```

`.env` 예시:
```
DB_HOST=<rds-endpoint>
DB_USER=user_04
DB_PASSWORD=<password>
DB_NAME=db_04
GEMINI_LAMBDA_URL=https://xxxx.lambda-url.us-east-1.on.aws/
PORT=8080
CORS_ORIGIN=http://kmucloud-04-s3.s3-website-us-east-1.amazonaws.com
```

`translations` 테이블은 첫 실행 시 자동 생성됩니다.

### 3. Client
```bash
cd client
npm install
echo "REACT_APP_SERVER_URL=http://50.19.56.81:8080" > .env
npm start              # 로컬 개발 서버
# 또는 배포용 빌드
npm run build
aws s3 sync build/ s3://kmucloud-04-s3/ --delete
```

## 접속 정보 (배포 환경)

- **프론트엔드**: http://kmucloud-04-s3.s3-website-us-east-1.amazonaws.com
  - ※ HTTPS로 접근 시 Mixed Content로 API 호출이 차단됩니다. **HTTP 엔드포인트로 접속하세요.**
- **API 서버**: http://50.19.56.81:8080
- **Health check**: `GET http://50.19.56.81:8080/` → DB/Lambda 연결 상태 반환

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/translate` | `{ sourceText }` → `{ id, translatedText }` |
| GET | `/translations` | 히스토리 전체 조회 (최신순) |
| GET | `/translations/:id` | 단건 조회 |
| DELETE | `/translations/:id` | 개별 삭제 |
| DELETE | `/translations` | 전체 삭제 |

## 테스트용 샘플 입력

```
오늘 날씨 좋네. 산책 가야겠다.
```
→ 정중한 논문체로 변환되어야 정상.

```
요즘 AI 기술이 엄청 빠르게 발전하고 있어서 여러 분야에서 많이 쓰이고 있다.
```
→ 객관적 어조·수동태 위주로 재작성되어야 함.

## 알려진 이슈

- **RDS / Lambda 환경변수**: AWS Lambda 콘솔에 `GEMINI_API_KEY` 누락 시 502 반환. CloudWatch Logs에서 확인 필요.
- **HTTPS 미지원**: EC2 퍼블릭 DNS에는 인증서가 없어 HTTPS 호출 불가. 필요 시 CloudFront를 앞에 세워야 함.
