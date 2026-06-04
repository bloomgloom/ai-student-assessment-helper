import { RefObject } from 'react';
import { Download, Save, Trash2, Upload } from 'lucide-react';
import { PageHeaderAction } from '../../components/common/PageHeaderActions';
import { SUBJECT_COMPREHENSIVE_DOMAIN } from './constants';
import { ClassItem } from './types';

interface UseRecordsHeaderOptions {
  selectedClass: ClassItem | null;
  selectedSubject: any;
  showScoring: boolean;
  showComments: boolean;
  showComprehensive: boolean;
  canShowScoring: boolean;
  canShowComments: boolean;
  setShowScoring: (value: boolean) => void;
  setShowComments: (value: boolean) => void;
  setShowComprehensive: (value: boolean) => void;
  domainFilter: string;
  setDomainFilter: (value: string) => void;
  uploadingZip: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  handleBulkZipUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBatchGenerate: (type: 'scoring' | 'comments', explicitDomain?: string) => void;
  batchGenerating: boolean;
  handleBatchSpellcheck: () => void;
  spellcheckProgress: { completed: number; total: number } | null;
  spellcheckingCount: number;
  selectedStudentCount: number;
  handleExport: (type: 'comments' | 'scoring') => void;
  saving: boolean;
  handleSaveAll: () => void;
  deleting: boolean;
  handleDeleteContent: () => void;
  uploadingFullRecords: boolean;
  fullRecordsInputRef: RefObject<HTMLInputElement>;
  handleImportFullRecords: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportFullRecords: () => void;
  aiEnabled: boolean;
}

export function useRecordsHeader({
  selectedClass,
  selectedSubject,
  showScoring,
  showComments,
  showComprehensive,
  canShowScoring,
  canShowComments,
  setShowScoring,
  setShowComments,
  setShowComprehensive,
  domainFilter,
  setDomainFilter,
  uploadingZip,
  fileInputRef,
  handleBulkZipUpload,
  handleBatchGenerate,
  batchGenerating,
  handleBatchSpellcheck,
  spellcheckProgress,
  spellcheckingCount,
  selectedStudentCount,
  handleExport,
  saving,
  handleSaveAll,
  deleting,
  handleDeleteContent,
  uploadingFullRecords,
  fullRecordsInputRef,
  handleImportFullRecords,
  handleExportFullRecords,
  aiEnabled,
}: UseRecordsHeaderOptions) {
  const showDomainControls = showScoring || showComments;
  const toggleButtonClassName = (active: boolean, enabled = true) =>
    `px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${!enabled ? 'opacity-40 cursor-not-allowed text-gray-400' :
      active ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
      }`;

  const toggleView = (target: 'scoring' | 'comments' | 'comprehensive') => {
    const nextScoring = target === 'scoring' ? !showScoring : showScoring;
    const nextComments = target === 'comments' ? !showComments : showComments;
    const nextComprehensive = target === 'comprehensive' ? !showComprehensive : showComprehensive;
    if (!nextScoring && !nextComments && !nextComprehensive) return;
    if (target === 'scoring') setShowScoring(nextScoring);
    if (target === 'comments') setShowComments(nextComments);
    if (target === 'comprehensive') setShowComprehensive(nextComprehensive);
  };

  const leading = selectedClass ? (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 bg-gray-100 p-1 rounded gap-1 border border-gray-200">
        <button
          className={toggleButtonClassName(showScoring, canShowScoring)}
          disabled={!canShowScoring}
          onClick={() => toggleView('scoring')}
        >
          채점
        </button>
        <button
          className={toggleButtonClassName(showComments, canShowComments)}
          disabled={!canShowComments}
          onClick={() => toggleView('comments')}
        >
          기록
        </button>
        <button
          className={toggleButtonClassName(showComprehensive)}
          onClick={() => toggleView('comprehensive')}
        >
          세특
        </button>
      </div>

      {showDomainControls && (
        <select
          className="input w-[15rem] min-w-0 shrink text-xs py-1.5 px-2 bg-gray-50 font-medium text-gray-700"
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
        >
          <option value="all">전체 영역 보기</option>
          {selectedSubject?.fixedDomains.map((d: any) => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
          {showComments && selectedSubject?.customDomains.map((d: any) => (
            <option key={d.name} value={d.name}>{d.name} (기록)</option>
          ))}
        </select>
      )}
    </div>
  ) : undefined;

  const restoreAction: PageHeaderAction = {
    key: 'import-full',
    type: 'file',
    icon: <Upload size={14} />,
    loading: uploadingFullRecords,
    inputRef: fullRecordsInputRef,
    accept: '.xlsx,.xls',
    onChange: handleImportFullRecords,
    disabled: uploadingFullRecords,
    title: '작업 내용 업로드',
    ariaLabel: '작업 내용 업로드',
  };

  const actions: PageHeaderAction[] = [
    ...(!selectedClass ? [restoreAction] : [
    ...(showDomainControls && domainFilter !== 'all' ? [{
      key: 'bulk-zip-upload',
      type: 'file' as const,
      variant: 'primary' as const,
      label: '업로드',
      icon: <Upload size={14} />,
      loading: uploadingZip,
      inputRef: fileInputRef,
      accept: '.zip',
      onChange: handleBulkZipUpload,
      disabled: uploadingZip,
    }] : []),
    ...(showScoring ? [{
      key: 'generate-scoring',
      variant: 'rainbow' as const,
      label: '채점',
      onClick: () => handleBatchGenerate('scoring'),
      disabled: batchGenerating || !aiEnabled,
    }] : []),
    ...(showComments ? [{
      key: 'generate-record',
      variant: 'rainbow' as const,
      label: '기록',
      onClick: () => handleBatchGenerate('comments'),
      disabled: batchGenerating || !aiEnabled,
    }] : []),
    ...(showComprehensive ? [{
      key: 'generate-comments',
      variant: 'rainbow' as const,
      label: '세특',
      onClick: () => handleBatchGenerate('comments', SUBJECT_COMPREHENSIVE_DOMAIN),
      disabled: batchGenerating || !aiEnabled,
    }] : []),
    ...(showComprehensive ? [{
      key: 'spellcheck',
      variant: 'rainbow' as const,
      label: '교정',
      onClick: handleBatchSpellcheck,
      disabled: !!spellcheckProgress || spellcheckingCount > 0 || !aiEnabled,
      title: selectedStudentCount > 0 ? '선택한 행 맞춤법 검사' : '전체 행 맞춤법 검사',
    }] : []),
    ...((showScoring && !showComments && !showComprehensive) || (!showScoring && !showComments && showComprehensive) ? [{
      key: 'export-current',
      variant: 'success' as const,
      label: '다운로드',
      icon: <Download size={14} />,
      onClick: () => handleExport(showScoring ? 'scoring' : 'comments'),
    }] : []),
    {
      key: 'delete',
      variant: 'danger' as const,
      label: deleting ? '삭제 중...' : '삭제',
      icon: <Trash2 size={14} />,
      onClick: handleDeleteContent,
      disabled: deleting || saving || batchGenerating,
    },
    {
      key: 'save',
      variant: 'primary' as const,
      label: saving ? '저장 중...' : '저장',
      icon: <Save size={14} />,
      onClick: handleSaveAll,
      disabled: saving,
    },
    restoreAction,
    {
      key: 'export-full',
      icon: <Download size={14} />,
      onClick: handleExportFullRecords,
      title: '작업 내용 다운로드',
      ariaLabel: '작업 내용 다운로드',
    },
    ]),
  ];

  return { leading, actions };
}
