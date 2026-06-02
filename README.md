# AI 학생 평가 도우미

현재 실행 가능한 채점/기록 관리 앱은 `assessment/` 폴더에 있습니다.

## 실행

Docker로 실행하려면:

```bash
cd assessment
docker compose up --build
```

개발 모드로 실행하려면:

```bash
cd assessment
npm install
npm run dev
```

개발 모드 접속 주소:

```text
http://localhost:5173
```

Docker 접속 주소:

```text
http://localhost:3001
```

자세한 사용 방법은 `assessment/README.md`를 확인하세요.
