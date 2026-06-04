# Assignment 개발 README

`assignment`는 수행평가 시간에 학생이 같은 LAN에서 교사 PC로 접속해 안내문을 보고 파일을 제출하는 전용 앱으로 만들 예정입니다. `assessment`와 코드, DB, 저장소를 분리합니다.

## 기술 스택

아직 구현 전입니다. 구현 시 `assessment`와 같은 TypeScript 기반 웹 서버/클라이언트 구조를 사용하되, 채점·AI·설정 기능은 포함하지 않습니다.

## 개발 실행

예정 명령:

```bash
npm install
npm run dev
```

학생 접속 서버는 LAN 공개가 필요하므로 개발/운영에서 바인딩 주소를 명확히 구분합니다.

```text
학생용: 0.0.0.0:<포트>
교사용 관리 화면: localhost-only
```

## 환경변수 / 설정

예정 항목:

- `PORT`: 학생 접속 포트
- `HOST`: 학생용 서버 바인딩 주소. 운영 시 `0.0.0.0`
- `APP_STORAGE_DIR`: Electron에서 주입하는 저장 루트

## DB / 저장소

Electron 앱에서는 아래 경로를 사용합니다.

```text
<userData>/storage/
  data/assignment.db
  data/assessment.db
  templates/
  uploads/
    artifacts/
    submissions/
```

`assignment`는 `assessment` DB에 접근하지 않습니다. DB 파일은 분리하되, 제출 산출물은 `assessment`에서 바로 볼 수 있도록 같은 storage 루트의 업로드 영역을 공유합니다.

## 주요 라우트 개요

예정:

- `/` 또는 `/student`: 학생 제출 화면
- `/api/student/*`: 학생용 제출 API
- `/admin`: 교사용 제출 현황 화면. localhost-only
- `/api/admin/*`: 교사용 관리 API. localhost-only

## Electron 통합 메모

- 수행평가 모드는 학생 접속을 위해 `0.0.0.0`에 바인딩합니다.
- 학생 접속 주소는 `http://<교사 PC IP>:<포트>` 형태로 앱에 표시합니다.
- 파일 서빙은 id 기반으로만 처리하고, 학생 입력에서 파일 경로 문자열을 받지 않습니다.
- 파일명을 저장할 때 `..`, `/`, `\`를 제거합니다.
- 경로 처리가 필요한 경우 `resolve` 후 기준 디렉터리 containment 검사를 수행합니다.
- 채점 기준, 점수, 피드백, AI 프롬프트, API 키는 이 앱에 포함하지 않습니다.
