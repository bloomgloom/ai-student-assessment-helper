import { RefObject } from 'react';
import { Download, Save, Trash2, Upload } from 'lucide-react';
import { PageHeaderAction } from '../../components/common/PageHeaderActions';
import { ClassItem } from './types';

interface UseRecordsHeaderOptions {
  selectedClass: ClassItem | null;
  selectedSubject: any;
  writtenExams: Array<{ domain_name: string }>;
  showScoring: boolean;
  showComments: boolean;
  showComprehensive: boolean;
  claudeBatchJobCount: number;
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
  handleGenerateSelected: () => void;
  handleStartClaudeBatch: () => void;
  handleOpenClaudeBatchResults: () => void;
  batchGenerating: boolean;
  handleBatchSpellcheck: () => void;
  handleStartClaudeSpellcheckBatch: () => void;
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
  claudeBatchAvailable: boolean;
}

export function useRecordsHeader({
  selectedClass,
  selectedSubject,
  writtenExams,
  showScoring,
  showComments,
  showComprehensive,
  claudeBatchJobCount,
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
  handleGenerateSelected,
  handleStartClaudeBatch,
  handleOpenClaudeBatchResults,
  batchGenerating,
  handleBatchSpellcheck,
  handleStartClaudeSpellcheckBatch,
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
  claudeBatchAvailable,
}: UseRecordsHeaderOptions) {
  const showDomainControls = showScoring || showComments;
  const invalidComprehensiveMix = showComprehensive && (showScoring || showComments);
  const showGenerationActions = (showScoring || showComments || showComprehensive) && !invalidComprehensiveMix;
  const showSpellcheckAction = showComprehensive && !showScoring && !showComments;
  const generationLabel = showScoring ? '채점' : '작성';
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
          {showScoring && writtenExams.map((d) => (
            <option key={`written-${d.domain_name}`} value={d.domain_name}>{d.domain_name} (지필)</option>
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

  const renderExecutionMenu = ({
    label,
    onImmediate,
    onBatch,
    disabled,
    immediateTitle,
    batchTitle,
  }: {
    label: string;
    onImmediate: () => void;
    onBatch: () => void;
    disabled: boolean;
    immediateTitle: string;
    batchTitle: string;
  }) => (
    <div className="group relative h-9">
      <button
        type="button"
        className="btn-rainbow h-9 px-4 text-sm"
        disabled={disabled}
        aria-haspopup="menu"
        title={`${label} 방식 선택`}
      >
        {label}
      </button>
      <div
        className="invisible absolute right-0 top-[calc(100%-1px)] z-50 min-w-full pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        role="menu"
      >
        <div className="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="whitespace-nowrap px-4 py-2 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white"
            onClick={onImmediate}
            disabled={disabled}
            title={immediateTitle}
            role="menuitem"
          >
            즉시
          </button>
          <button
            type="button"
            className="whitespace-nowrap px-4 py-2 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white"
            onClick={onBatch}
            disabled={disabled || !claudeBatchAvailable}
            title={claudeBatchAvailable ? batchTitle : 'Claude 공급자에서만 사용할 수 있습니다.'}
            role="menuitem"
          >
            배치
          </button>
        </div>
      </div>
    </div>
  );

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
    ...(showGenerationActions ? [{
      key: 'generation-actions',
      type: 'custom' as const,
      render: () => renderExecutionMenu({
        label: generationLabel,
        onImmediate: handleGenerateSelected,
        onBatch: handleStartClaudeBatch,
        disabled: batchGenerating || !aiEnabled,
        immediateTitle: `선택된 항목 ${generationLabel} 즉시 처리`,
        batchTitle: `선택된 항목 ${generationLabel} Claude 배치 처리`,
      }),
    }] : []),
    ...(showSpellcheckAction ? [{
      key: 'spellcheck-actions',
      type: 'custom' as const,
      render: () => renderExecutionMenu({
        label: '교정',
        onImmediate: handleBatchSpellcheck,
        onBatch: handleStartClaudeSpellcheckBatch,
        disabled: !!spellcheckProgress || spellcheckingCount > 0 || !aiEnabled,
        immediateTitle: selectedStudentCount > 0 ? '선택한 행 즉시 교정' : '전체 행 즉시 교정',
        batchTitle: selectedStudentCount > 0 ? '선택한 행 Claude 배치 교정' : '전체 행 Claude 배치 교정',
      }),
    }] : []),
    ...(claudeBatchJobCount > 0 ? [{
      key: 'claude-batch-results',
      label: `결과 ${claudeBatchJobCount}`,
      onClick: handleOpenClaudeBatchResults,
      title: 'Claude 배치 결과 확인',
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
