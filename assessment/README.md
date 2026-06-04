# Assessment 개발 README

`assessment`는 교사용 채점/기록 관리 앱입니다. 나이스 엑셀 파일을 업로드해 성취 기준, 평가 영역, 학생별 채점 기록, 과목세특 초안을 관리합니다.

## 기술 스택

- Client: React, TypeScript, Vite, Tailwind CSS
- Server: Express, TypeScript
- DB: libSQL SQLite 파일
- 파일 처리: multer, ExcelJS, HWPX/PDF/코드 미리보기

## 개발 실행

```bash
npm install
npm run dev
```

접속 주소:

```text
http://localhost:5173
```

서버 API:

```text
http://127.0.0.1:3001
```

## 환경변수 / 설정

- `PORT`: 서버 포트. 기본값 `3001`
- `HOST`: 서버 바인딩 주소. 기본값 `127.0.0.1`
- `APP_STORAGE_DIR`: 데이터 저장 루트. 설정되면 해당 경로를 우선 사용

개발 모드에서 `APP_STORAGE_DIR`를 지정하지 않으면 프로젝트 루트의 `storage/`를 사용합니다. Electron 앱에서는 루트 Electron 프로세스가 OS 앱 데이터 폴더 아래 `storage/`를 주입합니다.

## DB / 저장소

기본 DB 위치:

```text
storage/data/assessment.db
```

주요 저장 디렉터리:

```text
storage/uploads/
storage/logs/
```

## 주요 라우트

- `/api/settings`: AI 설정, 데이터 초기화, 백업/복원
- `/api/criteria`: 성취 기준과 평가 영역 기준
- `/api/classes`: 나이스 채점/세특 파일 업로드
- `/api/records`: 학생별 채점·기록 데이터
- `/api/artifacts`: 학생 산출물 파일
- `/api/ai`: AI 채점, 기록 생성, 교정

## Electron 통합 메모

- 채점 서버는 교사 전용이므로 `127.0.0.1`에 바인딩합니다.
- Electron 앱 실행 시 저장 경로는 `app.getPath('userData')/storage`입니다.
- 향후 `assignment` 제출 데이터는 `assignment.db`와 제출 파일을 읽기 전용으로 참조합니다.
- `assessment` 서버가 `assignment` DB에 쓰기 작업을 하면 안 됩니다.
