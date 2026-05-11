import { useRef } from 'react';
import { PageLayout } from '../components/common/PageLayout';
import { CriteriaContent } from '../features/criteria/CriteriaContent';
import { CRITERIA_GUIDE_KEY } from '../features/criteria/constants';
import { useCriteriaStandardsUpload } from '../features/criteria/useCriteriaStandardsUpload';
import { useCriteriaTree } from '../features/criteria/useCriteriaTree';
import { useDismissibleGuide } from '../hooks/useDismissibleGuide';

export default function CriteriaPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const guide = useDismissibleGuide(CRITERIA_GUIDE_KEY);
  const criteria = useCriteriaTree();
  const standardsUpload = useCriteriaStandardsUpload({
    inputRef: fileRef,
    reloadSubjects: criteria.reloadSubjects,
    clearSelection: criteria.clearSelection,
  });

  return (
    <PageLayout
      sidebar={{
        title: '성취 기준 관리',
        upload: {
          label: '성취 기준 파일 업로드',
          loading: standardsUpload.uploading,
          input: (
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={standardsUpload.handleUpload}
              disabled={standardsUpload.uploading}
            />
          ),
        },
        notices: [
          {
            type: 'guide',
            visible: guide.visible,
            title: '업로드 안내',
            lines: [
              '나이스 > 교과담임 > 성적 > 지필/수행선행작업 > 성취기준관리에서',
              '성취기준 및 성취수준(평가기준)을 조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.',
            ],
            onDismiss: guide.dismiss,
          },
          { type: 'message', visible: !!standardsUpload.message, tone: 'success', text: standardsUpload.message },
          { type: 'message', visible: !!standardsUpload.error, tone: 'error', text: standardsUpload.error },
        ],
        tree: criteria.tree,
      }}
      header={criteria.header}
    >
      <CriteriaContent selected={!!criteria.selected} standards={criteria.standards} />
    </PageLayout>
  );
}
