# Page Layout Refactor Tasks

페이지 구성 모듈화 작업 기록입니다.

## 완료 상태

완료됨.

- `client/src/components/common/PageLayout.tsx` 추가
- `CriteriaPage` 최상위 좌우 레이아웃을 `PageLayout`으로 이동
- `DomainPage` 최상위 좌우 레이아웃, 헤더 데이터, 탭 슬롯을 `PageLayout`으로 이동
- `RecordsPage` 최상위 좌우 레이아웃을 `PageLayout`으로 이동
- `PageSidebar`를 `PageTreeSidebar` 계층으로 교체
- `PageTreeSidebarTitle`, `PageTreeSidebarUpload`, `PageTreeSidebarTree`로 사이드바 제목/업로드/트리 영역 분리
- `CriteriaPage`, `DomainPage`, `RecordsPage`는 `PageLayout`에 사이드바/트리 설정을 넘기고, `PageLayout`이 `PageTreeSidebar`를 렌더링
- `RecordsPage`의 접힘 트리 내용은 `RecordsCollapsedTree`로 분리해 `tree` 슬롯에 전달

남은 기능 단위 분리는 `NEXT_DOMAIN_FUNCTION_REFACTOR_TASKS.md`에 따로 정리했다.

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

- `client/src/components/common/PageTreeSidebar.tsx`
- `client/src/components/common/PageTreeSidebarTitle.tsx`
- `client/src/components/common/PageTreeSidebarUpload.tsx`
- `client/src/components/common/PageTreeSidebarTree.tsx`
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

## 적용 컴포넌트

### `PageLayout`

파일:

- `client/src/components/common/PageLayout.tsx`

props:

- `sidebar: ReactNode | { title; upload?; notices?; tree }`
- `header?: { eyebrow?: ReactNode; title?: ReactNode; actions?: ReactNode; hideTitle?: boolean }`
- `tabs?: ReactNode`
- `children: ReactNode`
- `className?: string`
- `mainClassName?: string`

역할:

- 전체 `flex h-screen overflow-hidden bg-gray-50` 구조 통일
- 왼쪽 사이드바와 오른쪽 메인 영역 배치
- 사이드바 설정으로 `PageTreeSidebar` 렌더링
- 제목 설정으로 `PageTreeSidebarTitle` 렌더링
- 업로드 설정으로 `PageTreeSidebarUpload` 렌더링
- 트리 설정으로 `PageTreeSidebarTree` 렌더링
- 헤더 데이터로 `PageHeader` 렌더링
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

현재 판단:

- 이번 단계에서는 만들지 않았다.
- 너무 많은 props를 받으면 오히려 읽기 어려워질 수 있어, 먼저 얇은 `PageLayout`만 적용했다.
- 세 페이지에서 같은 조합 반복이 더 명확해지면 다음 단계에서 검토한다.

## 페이지별 적용 방향

### `CriteriaPage`

현재 구조:

- 왼쪽 `PageTreeSidebar`
- 오른쪽 선택 전 empty state
- 선택 후 `PageHeader`
- 본문 테이블

적용 결과:

- `PageLayout`으로 좌우 구조 통일 완료
- 헤더 데이터만 `PageLayout`에 전달
- 사이드바/트리 설정만 `PageLayout`에 전달
- 탭 없음
- 헤더 액션 없음

### `DomainPage`

현재 구조:

- 왼쪽 `PageTreeSidebar`
- 오른쪽 선택 전 empty state
- 선택 후 `PageHeader`
- `PageTabs`
- 본문 탭 콘텐츠

적용 결과:

- `PageLayout`으로 좌우 구조 통일 완료
- 저장/업로드/다운로드는 `header.actions`로 전달
- `PageTabs`를 `tabs` slot으로 전달
- 사이드바/트리 설정만 `PageLayout`에 전달
- 본문 탭 콘텐츠는 현재처럼 내부 모듈화 유지

### `RecordsPage`

현재 구조:

- 왼쪽 자체 사이드바
- 접힘/펼침 기능 있음
- 오른쪽 제목 헤더 없음
- 상단 툴바와 큰 테이블

적용 결과:

- `PageLayout` 적용 완료
- 제목 헤더 없이 사용
- 왼쪽 사이드바는 접힘 상태가 있으므로 기존 자체 사이드바를 `sidebar` 슬롯에 전달
- 오른쪽 메인 영역의 공통 overflow/content 구조 통일

## 검증 포인트

실행 완료:

```bash
npm run build --workspace=client
```

남은 UI 확인:

- 세 페이지의 왼쪽 사이드바 시작 위치와 너비
- 오른쪽 헤더 top/bottom padding
- 탭이 있는 페이지와 없는 페이지의 본문 시작 위치
- 스크롤바 유무에 따른 가로 폭 흔들림
- `RecordsPage` 접힘 사이드바 동작

## 주의사항

- `RecordsPage`는 구조가 가장 다르므로 마지막에 적용한다.
- 페이지 레이아웃 공통화와 본문 기능 리팩토링을 한 커밋에 섞지 않는다.
- 이미 공통화된 `CriteriaItemSection`, `CriteriaItemCard`, `TreeNodeView`는 되돌리지 않는다.
