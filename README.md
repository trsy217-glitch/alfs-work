# 알프스 워크 (ALFS Work)

알프스 팀 업무 플랫폼. 기존 **영업관리 앱 + 일괄 정산 앱**을 하나로 합치고, AI 에이전트 7개와 텔레그램 봇, 예약 작업을 붙였습니다.

- 화면 9개: 오늘 · 고객 · 일정 · 비용 · 마케팅 · 파트너샵 · 에이전트 · 대시보드(대표) · 팀·설정
- 고객 단계: 발굴 → 통화 중 → 미팅 예약 → 미팅 N회 → 계약 협의 → 파트너샵 (보류·무산)
- 비용: 2만원 미만 자동 승인, 2만원 이상 대표 승인 (설정에서 변경)
- 텔레그램 봇 '알프스 비서': 아침 브리핑, 미팅 배정·1시간 전 알림, 비용 승인 버튼, 통화 메모·음성·영수증 사진 받기
- AI: Claude Haiku(영수증·메모·미팅 준비) + Gemini Flash-Lite(음성 받아쓰기·마케팅 초안). 브리핑·재발주·리포트는 AI 없이 규칙으로
- 예약 작업: GitHub Actions 가 15분마다 `/api/cron` 호출 (무료)
- 재고 관리는 2차

Firebase 값이 없으면 **체험 모드**(이 브라우저에만 저장, 에이전트·텔레그램 꺼짐)로 돌아갑니다.

## 폴더

```
src/            화면 (React)
  pages/        오늘·고객·고객상세·일정·비용·마케팅·파트너샵·에이전트·대시보드·팀설정
  store.js      Firestore 읽기·쓰기 (+ 체험 모드)
shared/         화면과 서버가 같이 쓰는 규칙 (역할·단계·브리핑·광고 금지어·한국 시간)
api/
  app.js        앱이 부르는 에이전트 (영수증 읽기, 미팅 준비, 마케팅 초안, 알림)
  telegram.js   텔레그램 봇 웹훅
  cron.js       예약 작업 (브리핑·미팅 알림·재발주·주간 리포트·월 정산서·마케팅 초안)
  _lib/         Firebase 서버 연결, AI 엔진, 텔레그램, 에이전트 로직
firestore.rules Firestore 보안 규칙
.github/workflows/alfs-cron.yml   15분 예약 작업
test/           공용 로직·서버 테스트 (npm test)
```

## 연결 순서 (처음 한 번)

### 1. GitHub
새 저장소(예: `alfs-work`)를 만들고 이 폴더 내용을 그대로 올립니다. `node_modules`, `dist` 는 올리지 않습니다.
`.github` 폴더(예약 작업)도 꼭 함께 올려 주세요. 숨김 폴더라 끌어다 놓기에서 빠지기 쉬워요.

### 2. Firebase
- **기존 영업관리 앱과 같은 Firebase 프로젝트**를 쓰면 고객·팀원·기록이 그대로 이어집니다.
- Firestore → 규칙 탭에 `firestore.rules` 내용을 붙여 넣고 **게시**.
- 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → 내려받은 JSON 파일 내용 전체를 Vercel 환경 변수 `FIREBASE_SERVICE_ACCOUNT` 에 넣습니다. (이 키는 절대 GitHub 에 올리지 마세요)
- Authentication → 설정 → 승인된 도메인에 앱 주소(예: `work.alfs.kr`) 추가.
- 이전 정산 앱 영수증은 앱 → 팀·설정 → '이전 일괄 정산 앱 비용 가져오기'로 옮깁니다.

### 3. Vercel
새 프로젝트로 GitHub 저장소를 가져오고(Framework: Vite), `.env.example` 의 값을 환경 변수에 넣은 뒤 배포합니다.
도메인: Vercel → Domains 에 `work.alfs.kr` 추가 → hosting.kr DNS 에 안내된 CNAME 추가.

### 4. AI 키
- Claude: console.anthropic.com → API Keys → `ANTHROPIC_API_KEY`
- Gemini: aistudio.google.com → Get API key → `GEMINI_API_KEY`. 결제(유료 등급)를 켜 두는 것을 권합니다. 무료 등급은 보낸 내용이 구글 제품 개선에 쓰입니다.
- 둘 중 하나만 있어도 동작합니다. 음성 메모 받아쓰기는 Gemini 키가 있어야 합니다.

### 5. 텔레그램 봇
1. 텔레그램에서 **@BotFather** → `/newbot` → 이름 `알프스 비서`, 아이디 예: `alfs_secretary_bot`
2. 받은 토큰 → `TELEGRAM_BOT_TOKEN`, 아이디 → `VITE_TELEGRAM_BOT`, 아무 긴 영문·숫자 → `TELEGRAM_WEBHOOK_SECRET`
3. 다시 배포한 뒤, 브라우저 주소창에 한 번 열기 (토큰·비밀값·주소를 바꿔서):
   `https://api.telegram.org/bot<토큰>/setWebhook?url=https://work.alfs.kr/api/telegram&secret_token=<비밀값>`
   → `"ok":true` 가 나오면 연결 끝
4. 팀원은 각자 앱 → 팀·설정 → 내 텔레그램 → '연결 코드 만들기' → '텔레그램에서 열기' → 시작

### 6. 예약 작업 (GitHub Actions)
GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret
- `APP_URL` = `https://work.alfs.kr`
- `CRON_SECRET` = Vercel 의 `CRON_SECRET` 과 같은 값
Actions 탭에서 `alfs-cron` → Run workflow 로 바로 한 번 돌려 볼 수 있습니다. 앱 → 에이전트 화면 위쪽에 '예약 작업 · 마지막 n분 전'이 보이면 정상입니다.

### 7. 아이폰 로그인 설정 (홈 화면 앱용)
아이폰에 설치한 앱에서 Google 로그인이 막히지 않도록, 로그인 창을 앱 주소에서 열게 합니다.
1. `vercel.json` 첫 줄의 `YOUR-FIREBASE-PROJECT-ID` 를 Firebase 프로젝트 ID로 바꿉니다 (Firebase 콘솔 → 프로젝트 설정 → 프로젝트 ID).
2. Vercel 환경 변수 `VITE_FIREBASE_AUTH_DOMAIN` 을 `work.alfs.kr` 로 바꿉니다 (기존 값은 `…firebaseapp.com`).
3. Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트(Web client, Firebase가 만든 것) → 승인된 리디렉션 URI 에 `https://work.alfs.kr/__/auth/handler` 추가.
4. 다시 배포.

### 8. 휴대폰에 앱 설치 (팀원 모두)
- 아이폰: 사파리로 `https://work.alfs.kr` → 아래 공유 버튼 → 홈 화면에 추가 → 아이콘으로 열고 Google 로그인 한 번
- 안드로이드: 크롬으로 열기 → '설치' 버튼(또는 메뉴 ⋮ → 앱 설치)
- PC: 크롬·엣지 주소창 오른쪽 설치 아이콘
- 카카오톡 링크로 열면 설치·로그인이 안 됩니다. 꼭 사파리·크롬으로 여세요.
- 한 번 로그인하면 다음부터 바로 열립니다.

### 9. 팀원 등록
대표 계정(aamarketing250611@gmail.com)으로 먼저 로그인 → 팀·설정 → 팀원 등록에 이름·Google 이메일·역할(PM·영업·샵관리)을 넣습니다.

## 비용 (월, 직원 4명 기준 예상)
- AI: 월 600회 안팎 → Haiku + Gemini Flash-Lite 로 약 1~2만 원 이하
- Firebase: 무료 한도 안 (예약 작업은 15분마다 문서 몇 개만 읽음)
- Vercel·GitHub Actions·텔레그램: 무료

## 개발
```
npm install
npm run dev     # 체험 모드 (Firebase 값 없이)
npm test        # 공용 규칙 + 서버(텔레그램·예약 작업) 테스트
npm run build
```
광고 기준(오륜미네랄 = 기타가공품): `shared/adRules.js`. 효능·질병·흡수율·디톡스 표현 금지, 수상·특허는 '제조사 유디아미네랄' 표기.
