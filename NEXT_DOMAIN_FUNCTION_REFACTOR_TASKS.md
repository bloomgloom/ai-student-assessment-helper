# Next Domain Function Refactor Tasks

페이지 레이아웃 공용화 이후에 이어갈 기능 단위 리팩토링 메모입니다.

## 남은 작업

1. `RecordsPage` 기능 분리
   - 학생 기록 테이블
   - 일괄 AI 생성/교정 작업
   - 업로드/다운로드 hook

2. `DomainContent` 탭별 뷰 분리
   - 반영비율/만점관리
   - 성취 기준 관리
   - 채점 기준 관리
   - 기록 기준 관리
   - 세특 기준 관리

## 후보 파일 구조

```text
client/src/features/domain/
  DomainRatioPanel.tsx
  DomainAchievementPanel.tsx
  DomainScoringPanel.tsx
  DomainRecordPanel.tsx
  DomainSetechPanel.tsx

client/src/features/records/
  RecordsTable.tsx
  useRecordsSelection.ts
  useRecordsAiBatch.ts
  useRecordsExcel.ts

```

## 주의사항

- 먼저 UI 컴포넌트만 분리하고, 동작 hook은 그 다음에 분리한다.
- 타입 정의를 옮길 때는 import 순환이 생기지 않도록 `types.ts`를 먼저 만든다.
- 각 단계마다 `npm run build --workspace=client`를 실행한다.
- 기능 분리 작업과 UI 크기/간격 조정 작업은 커밋을 나눈다.
