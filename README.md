# AI Student Assessment Helper

학생 평가, 채점, 세특 기록 작성을 보조하는 웹 애플리케이션입니다. 엑셀 기반의 영역 관리, 성취/평가기준, 채점 파일, 세특 파일을 업로드하고 학생별 기록과 산출물을 관리합니다.

## 주요 기능

- 기준 관리: 성취기준/평가기준 엑셀 업로드 및 관리
- 영역 관리: 영역 관리 엑셀에서 과목, 수행평가 영역, 반영 여부, 만점 추출
- 기록 관리: 채점 파일과 세특 파일 업로드, 학생별 기록 편집, AI 생성, 엑셀 내보내기
- 산출물 관리: 학생별/영역별 파일 업로드, ZIP 일괄 업로드
- 환경 설정: LLM 제공자, API 키, 모델, 동시 처리 옵션 설정

## 기술 구성

- Client: React, TypeScript, Vite, Tailwind CSS
- Server: Express, TypeScript, libSQL, ExcelJS
- Workspace: npm workspaces (`client`, `server`)

## 프로젝트 구조

```text
.
├── client/              # React 프론트엔드
├── server/              # Express API 서버
│   ├── src/
│   ├── data/            # 로컬 DB 저장 위치
│   └── uploads/         # 업로드 파일 저장 위치
├── package.json         # 루트 workspace 및 실행 스크립트
└── package-lock.json    # npm 의존성 잠금 파일
```

## 설치

```bash
npm install
```

## 개발 실행

```bash
npm run dev
```

기본 주소:

- Client: `http://localhost:5173`
- Server API: `http://localhost:3001`

`5173` 포트가 이미 사용 중이면 Vite가 자동으로 다음 포트를 사용합니다.

## 빌드

```bash
npm run build
```

빌드는 클라이언트와 서버를 모두 컴파일합니다.

## 프로덕션 실행

```bash
npm run build
npm start
```

`npm start`는 서버 빌드 결과(`server/dist`)를 실행하고, 서버가 `client/dist` 정적 파일을 함께 제공합니다.

## 데이터와 업로드 파일

서버 실행 시 필요한 디렉터리는 자동 생성됩니다.

- DB: `server/data/assessment.db`
- 업로드 파일: `server/uploads/`

환경 설정 화면에서 초기화를 실행하면 업로드 파일과 주요 데이터 테이블이 정리됩니다. LLM 설정은 유지됩니다.

## 파일 업로드 규칙

기록 관리에서는 여러 엑셀 파일을 한 번에 선택할 수 있습니다.

- 파일명에 `과목세특`이 포함되면 세특 파일로 처리합니다.
- 그 외 엑셀 파일은 채점 파일로 처리합니다.
- 학생 명단, 영역, 개인번호 등은 서버에서 엑셀 내용을 파싱해 저장합니다.

채점 파일 예시:

```text
수행평가 파일일괄등록 - 2026학년도 1학기 2 정보(3)_전체영역_1강의실.xlsx
```

세특 파일 예시:

```text
2026_1학기_2학년_1_정보_과목세특_20251022132700.xlsx
```

## 환경 설정

앱의 `환경 설정` 메뉴에서 LLM 제공자, API 키, Base URL, 모델명을 설정합니다. 설정값은 로컬 DB의 `settings` 테이블에 저장됩니다.

지원 흐름:

- OpenAI 호환 API
- Ollama
- OMLX
- 기타 OpenAI-compatible 엔드포인트

## 유용한 명령어

```bash
npm run dev
npm run build
npm start
npm run build --workspace=client
npm run build --workspace=server
```

## 참고

`package.json`의 프로젝트 이름은 npm 패키지 이름이며, 실제 폴더 경로와는 별개입니다. 로컬 도구 설정 파일에 절대경로가 들어 있으면 현재 폴더 경로인 `ai-student-assessment-helper`에 맞춰 수정해야 합니다.
