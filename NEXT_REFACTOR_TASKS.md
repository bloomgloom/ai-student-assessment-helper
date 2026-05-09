# Next Refactor Tasks

이 문서는 다음 세션에서 바로 이어서 작업하기 위한 인수인계 메모입니다.

## 목표

페이지별로 흩어진 트리뷰, 페이지 레이아웃, AI 호출, 기준 항목 UI를 공통 모듈로 분리한다. 특히 `CriteriaPage`, `DomainPage`, `RecordsPage`의 길이를 줄이고, 메뉴별 트리 동작 차이를 없앤다.

## 현재 중간 상태

이미 추가된 공통 파일이 있을 수 있다.

- `client/src/components/common/PageSidebar.tsx`
- `client/src/components/common/PageHeader.tsx`
- `client/src/components/common/PageTabs.tsx`
- `client/src/components/common/AiGenerateBox.tsx`
- `client/src/components/common/SectionTitle.tsx`
- `client/src/components/common/TreeView.tsx`
- `client/src/components/common/CriteriaItemCard.tsx`
- `client/src/components/common/SetechCriteriaPanels.tsx`
- `client/src/hooks/useAiAction.ts`

주의: 현재 `TreeView.tsx`는 아직 트리 컨테이너 수준의 공통화다. 실제 노드 렌더링인 `TreeNodeView`는 아직 페이지별로 남아 있을 수 있다. 따라서 학년도/학기/학년 아이콘 같은 문제는 `TreeNodeView`까지 공통화해야 해결된다.

작업 시작 전 반드시 확인:

```bash
git status --short
git diff --stat
git diff -- client/src/pages/DomainPage.tsx client/src/pages/CriteriaPage.tsx
```

## 1. 공통 트리뷰 완성

새 공통 트리 노드 렌더러를 만든다.

예상 파일:

- `client/src/components/common/TreeNodeView.tsx`
- 또는 기존 `TreeView.tsx`에 통합

공통 노드 타입은 최소한 다음을 지원한다.

- `year`
- `semester`
- `grade`
- `subject`
- `domain`
- `room` 또는 `class`

공통 아이콘 규칙:

- `year`, `semester`, `grade`: `Folder`
- `subject`: `Folder` 또는 `BookOpen`
- 성취 기준 영역 / 평가 영역: `ClipboardCheck`
- 기록 영역: `BookOpen` 보라색
- 강의실/반: 필요 시 `School` 또는 `Users`

공통 버튼 규칙:

- 추가 버튼
- 삭제 버튼
- 다운로드 버튼
- 스크롤바를 고려한 오른쪽 여백 통일

페이지별 차이는 config로 전달한다.

- 어떤 노드에 추가 버튼을 보여줄지
- 어떤 노드에 삭제 버튼을 보여줄지
- 어떤 노드에 다운로드 버튼을 보여줄지
- 어떤 노드를 클릭할 수 있는지
- 클릭 시 어떤 handler를 호출할지
- 선택 상태 key 계산 방식
- 영역 아이콘 색상 및 종류

React에서는 `new Class()` 방식보다 `config object + component props` 방식으로 구현한다.

## 2. 성취 기준 관리 트리 적용

대상:

- `client/src/pages/CriteriaPage.tsx`

해야 할 일:

- 페이지 내부 `TreeNodeView` 제거
- 렌더링을 공통 `TreeView`/`TreeNodeView`로 교체
- 기존 `buildTree`, draft node, add/delete 로직은 우선 유지 가능
- 학년도/학기/학년/과목/영역 아이콘 모두 공통 규칙 사용
- 과목 옆 다운로드 버튼은 `has_source` 있을 때만 표시
- 과목 밑에는 성취 기준 영역명이 표시되어야 함

## 3. 평가 영역 관리 트리 적용

대상:

- `client/src/pages/DomainPage.tsx`

해야 할 일:

- 페이지 내부 `TreeNodeView` 제거
- 성취 기준 관리와 같은 구조로 표시
  - 학년도
  - 학기
  - 학년
  - 과목
  - 평가 영역 또는 기록 영역
- 과목 옆 `+` 버튼은 만들지 않음
- 파일 업로드 과목만 다운로드 버튼 표시
- 기록 영역은 보라색 `BookOpen`
- 지필/수행 영역은 초록색 `ClipboardCheck`
- 학년도/학기/학년에도 아이콘 표시
- 과목명 클릭 시 메인 화면은 `반영비율/만점관리`, `세특 기준 관리` 탭으로 구성
- 영역명 클릭 시 메인 화면은 `성취 기준`, `채점 기준`, `기록 기준` 탭으로 구성
- 기록 영역 클릭 시 `성취 기준`, `기록 기준`만 표시

## 4. 채점 기록 관리 트리까지 공용화

대상:

- `client/src/pages/RecordsPage.tsx`

해야 할 일:

- 페이지 내부 `TreeNodeView` 제거
- 채점 기록 관리도 같은 공통 트리 사용
- 노드 구조 확장 필요
  - 학년도
  - 학기
  - 학년
  - 과목
  - 강의실
  - 영역
- 현재 `recordsTreeCollapsed` 같은 사이드바 접힘 상태는 페이지에 남겨도 됨
- 트리 내부 노드 렌더링만 공통화해도 우선 충분함
- 접기/펼치기 상태는 공통 트리에 props로 전달 가능하게 설계

## 5. 페이지 레이아웃 공통화

이미 만든 공통 컴포넌트를 실제 페이지에 끝까지 적용한다.

- `PageSidebar`
  - 제목
  - 업로드
  - 트리뷰
- `PageHeader`
  - 제목
  - 제목줄 버튼
  - 채점 기록 관리에서는 제목 숨김 가능
- `PageTabs`
  - 탭 공통화
- `SectionTitle`
  - 탭 내부 제목
- `AiGenerateBox`
  - 긴 텍스트박스와 오른쪽 생성 버튼
  - 높이 72px 유지

적용 대상:

- `CriteriaPage`
- `DomainPage`
- `RecordsPage`

## 6. AI 호출 동작 공용화

이미 추가된 훅:

- `client/src/hooks/useAiAction.ts`

해야 할 일:

- `DomainPage`의 모든 AI 생성 함수가 `useAiAction`을 쓰도록 마무리
- `RecordsPage`의 AI 관련 동작도 공통화
  - 채점 생성
  - 기록 생성
  - 세특 생성
  - 맞춤법/문장 교정
- 공통 처리
  - 생성 중 상태
  - 중단
  - 진행률
  - 에러 메시지
  - 취소 시 alert 안 띄우기

현재 `RecordsPage`는 별도 spellcheck 진행률/중단 상태를 가지고 있으므로, 한번에 다 바꾸기보다 `useAiAction`을 확장하거나 별도 `useAiBatchAction`으로 분리하는 것이 안전하다.

## 7. 기준 항목 UI 공통화

이미 추가된 컴포넌트:

- `client/src/components/common/CriteriaItemCard.tsx`

적용 대상:

- 평가 영역 관리의 채점 기준 항목
- 평가 영역 관리의 기록 기준 항목
- 세특 기준 항목

남길 차이:

- 채점 기준은 배점 입력 있음
- 기록/세특 기준은 배점 없음
- 드래그 핸들 표시 여부
- 결과창 라벨
  - `채점 기준 내용`
  - `기록 기준 내용`

## 8. 세특 공통 기준/종합 기준 공통화

이미 추가된 컴포넌트:

- `client/src/components/common/SetechCriteriaPanels.tsx`

해야 할 일:

- `DomainPage`의 기존 `['공통', '종합'].map(...)` 직접 렌더링 제거
- `SetechCriteriaPanels` 적용
- 공통 기준과 종합 기준 모두 같은 컴포넌트에서 관리
- AI 생성 버튼도 `useAiAction` 흐름 사용

## 9. 검증

작업 후 반드시 실행:

```bash
npm run build --workspace=client
```

가능하면 전체 빌드:

```bash
npm run build
```

확인할 동작:

- 성취 기준 관리 트리에서 학년도/학기/학년/과목/영역 아이콘 표시
- 평가 영역 관리 트리도 같은 아이콘 규칙 적용
- 평가 영역 관리에서 학년도 추가 버튼 유지
- 과목 옆 다운로드 버튼은 파일 업로드 과목에만 표시
- 평가 영역 관리에서 과목 옆 `+` 버튼 없음
- 기록 영역은 보라색 책 아이콘
- 삭제 후 현재 보고 있던 페이지가 불필요하게 초기화되지 않음
- 새로고침 후 마지막 선택 복원
- AI 생성 버튼 중단/에러/진행률 동작
- 채점 기록 관리 트리도 기존 기능 유지

## 권장 작업 순서

1. `git status`로 현재 중간 변경 확인
2. 공통 `TreeNodeView` 설계 및 추가
3. `CriteriaPage`에 공통 트리 적용
4. `DomainPage`에 공통 트리 적용
5. 클라이언트 빌드
6. `RecordsPage`에 공통 트리 적용
7. AI 호출 공통화 마무리
8. 기준 항목 카드 공통화
9. 세특 공통/종합 패널 공통화
10. 최종 빌드 및 diff 확인

