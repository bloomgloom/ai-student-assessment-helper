export const DOMAIN_SELECTION_KEY = 'domainPage_lastSelection';
export const DOMAIN_GUIDE_KEY = 'hideDomainGuide.v2';
export const SUBJECT_COMPREHENSIVE_DOMAIN = '__SUBJECT_COMPREHENSIVE__';
export const DOMAIN_SOURCE_TYPE = 'domains';

export type DomainTab = 'standards' | 'scoring' | 'records' | 'ratio' | 'comments';

export const DOMAIN_TREE_KEY_PREFIXES = {
  year: 'dy',
  semester: 'ds',
  grade: 'dg',
  subject: 'dsub',
  domain: 'ddom',
} as const;

export const DOMAIN_PAGE_TEXT = {
  sidebarTitle: '평가 영역 관리',
  uploadLabel: '영역 관리 파일 업로드',
  guideTitle: '업로드 안내',
  guideLines: [
    '나이스 > 교과담임 > 성적 > 지필/수행선행작업 > 반영비율/만점관리에서',
    '조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.',
  ],
  emptyTreeMessageLines: ['영역 관리 파일을 업로드하면', '과목과 수행평가 영역이 표시됩니다'],
  saveLabel: '저장',
  savingLabel: '저장 중...',
  uploadConfigTitle: '작업 내용 업로드',
  downloadConfigTitle: '작업 내용 다운로드',
} as const;

export const DOMAIN_TAB_TEXT = {
  domainTabs: {
    standards: { value: 'standards', label: '성취 기준', color: 'amber' },
    scoring: { value: 'scoring', label: '채점 기준', color: 'green' },
    records: { value: 'records', label: '기록 기준', color: 'blue', customColor: 'purple' },
  },
  subjectTabs: {
    ratio: { value: 'ratio', label: '반영비율/만점관리', color: 'green' },
    comments: { value: 'comments', label: '세특 기준 관리', color: 'blue' },
  },
} as const;

export const DOMAIN_TREE_TEXT = {
  deleteSubjectConfirm: (subject: string) => `${subject} 영역 관리 파일과 데이터를 삭제하시겠습니까?`,
  deleteScopeConfirm: (label: string) => `${label} 아래 평가 영역 데이터를 모두 삭제하시겠습니까?`,
  missingParentSubject: '상위 과목 정보가 없습니다.',
} as const;

export const DOMAIN_UPLOAD_TEXT = {
  conflictConfirm: (data: { year: number; semester: number; grade: number; subject: string }) =>
    `${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}의 데이터가 이미 있습니다. 평가 영역 데이터를 덮어씌우시겠습니까?`,
  successMessage: (data: {
    year: number;
    semester: number;
    grade: number;
    subject: string;
    credit: number | string;
    totalCount: number;
    reflectedPerformanceCount: number;
  }) => `${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 영역 ${data.totalCount}개 업로드, 수행 반영 영역 ${data.reflectedPerformanceCount}개`,
} as const;

export const SUBJECT_COMMENTS_TEMPLATES = [
  {
    type: '공통',
    label: '세특 공통 기준',
    description: '모든 영역별 세특 및 종합 세특을 작성할 때 AI에게 공통으로 지시할 프롬프트입니다.',
    instructionPlaceholder: '세특 공통 기준 위한 지시사항을 입력하세요.',
    promptPlaceholder: '생성된 기준이 여기에 표시됩니다. 직접 수정도 가능합니다.',
    sortOrder: 0,
  },
  {
    type: '종합',
    label: '종합 세특 기준',
    description: '최종 학기말 세특을 작성할 때 사용할 프롬프트입니다.',
    instructionPlaceholder: '종합 세특 기준 위한 지시사항을 입력하세요.',
    promptPlaceholder: '생성된 기준이 여기에 표시됩니다. 직접 수정도 가능합니다.',
    sortOrder: 1,
  },
] as const;

export type SubjectCommentsType = (typeof SUBJECT_COMMENTS_TEMPLATES)[number]['type'];

export function getSubjectCommentsTemplate(type: string) {
  return SUBJECT_COMMENTS_TEMPLATES.find(template => template.type === type) ?? {
    type,
    label: type,
    description: '',
    instructionPlaceholder: `${type} 위한 지시사항을 입력하세요.`,
    promptPlaceholder: '생성된 기준이 여기에 표시됩니다. 직접 수정도 가능합니다.',
    sortOrder: SUBJECT_COMMENTS_TEMPLATES.length,
  };
}
