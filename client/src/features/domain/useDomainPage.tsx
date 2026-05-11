import { Award, BookOpen, ClipboardCheck, Download, Save, School, Upload } from 'lucide-react';
import { PageHeaderAction } from '../../components/common/PageHeaderActions';
import { PageTabs, PageTab } from '../../components/common/PageTabs';
import { useDomainController } from './useDomainController';

type DomainTab = 'standards' | 'scoring' | 'activity' | 'ratio';

export function useDomainPage() {
  const domain = useDomainController();

  const domainTabs: PageTab<DomainTab>[] = [
    { value: 'standards', label: '성취 기준', icon: <Award size={14} />, color: 'amber' },
    ...(!domain.isCustomDomain ? [{ value: 'scoring' as const, label: '채점 기준', icon: <ClipboardCheck size={14} />, color: 'green' as const }] : []),
    { value: 'activity', label: '기록 기준', icon: <BookOpen size={14} />, color: domain.isCustomDomain ? 'purple' : 'blue' },
  ];
  const subjectTabs: PageTab<DomainTab>[] = [
    { value: 'ratio', label: '반영비율/만점관리', icon: <ClipboardCheck size={14} />, color: 'green' },
    { value: 'activity', label: '세특 기준 관리', icon: <BookOpen size={14} />, color: 'blue' },
  ];
  const headerActions: PageHeaderAction[] = domain.selectedSubject ? [
    {
      key: 'save',
      variant: 'primary',
      label: domain.saving ? '저장 중...' : '저장',
      icon: <Save size={14} />,
      onClick: domain.handleSave,
      disabled: domain.saving,
    },
    {
      key: 'upload-config',
      type: 'file',
      icon: <Upload size={14} />,
      inputRef: domain.configFileRef,
      accept: '.xlsx,.xls',
      onChange: domain.handleUploadConfig,
      loading: domain.uploadingConfig,
      disabled: domain.uploadingConfig,
      title: '작업 내용 업로드',
      ariaLabel: '작업 내용 업로드',
    },
    {
      key: 'download-config',
      icon: <Download size={14} />,
      onClick: domain.handleDownloadConfig,
      title: '작업 내용 다운로드',
      ariaLabel: '작업 내용 다운로드',
    },
  ] : [];

  return {
    sidebar: {
      title: '평가 영역 관리',
      upload: {
        label: '영역 관리 파일 업로드',
        loading: domain.uploadingDomains,
        input: (
          <input
            ref={domain.domainsFileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls"
            onChange={domain.handleDomainsUpload}
            disabled={domain.uploadingDomains}
          />
        ),
      },
      notices: [
        {
          type: 'guide' as const,
          visible: domain.showGuide,
          title: '업로드 안내',
          lines: [
            '나이스 > 교과담임 > 성적 > 지필/수행선행작업 > 반영비율/만점관리에서',
            '조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.',
          ],
          onDismiss: domain.hideGuide,
        },
        { type: 'message' as const, visible: !!domain.uploadMessage, tone: 'success' as const, text: domain.uploadMessage },
        { type: 'message' as const, visible: !!domain.uploadError, tone: 'error' as const, text: domain.uploadError },
      ],
      tree: {
        nodes: domain.domainTree.visibleTree,
        empty: {
          icon: <School size={32} />,
          message: <>영역 관리 파일을 업로드하면<br />과목과 수행평가 영역이 표시됩니다</>,
          addYear: true,
          onAddYear: () => domain.domainTree.addNode(),
        },
        addYear: true,
        onAddYear: () => domain.domainTree.addNode(),
        node: domain.domainTree.nodeConfig,
      },
    },
    header: domain.selectedSubject ? {
      eyebrow: `${domain.selectedSubject.year}학년도 ${domain.selectedSubject.semester}학기 ${domain.selectedSubject.grade}학년 > ${domain.selectedSubject.subject}`,
      title: domain.selectedDomain ? domain.selectedDomain : '종합 세특 기준 (과목 공통)',
      actions: headerActions,
    } : undefined,
    tabs: domain.selectedSubject ? (
      <PageTabs
        value={domain.activeTab}
        tabs={domain.selectedDomain ? domainTabs : subjectTabs}
        onChange={domain.setActiveTab}
      />
    ) : undefined,
    contentProps: {
      selectedSubject: domain.selectedSubject,
      selectedDomain: domain.selectedDomain,
      activeTab: domain.activeTab,
      isCustomDomain: domain.isCustomDomain,
      subjectDomainsMetaPrompt: domain.subjectDomainsMetaPrompt,
      setSubjectDomainsMetaPrompt: domain.setSubjectDomainsMetaPrompt,
      generatingSubjectDomains: domain.generatingSubjectDomains,
      handleGenerateSubjectDomains: domain.handleGenerateSubjectDomains,
      subjectAssessmentRatioError: domain.subjectAssessmentRatioError,
      subjectAssessmentRatioInvalid: domain.subjectAssessmentRatioInvalid,
      allSubjectDomains: domain.allSubjectDomains,
      subjectHasUploadedFile: domain.subjectHasUploadedFile,
      isLockedSubjectDomainRow: domain.isLockedSubjectDomainRow,
      updateSubjectDomainRow: domain.updateSubjectDomainRow,
      removeSubjectDomainRow: domain.removeSubjectDomainRow,
      addSubjectDomainRow: domain.addSubjectDomainRow,
      achievementStandards: domain.achievementStandards,
      standardsMetaPrompt: domain.standardsMetaPrompt,
      setStandardsMetaPrompt: domain.setStandardsMetaPrompt,
      generatingStandards: domain.generatingStandards,
      handleGenerateStandards: domain.handleGenerateStandards,
      addStandardRef: domain.addStandardRef,
      standardRefs: domain.standardRefs,
      uniqueStandardDomains: domain.uniqueStandardDomains,
      uniqueCodesForDomain: domain.uniqueCodesForDomain,
      updateStandardRefDomain: domain.updateStandardRefDomain,
      updateStandardRefCode: domain.updateStandardRefCode,
      removeStandardRef: domain.removeStandardRef,
      evalItems: domain.evalItems,
      currentMaxScore: domain.currentMaxScore,
      calculatedScore: domain.calculatedScore,
      isScoreMismatch: domain.isScoreMismatch,
      updateEvalItem: domain.updateEvalItem,
      evalMetaPrompts: domain.evalMetaPrompts,
      setEvalMetaPrompts: domain.setEvalMetaPrompts,
      setIsDirty: domain.setIsDirty,
      handleGenerateEvalItems: domain.handleGenerateEvalItems,
      generatingEval: domain.generatingEval,
      handleGenerateEvalRubrics: domain.handleGenerateEvalRubrics,
      addEvalItem: domain.addEvalItem,
      evalChecked: domain.evalChecked,
      setEvalChecked: domain.setEvalChecked,
      removeEvalItem: domain.removeEvalItem,
      setechMetaPrompts: domain.setechMetaPrompts,
      setSetechMetaPrompts: domain.setSetechMetaPrompts,
      handleGenerateSetechItems: domain.handleGenerateSetechItems,
      generatingSetech: domain.generatingSetech,
      handleGenerateSetechCriteria: domain.handleGenerateSetechCriteria,
      addDomainSetechItem: domain.addDomainSetechItem,
      setechItems: domain.setechItems,
      setechChecked: domain.setechChecked,
      setSetechChecked: domain.setSetechChecked,
      updateSetechItem: domain.updateSetechItem,
      removeSetechItem: domain.removeSetechItem,
      handleGenerateCommon: domain.handleGenerateCommon,
      updateSubjectSetechMetaPrompt: domain.updateSubjectSetechMetaPrompt,
      updateSubjectSetech: domain.updateSubjectSetech,
    },
  };
}
