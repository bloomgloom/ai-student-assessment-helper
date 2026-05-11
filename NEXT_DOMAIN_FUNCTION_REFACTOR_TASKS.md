# Next Domain Function Refactor Tasks

`NEXT_PAGE_LAYOUT_REFACTOR_TASKS.md` 이후에 이어갈 기능 단위 리팩토링 메모입니다.

## 목표

`DomainPage`처럼 큰 페이지 파일에 남아 있는 상태, 데이터 변환, API 호출, 탭별 UI를 기능 단위로 분리한다.

페이지 레이아웃 공용화가 끝난 뒤 진행한다. 레이아웃 구조와 기능 분리를 한 번에 섞으면 변경 범위가 커져서 UI 위치 회귀를 찾기 어려워진다.

## 우선순위

1. `DomainPage` 탭별 뷰 분리
   - 반영비율/만점관리
   - 성취 기준 관리
   - 채점 기준 관리
   - 기록 기준 관리
   - 세특 기준 관리

2. `DomainPage` 기능 hook 분리
   - 선택 상태와 트리 편집
   - 영역/과목 저장
   - AI 생성 요청
   - AI 프롬프트 저장/복원
   - 엑셀 업로드/다운로드

3. `RecordsPage` 기능 분리
   - 접힘 트리 뷰
   - 상단 툴바
   - 학생 기록 테이블
   - 일괄 AI 생성/교정 작업
   - 업로드/다운로드

4. `CriteriaPage` 기능 분리
   - 트리 편집
   - 성취 기준 업로드/다운로드
   - 성취 기준 테이블

## 후보 파일 구조

```text
client/src/features/domain/
  DomainRatioPanel.tsx
  DomainAchievementPanel.tsx
  DomainScoringPanel.tsx
  DomainRecordPanel.tsx
  DomainSetechPanel.tsx
  useDomainTree.ts
  useDomainPersistence.ts
  useDomainAiGeneration.ts
  useDomainExcel.ts

client/src/features/records/
  RecordsSidebar.tsx
  RecordsToolbar.tsx
  RecordsTable.tsx
  useRecordsSelection.ts
  useRecordsAiBatch.ts
  useRecordsExcel.ts

client/src/features/criteria/
  CriteriaStandardsTable.tsx
  useCriteriaTree.ts
  useCriteriaExcel.ts
```

## 주의사항

- 먼저 UI 컴포넌트만 분리하고, 동작 hook은 그 다음에 분리한다.
- 타입 정의를 옮길 때는 import 순환이 생기지 않도록 `types.ts`를 먼저 만든다.
- 각 단계마다 `npm run build --workspace=client`를 실행한다.
- 기능 분리 작업과 UI 크기/간격 조정 작업은 커밋을 나눈다.
