import { BookOpen } from 'lucide-react';
import { useCriteriaController } from './useCriteriaController';

export function useCriteriaPage() {
  const { fileRef, guide, criteria, standardsUpload } = useCriteriaController();

  return {
    sidebar: {
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
          type: 'guide' as const,
          visible: guide.visible,
          title: '업로드 안내',
          lines: [
            '나이스 > 교과담임 > 성적 > 지필/수행선행작업 > 성취기준관리에서',
            '성취기준 및 성취수준(평가기준)을 조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.',
          ],
          onDismiss: guide.dismiss,
        },
        { type: 'message' as const, visible: !!standardsUpload.message, tone: 'success' as const, text: standardsUpload.message },
        { type: 'message' as const, visible: !!standardsUpload.error, tone: 'error' as const, text: standardsUpload.error },
      ],
      tree: {
        nodes: criteria.tree.nodes,
        empty: {
          icon: <BookOpen size={32} />,
          message: '성취 기준 파일을 업로드하세요',
          addYear: true,
          onAddYear: () => criteria.tree.addNode(),
        },
        addYear: true,
        onAddYear: () => criteria.tree.addNode(),
        node: criteria.tree.node,
      },
    },
    header: criteria.selected ? {
      eyebrow: `${criteria.selected.year}학년도 ${criteria.selected.semester}학기 ${criteria.selected.grade}학년 > ${criteria.selected.subject}`,
      title: criteria.selected.domain_name,
    } : undefined,
    contentProps: {
      selected: !!criteria.selected,
      standards: criteria.standards,
    },
  };
}
