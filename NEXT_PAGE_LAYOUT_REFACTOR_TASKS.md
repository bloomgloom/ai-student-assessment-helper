# Next Page Layout Refactor Tasks

다음 세션에서 이어갈 페이지 구성 모듈화 메모입니다.

## 목표

`CriteriaPage`, `DomainPage`, `RecordsPage`의 공통 페이지 골격을 모듈화한다.

공통 골격:

- 왼쪽: 트리 메뉴 사이드바
- 위쪽: 페이지 헤더
- 헤더 오른쪽: 저장/업로드/다운로드 같은 액션 버튼
- 헤더 아래: 탭 영역
- 본문: 페이지별 콘텐츠

현재 평가 영역 관리 내부의 AI 생성 박스, 항목 섹션, 항목 카드처럼 본문 안의 반복 UI는 이미 일부 모듈화되어 있다. 다음 작업은 이보다 한 단계 위인 페이지 프레임을 정리하는 것이다.

## 현재 상태

이미 있는 공통 컴포넌트:

- `client/src/components/common/PageSidebar.tsx`
- `client/src/components/common/PageHeader.tsx`
- `client/src/components/common/PageTabs.tsx`
- `client/src/components/common/TreeView.tsx`
- `client/src/components/common/TreeNodeView.tsx`
- `client/src/components/common/AiGenerateBox.tsx`
- `client/src/components/common/CriteriaItemSection.tsx`
- `client/src/components/common/CriteriaItemToolbar.tsx`
- `client/src/components/common/CriteriaItemCard.tsx`
- `client/src/components/common/SectionTitle.tsx`

최근 완료한 내용:

- 트리 노드 렌더링 공통화
- AI 요청 오버레이 공통화
- 평가 영역 관리의 AI 요청 프롬프트 저장 및 엑셀 export/import 반영
- 평가 영역 관리의 자동 생성 영역 공통화
- 성취/채점/기록 기준 항목 섹션 공통화
- 주요 스크롤 컨테이너에 `scrollbar-gutter: stable` 적용

## 제안 컴포넌트

### `PageLayout`

예상 파일:

- `client/src/components/common/PageLayout.tsx`

예상 props:

- `sidebar: ReactNode`
- `header?: ReactNode`
- `tabs?: ReactNode`
- `children: ReactNode`
- `hideHeader?: boolean`
- `contentClassName?: string`

역할:

- 전체 `flex h-screen overflow-hidden bg-gray-50` 구조 통일
- 왼쪽 사이드바와 오른쪽 메인 영역 배치
- 메인 영역의 `min-w-0`, `overflow-hidden`, 스크롤 컨테이너 정책 통일

### `PageShell`

`PageLayout`보다 더 도메인 친화적인 상위 컴포넌트로 만들 수도 있다.

예상 props:

- `sidebarTitle`
- `sidebarUpload`
- `sidebarNotices`
- `tree`
- `headerEyebrow`
- `headerTitle`
- `headerActions`
- `tabs`
- `empty`
- `children`

장점:

- `CriteriaPage`, `DomainPage`는 거의 같은 방식으로 적용 가능
- `RecordsPage`는 제목 없는 특수 케이스를 `header={null}` 또는 `hideHeader`로 처리 가능

주의:

- 너무 많은 props를 받으면 오히려 읽기 어려워질 수 있다.
- 먼저 `PageLayout`처럼 얇은 레이아웃 컴포넌트부터 적용하고, 반복이 남으면 `PageShell`로 올리는 편이 안전하다.

## 페이지별 적용 방향

### `CriteriaPage`

현재 구조:

- 왼쪽 `PageSidebar`
- 오른쪽 선택 전 empty state
- 선택 후 `PageHeader`
- 본문 테이블

적용:

- `PageLayout`으로 좌우 구조 통일
- `PageHeader`는 그대로 사용
- 탭 없음
- 헤더 액션 없음

### `DomainPage`

현재 구조:

- 왼쪽 `PageSidebar`
- 오른쪽 선택 전 empty state
- 선택 후 `PageHeader`
- `PageTabs`
- 본문 탭 콘텐츠

적용:

- `PageLayout`으로 좌우 구조 통일
- `PageHeader` actions에 저장/업로드/다운로드 유지
- `PageTabs`를 `tabs` slot으로 전달
- 본문 탭 콘텐츠는 현재처럼 내부 모듈화 유지

### `RecordsPage`

현재 구조:

- 왼쪽 자체 사이드바
- 접힘/펼침 기능 있음
- 오른쪽 제목 헤더 없음
- 상단 툴바와 큰 테이블

적용:

- `PageLayout`을 쓰되 `header` 생략 가능해야 함
- 왼쪽 사이드바는 접힘 상태가 있으므로 `PageSidebar` 직접 적용은 나중으로 미룰 수 있음
- 먼저 오른쪽 메인 영역의 공통 overflow/content 구조만 맞추는 것이 안전

## 검증 포인트

작업 후 반드시 실행:

```bash
npm run build --workspace=client
```

가능하면:

```bash
npm run build
```

UI 확인:

- 세 페이지의 왼쪽 사이드바 시작 위치와 너비
- 오른쪽 헤더 top/bottom padding
- 탭이 있는 페이지와 없는 페이지의 본문 시작 위치
- 스크롤바 유무에 따른 가로 폭 흔들림
- `RecordsPage` 접힘 사이드바 동작

## 주의사항

- `RecordsPage`는 구조가 가장 다르므로 마지막에 적용한다.
- 페이지 레이아웃 공통화와 본문 기능 리팩토링을 한 커밋에 섞지 않는다.
- 이미 공통화된 `CriteriaItemSection`, `CriteriaItemCard`, `TreeNodeView`는 되돌리지 않는다.
