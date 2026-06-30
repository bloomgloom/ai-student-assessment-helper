import { Dispatch, DragEvent, lazy, ReactNode, RefObject, SetStateAction, Suspense, useEffect, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { AlertCircle, ClipboardCheck, Download, Edit3, Eye, FileText, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { AiGenerateBox } from '../../components/common/AiGenerateBox';
import { CriteriaItemCard } from '../../components/common/CriteriaItemCard';
import { assignmentConfigsApi } from '../../lib/api';
import { downloadUrl, filesToInputChangeEvent, hasDesktopFileDialogs, openFiles } from '../../lib/desktopFiles';
import { DomainCriteriaPanel, DomainCriteriaPromptView } from './DomainCriteriaPanel';
import { AiChatMessage, AssignmentClassSnapshot, AssignmentConfig, AssignmentResource, EvalItem, CommentsItem, StandardRef, SubjectDomainRow, SubjectItem } from './types';

const ArtifactPreviewContent = lazy(() => import('../../components/ArtifactPreviewContent'));

const CODE_EXTS = new Set(['js','jsx','ts','tsx','py','c','cpp','h','java','css','sql','json','md','txt']);
function isCodeFile(filename: string) {
  return CODE_EXTS.has(filename.split('.').pop()?.toLowerCase() || '');
}

type DomainTab = 'standards' | 'scoring' | 'records' | 'assignment' | 'ratio' | 'comments';

interface DomainContentProps {
  selectedSubject: SubjectItem | null;
  selectedDomain: string | null;
  activeTab: DomainTab;
  isCustomDomain: boolean;
  subjectDomainsMetaPrompt: string;
  setSubjectDomainsMetaPrompt: (value: string) => void;
  generatingSubjectDomains: boolean;
  handleGenerateSubjectDomains: () => void;
  subjectAssessmentRatioError: string | null;
  subjectAssessmentRatioInvalid: boolean;
  allSubjectDomains: SubjectDomainRow[];
  subjectHasUploadedFile: boolean;
  isLockedSubjectDomainRow: (row: SubjectDomainRow) => boolean;
  updateSubjectDomainRow: (idx: number, patch: Partial<SubjectDomainRow>) => void;
  removeSubjectDomainRow: (idx: number) => void;
  addSubjectDomainRow: () => void;
  achievementStandards: any[];
  standardsMetaPrompt: string;
  setStandardsMetaPrompt: (value: string) => void;
  domainAiChats: Record<'standards' | 'scoring' | 'records', AiChatMessage[]>;
  domainAiDrafts: Record<'standards' | 'scoring' | 'records', string>;
  chattingDomainAi: 'standards' | 'scoring' | 'records' | null;
  setDomainAiDraft: (kind: 'standards' | 'scoring' | 'records', value: string) => void;
  handleDomainAiChatSend: (kind: 'standards' | 'scoring' | 'records') => void;
  clearDomainAiChat: (kind: 'standards' | 'scoring' | 'records') => void;
  generatingStandards: boolean;
  handleGenerateStandards: () => void;
  addStandardRef: () => void;
  standardRefs: StandardRef[];
  uniqueStandardDomains: string[];
  uniqueCodesForDomain: (domain: string) => any[];
  updateStandardRefDomain: (idx: number, domain: string) => void;
  updateStandardRefCode: (idx: number, code: string) => void;
  removeStandardRef: (idx: number) => void;
  evalItems: EvalItem[];
  currentMaxScore: number;
  calculatedScore: number;
  isScoreMismatch: boolean;
  updateEvalItem: (idx: number, field: keyof EvalItem, value: string) => void;
  evalMetaPrompts: Record<number, string>;
  setEvalMetaPrompts: Dispatch<SetStateAction<Record<number, string>>>;
  setIsDirty: (dirty: boolean) => void;
  handleGenerateEvalItems: () => void;
  generatingEval: boolean;
  handleGenerateEvalRubrics: () => void;
  addEvalItem: () => void;
  evalChecked: Set<number>;
  setEvalChecked: Dispatch<SetStateAction<Set<number>>>;
  removeEvalItem: (idx: number) => void;
  moveEvalItem: (from: number, to: number) => void;
  commentsMetaPrompts: Record<number, string>;
  setCommentsMetaPrompts: Dispatch<SetStateAction<Record<number, string>>>;
  handleGenerateCommentsItems: () => void;
  generatingComments: boolean;
  handleGenerateCommentsCriteria: () => void;
  addDomainCommentsItem: () => void;
  commentsItems: CommentsItem[];
  commentsChecked: Set<number>;
  setCommentsChecked: Dispatch<SetStateAction<Set<number>>>;
  updateCommentsItem: (idx: number, field: keyof CommentsItem, value: string) => void;
  removeCommentsItem: (idx: number) => void;
  moveCommentsItem: (from: number, to: number) => void;
  subjectCommentsPrompt: string;
  updateSubjectCommentsPrompt: (prompt: string) => void;
  subjectCommentsChat: AiChatMessage[];
  subjectCommentsDraft: string;
  setSubjectCommentsDraft: (value: string) => void;
  chattingSubjectComments: boolean;
  generatingSubjectComments: boolean;
  handleSubjectCommentsChatSend: () => void;
  handleGenerateSubjectComments: () => void;
  clearSubjectCommentsChat: () => void;
  aiEnabled: boolean;
  assignmentGuideFileRef: RefObject<HTMLInputElement>;
  assignmentResourceFileRef: RefObject<HTMLInputElement>;
  assignmentConfig: AssignmentConfig | null;
  assignmentResources: AssignmentResource[];
  assignmentClasses: AssignmentClassSnapshot[];
  assignmentLoading: boolean;
  assignmentUploading: boolean;
  updateAssignmentConfig: (patch: Partial<AssignmentConfig>) => void;
  saveAssignmentConfig: () => Promise<boolean>;
  handleAssignmentGuideUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAssignmentResourceUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  deleteAssignmentResource: (id: number) => void;
}

function EmptySelection() {
  return (
    <div className="flex-1 flex items-center justify-center text-gray-400">
      <div className="text-center">
        <ClipboardCheck size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">왼쪽 트리에서 영역이나 과목명을 선택하세요</p>
        <p className="text-xs mt-2">과목 또는 영역을 선택해 평가 기준을 설정합니다.</p>
      </div>
    </div>
  );
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={className}>{children}</section>;
}

const mdRenderer = new MarkdownIt({ html: true, linkify: true, breaks: false, typographer: false });

function renderMarkdown(md: string) {
  return mdRenderer.render(md);
}

function formatBytes(size: number) {
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseExtensionList(value: string) {
  return value
    .split(/[\s,]+/)
    .map(item => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function serializeExtensionList(items: string[]) {
  return items.map(item => item.replace(/^\./, '').toLowerCase()).filter(Boolean).join('\n');
}

interface AssignmentExtensionRule {
  extension: string;
  max_file_size_mb: number;
  max_files: number;
}

function parseExtensionRules(value: string, fallbackSize = 50, fallbackFiles = 1): AssignmentExtensionRule[] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => ({
          extension: String(item.extension || item.ext || '').trim().replace(/^\./, '').toLowerCase(),
          max_file_size_mb: Math.max(1, Number(item.max_file_size_mb || item.maxFileSizeMb || fallbackSize)),
          max_files: Math.max(1, Number(item.max_files || item.maxFiles || fallbackFiles)),
        }))
        .filter(item => item.extension)
        .filter((item, index, arr) => arr.findIndex(other => other.extension === item.extension) === index);
    }
  } catch {
    // Legacy newline/comma separated extension list.
  }
  return parseExtensionList(value).map(extension => ({
    extension,
    max_file_size_mb: Math.max(1, Number(fallbackSize) || 50),
    max_files: Math.max(1, Number(fallbackFiles) || 1),
  }));
}

function serializeExtensionRules(items: AssignmentExtensionRule[]) {
  return JSON.stringify(
    items
      .map(item => ({
        extension: item.extension.trim().replace(/^\./, '').toLowerCase(),
        max_file_size_mb: Math.max(1, Number(item.max_file_size_mb) || 50),
        max_files: Math.max(1, Number(item.max_files) || 1),
      }))
      .filter(item => item.extension)
      .filter((item, index, arr) => arr.findIndex(other => other.extension === item.extension) === index)
  );
}

function extBadgeClass(ext: string): string {
  switch (ext) {
    case 'py':   return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'c':
    case 'cpp':
    case 'h':    return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'pdf':  return 'bg-red-100 text-red-700 border-red-300';
    case 'html': return 'bg-orange-100 text-orange-700 border-orange-300';
    case 'hwpx': return 'bg-teal-100 text-teal-700 border-teal-300';
    case 'csv':  return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'ipynb': return 'bg-indigo-100 text-indigo-700 border-indigo-300';
    case 'java': return 'bg-red-100 text-red-800 border-red-300';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'json': return 'bg-gray-100 text-gray-700 border-gray-300';
    case 'sql':  return 'bg-green-100 text-green-700 border-green-300';
    default:     return 'bg-gray-100 text-gray-500 border-gray-300';
  }
}

export function DomainContent({
  selectedSubject,
  selectedDomain,
  activeTab,
  isCustomDomain,
  subjectDomainsMetaPrompt,
  setSubjectDomainsMetaPrompt,
  generatingSubjectDomains,
  handleGenerateSubjectDomains,
  subjectAssessmentRatioError,
  subjectAssessmentRatioInvalid,
  allSubjectDomains,
  subjectHasUploadedFile,
  isLockedSubjectDomainRow,
  updateSubjectDomainRow,
  removeSubjectDomainRow,
  addSubjectDomainRow,
  achievementStandards,
  standardsMetaPrompt,
  setStandardsMetaPrompt,
  domainAiChats,
  domainAiDrafts,
  chattingDomainAi,
  setDomainAiDraft,
  handleDomainAiChatSend,
  clearDomainAiChat,
  generatingStandards,
  handleGenerateStandards,
  addStandardRef,
  standardRefs,
  uniqueStandardDomains,
  uniqueCodesForDomain,
  updateStandardRefDomain,
  updateStandardRefCode,
  removeStandardRef,
  evalItems,
  currentMaxScore,
  calculatedScore,
  isScoreMismatch,
  updateEvalItem,
  evalMetaPrompts,
  setEvalMetaPrompts,
  setIsDirty,
  handleGenerateEvalItems,
  generatingEval,
  handleGenerateEvalRubrics,
  addEvalItem,
  evalChecked,
  setEvalChecked,
  removeEvalItem,
  moveEvalItem,
  commentsMetaPrompts,
  setCommentsMetaPrompts,
  handleGenerateCommentsItems,
  generatingComments,
  handleGenerateCommentsCriteria,
  addDomainCommentsItem,
  commentsItems,
  commentsChecked,
  setCommentsChecked,
  updateCommentsItem,
  removeCommentsItem,
  moveCommentsItem,
  subjectCommentsPrompt,
  updateSubjectCommentsPrompt,
  subjectCommentsChat,
  subjectCommentsDraft,
  setSubjectCommentsDraft,
  chattingSubjectComments,
  generatingSubjectComments,
  handleSubjectCommentsChatSend,
  handleGenerateSubjectComments,
  clearSubjectCommentsChat,
  aiEnabled,
  assignmentGuideFileRef,
  assignmentResourceFileRef,
  assignmentConfig,
  assignmentResources,
  assignmentClasses,
  assignmentLoading,
  assignmentUploading,
  updateAssignmentConfig,
  saveAssignmentConfig,
  handleAssignmentGuideUpload,
  handleAssignmentResourceUpload,
  deleteAssignmentResource,
}: DomainContentProps) {
  const [guideEditorOpen, setGuideEditorOpen] = useState(false);
  const [guideOriginal, setGuideOriginal] = useState('');
  const [extensionDraft, setExtensionDraft] = useState('');
  const [viewingResource, setViewingResource] = useState<AssignmentResource | null>(null);
  const [resourceCodeContent, setResourceCodeContent] = useState('');
  const [resourceCodeLoading, setResourceCodeLoading] = useState(false);
  const [resourcePdfPages, setResourcePdfPages] = useState(0);
  const [draggedItem, setDraggedItem] = useState<{ kind: 'scoring' | 'records'; index: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ kind: 'scoring' | 'records'; index: number } | null>(null);

  const startItemDrag = (kind: 'scoring' | 'records', index: number, event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${index}`);
    setDraggedItem({ kind, index });
    setDragOverItem({ kind, index });
  };

  const finishItemDrag = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const dropItem = (kind: 'scoring' | 'records', index: number, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedItem || draggedItem.kind !== kind) return finishItemDrag();
    if (kind === 'scoring') moveEvalItem(draggedItem.index, index);
    else moveCommentsItem(draggedItem.index, index);
    finishItemDrag();
  };

  useEffect(() => {
    if (!viewingResource) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingResource(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewingResource]);

  const handleViewResource = async (resource: AssignmentResource) => {
    setViewingResource(resource);
    setResourceCodeContent('');
    if (isCodeFile(resource.filename)) {
      setResourceCodeLoading(true);
      try {
        setResourceCodeContent(await (await fetch(assignmentConfigsApi.resourceFileUrl(resource.id))).text());
      } finally {
        setResourceCodeLoading(false);
      }
    }
  };
  const assignmentExtensionRules = parseExtensionRules(
    assignmentConfig?.allowed_extensions || '',
    assignmentConfig?.max_file_size_mb || 50,
    assignmentConfig?.max_files || 1
  );
  const updateAssignmentExtensionRules = (rules: AssignmentExtensionRule[]) => {
    const normalized = rules
      .map(item => ({
        extension: item.extension.trim().replace(/^\./, '').toLowerCase(),
        max_file_size_mb: Math.max(1, Number(item.max_file_size_mb) || 50),
        max_files: Math.max(1, Number(item.max_files) || 1),
      }))
      .filter(item => item.extension)
      .filter((item, index, arr) => arr.findIndex(other => other.extension === item.extension) === index);
    updateAssignmentConfig({
      allowed_extensions: serializeExtensionRules(normalized),
      max_file_size_mb: Math.max(1, ...normalized.map(item => item.max_file_size_mb), 50),
      max_files: Math.max(1, ...normalized.map(item => item.max_files), 1),
    });
  };

  if (!selectedSubject) {
    return <EmptySelection />;
  }

  const useFullHeightCriteriaLayout = !!selectedDomain && ['standards', 'scoring', 'records', 'comments'].includes(activeTab);

  return (
    <div className={`flex-1 min-h-0 px-6 pt-6 ${useFullHeightCriteriaLayout ? 'overflow-hidden pb-6' : 'overflow-auto pb-32 scrollbar-stable'}`}>
      <div className={`min-w-[760px] ${useFullHeightCriteriaLayout ? 'h-full min-h-0' : 'space-y-8'}`}>
      {!selectedDomain && activeTab === 'ratio' && (
        <Section>
          <div className="mb-4">
            <AiGenerateBox
              label="평가 영역 자동 생성"
              placeholder="반영비율/만점관리 생성을 위한 지시사항을 입력하세요. (예: 수행평가 2개와 기록 영역 1개로 구성)"
              value={subjectDomainsMetaPrompt}
              onChange={(value) => {
                setSubjectDomainsMetaPrompt(value);
                setIsDirty(true);
              }}
              onGenerate={handleGenerateSubjectDomains}
              generating={generatingSubjectDomains}
              disabled={!aiEnabled}
            />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className={`flex h-8 items-center gap-1.5 border-b px-3 text-xs transition-colors ${subjectAssessmentRatioError ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-100 bg-gray-50 text-transparent'}`}>
              {subjectAssessmentRatioError && <AlertCircle size={12} className="shrink-0" />}
              <span>{subjectAssessmentRatioError || '반영비율 합계 정상'}</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50/50">
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-28">평가종류</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">영역명</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-500 w-28">학기말반영</th>
                  <th className={`px-3 py-2 text-center font-medium w-28 ${subjectAssessmentRatioInvalid ? 'bg-red-50 text-red-700' : 'text-gray-500'}`}>반영비율</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-500 w-28">만점</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {allSubjectDomains.map((row, i) => {
                  const locked = isLockedSubjectDomainRow(row);
                  const recordType = row.eval_type === '기록';
                  const ratioInvalid = subjectAssessmentRatioInvalid && (row.eval_type === '지필' || row.eval_type === '수행');
                  const inputClass = `input h-8 px-2 py-0 text-xs ${locked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`;
                  return (
                    <tr key={row.id ?? i} className={`border-b border-gray-100 last:border-0 ${locked ? 'text-gray-400' : ''}`}>
                      <td className="px-2 py-1.5">
                        <select
                          className={inputClass}
                          value={row.eval_type || (subjectHasUploadedFile ? '기록' : '수행')}
                          onChange={(e) => updateSubjectDomainRow(i, {
                            eval_type: e.target.value,
                            reflected: e.target.value === '기록' ? 'X' : 'O',
                          })}
                          disabled={locked}
                        >
                          {locked ? (
                            <option value={row.eval_type}>{row.eval_type}</option>
                          ) : subjectHasUploadedFile ? (
                            <option value="기록">기록</option>
                          ) : (
                            <>
                              <option value="지필">지필</option>
                              <option value="수행">수행</option>
                              <option value="기록">기록</option>
                            </>
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={`${inputClass} w-full`}
                          value={row.name || ''}
                          onChange={(e) => updateSubjectDomainRow(i, { name: e.target.value })}
                          disabled={locked}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {recordType ? (
                          <div className="flex h-8 items-center justify-center rounded border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-400">
                            X
                          </div>
                        ) : (
                          <div className={`flex h-8 items-center justify-center rounded border px-2 text-xs font-medium ${locked ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                            O
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {recordType ? (
                          <div className="flex h-8 items-center justify-center rounded border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-400">
                            -
                          </div>
                        ) : (
                          <input
                            className={`${inputClass} text-center ${ratioInvalid ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200' : ''}`}
                            type="number"
                            min="0"
                            value={row.ratio ?? 0}
                            onChange={(e) => updateSubjectDomainRow(i, { ratio: e.target.value })}
                            disabled={locked}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {recordType ? (
                          <div className="flex h-8 items-center justify-center rounded border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-400">
                            -
                          </div>
                        ) : (
                          <input
                            className={`${inputClass} text-center`}
                            type="number"
                            min="0"
                            value={row.max_score ?? 0}
                            onChange={(e) => updateSubjectDomainRow(i, { max_score: e.target.value })}
                            disabled={locked}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {!locked && (
                          <button
                            className="p-1 hover:bg-red-50 text-red-400 rounded"
                            onClick={() => removeSubjectDomainRow(i)}
                            title="행 삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {allSubjectDomains.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      반영비율/만점관리 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <button
              className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-gray-200 py-2 text-xs text-blue-600 hover:bg-blue-50"
              onClick={addSubjectDomainRow}
            >
              <Plus size={13} /> 행 추가
            </button>
          </div>
        </Section>
      )}

      {selectedDomain && activeTab === 'standards' && (
        <Section className="h-full min-h-0">
          <DomainCriteriaPanel
            prompt={achievementStandards.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded border border-dashed border-gray-200">
                기준 관리에 성취기준을 먼저 업로드하세요.
              </p>
            ) : (
              {
                label: '성취 기준 항목 자동 생성',
                placeholder: "예: 이 영역의 핵심 성취기준 2~3개를 골라줘",
                messages: domainAiChats.standards,
                draft: domainAiDrafts.standards,
                onDraftChange: (value) => setDomainAiDraft('standards', value),
                onSend: () => handleDomainAiChatSend('standards'),
                onGenerate: handleGenerateStandards,
                onClearChat: () => clearDomainAiChat('standards'),
                generating: generatingStandards,
                chatting: chattingDomainAi === 'standards',
                disabled: !aiEnabled,
              }
            )}
            items={{
              title: '성취 기준 항목',
              addLabel: '항목 추가',
              onAdd: addStandardRef,
              empty: standardRefs.length === 0 && achievementStandards.length > 0 && (
                <p className="text-center py-4 text-gray-400 text-sm">참조할 성취기준을 추가하거나 AI로 선택하세요.</p>
              ),
              children: standardRefs.map((ref, idx) => {
                  const codes = uniqueCodesForDomain(ref.domain_name_ref);
                  return (
                    <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="input text-xs flex-[3] min-w-0"
                          value={ref.domain_name_ref}
                          onChange={e => updateStandardRefDomain(idx, e.target.value)}
                        >
                          <option value="">영역 선택</option>
                          {uniqueStandardDomains.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select
                          className="input text-xs flex-[7] min-w-0"
                          value={ref.code}
                          onChange={e => updateStandardRefCode(idx, e.target.value)}
                          disabled={!ref.domain_name_ref}
                        >
                          <option value="">성취기준 선택</option>
                          {codes.map(s => {
                            const preview = s.content.replace(s.code, '').trim().slice(0, 40);
                            return <option key={s.code} value={s.code}>{s.code} {preview}{s.content.length > s.code.length + 40 ? '…' : ''}</option>;
                          })}
                        </select>
                        <button
                          className="p-1 hover:bg-red-100 text-red-400 rounded shrink-0"
                          onClick={() => removeStandardRef(idx)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {ref.content && (
                        <p className="text-xs text-gray-600 leading-relaxed bg-white rounded p-2 border border-amber-100">
                          <span className="font-mono text-blue-600 mr-1.5">{ref.code}</span>
                          {ref.content.replace(ref.code, '').trim()}
                        </p>
                      )}
                    </div>
                  );
                }),
            }}
          />
        </Section>
      )}

      {selectedDomain && !isCustomDomain && activeTab === 'scoring' && (
        <Section className="h-full min-h-0">
          <DomainCriteriaPanel
            top={(() => {
              const formulaIdx = evalItems.findIndex(i => i.item_type === 'formula');
              if (formulaIdx < 0) return null;
              const formulaItem = evalItems[formulaIdx];
              return (
                <div className={`space-y-3 rounded-lg border p-4 shadow-sm ${isScoreMismatch ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex h-9 items-center gap-3">
                    <div className={`w-24 text-sm font-semibold ${isScoreMismatch ? 'text-red-800' : 'text-blue-800'}`}>공통</div>
                    <div className={`text-sm flex-1 font-medium ${isScoreMismatch ? 'text-red-700' : 'text-blue-700'}`}>
                      만점 {currentMaxScore}점
                      {isScoreMismatch && <span className="ml-2 font-bold">(합계 {calculatedScore}점)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isScoreMismatch ? 'text-red-800' : 'text-blue-800'}`}>기본점수:</span>
                      <input
                        className="input w-20 text-sm text-center"
                        type="number"
                        placeholder="0"
                        value={formulaItem.score}
                        onChange={e => updateEvalItem(formulaIdx, 'score', e.target.value)}
                      />
                    </div>
                  </div>
                  <textarea
                    className="textarea min-h-[86px] w-full resize-y bg-white text-sm leading-relaxed"
                    placeholder="공통 채점 기준 내용"
                    value={formulaItem.rubric}
                    onChange={e => updateEvalItem(formulaIdx, 'rubric', e.target.value)}
                  />
                </div>
              );
            })()}
            prompt={{
              label: '채점 기준 항목 자동 생성',
              placeholder: '예: 코드 기반 수행평가, 4단계 루브릭으로',
              messages: domainAiChats.scoring,
              draft: domainAiDrafts.scoring,
              onDraftChange: (value) => setDomainAiDraft('scoring', value),
              onSend: () => handleDomainAiChatSend('scoring'),
              onGenerate: handleGenerateEvalItems,
              onClearChat: () => clearDomainAiChat('scoring'),
              generating: generatingEval,
              chatting: chattingDomainAi === 'scoring',
              disabled: !aiEnabled,
            }}
            items={{
              title: '채점 기준 항목',
              addLabel: '항목 추가',
              generating: generatingEval,
              onAdd: addEvalItem,
              empty: evalItems.filter(i => i.item_type !== 'formula').length === 0 && (
                <p className="text-center py-6 text-gray-400 text-sm">채점 항목을 추가하거나 AI로 생성하세요.</p>
              ),
              children: evalItems.map((item, idx) => {
                if (item.item_type === 'formula') return null;
                const isChecked = evalChecked.has(idx);
                return (
                  <CriteriaItemCard
                    key={idx}
                    checked={isChecked}
                    title={item.name}
                    instruction={evalMetaPrompts[idx] || ''}
                    result={item.rubric}
                    score={item.score}
                    draggable
                    dragActive={draggedItem?.kind === 'scoring' && draggedItem.index === idx}
                    dragOver={dragOverItem?.kind === 'scoring' && dragOverItem.index === idx && draggedItem?.index !== idx}
                    onDragStart={(event) => startItemDrag('scoring', idx, event)}
                    onDragEnd={finishItemDrag}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverItem({ kind: 'scoring', index: idx });
                    }}
                    onDrop={(event) => dropItem('scoring', idx, event)}
                    titlePlaceholder="채점 항목명 (예: 코드 완성도)"
                    instructionPlaceholder="채점 기준 내용 생성을 위한 지시사항을 입력하세요. (예: 코드 완성도 기준으로 4단계로 나눠줘)"
                    resultPlaceholder="루브릭 내용 (예: A(10점): 코드가 완벽히 동작하고 예외 처리가 됨, B(8점): ...)"
                    resultLabel="채점 기준 내용"
                    onCheckedChange={(checked) => {
                      const next = new Set(evalChecked);
                      if (checked) next.add(idx); else next.delete(idx);
                      setEvalChecked(next);
                    }}
                    onTitleChange={(value) => updateEvalItem(idx, 'name', value)}
                    onInstructionChange={(value) => {
                      setEvalMetaPrompts(p => ({ ...p, [idx]: value }));
                      setIsDirty(true);
                    }}
                    instructionDisabled={!aiEnabled}
                    showCheckbox={false}
                    showInstruction={false}
                    onResultChange={(value) => updateEvalItem(idx, 'rubric', value)}
                    onScoreChange={(value) => updateEvalItem(idx, 'score', value)}
                    onRemove={() => removeEvalItem(idx)}
                  />
                );
              }),
            }}
          />
        </Section>
      )}

      {selectedDomain && activeTab === 'records' && (
        <Section className="h-full min-h-0">
          <DomainCriteriaPanel
            top={(() => {
              const commonIdx = commentsItems.findIndex(item => item.type === '공통');
              if (commonIdx < 0) return null;
              const commonItem = commentsItems[commonIdx];
              return (
                <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm">
                  <div className="flex h-9 items-center gap-3">
                    <div className="w-24 text-sm font-semibold text-purple-800">공통</div>
                  </div>
                  <textarea
                    className="textarea min-h-[96px] w-full resize-y bg-white text-sm leading-relaxed"
                    placeholder="모든 기록 기준에 공통으로 적용할 내용"
                    value={commonItem.prompt}
                    onChange={e => updateCommentsItem(commonIdx, 'prompt', e.target.value)}
                  />
                </div>
              );
            })()}
            prompt={{
              label: '기록 기준 항목 자동 생성',
              placeholder: '예: 보고서와 코드를 각각 기록하는 항목으로 구성',
              messages: domainAiChats.records,
              draft: domainAiDrafts.records,
              onDraftChange: (value) => setDomainAiDraft('records', value),
              onSend: () => handleDomainAiChatSend('records'),
              onGenerate: handleGenerateCommentsItems,
              onClearChat: () => clearDomainAiChat('records'),
              generating: generatingComments,
              chatting: chattingDomainAi === 'records',
              disabled: !aiEnabled,
            }}
            items={{
              title: '기록 기준 항목',
              addLabel: '항목 추가',
              generating: generatingComments,
              onAdd: addDomainCommentsItem,
              empty: commentsItems.filter(item => item.type !== '공통').length === 0 && (
                <p className="text-center py-6 text-gray-400 text-sm">활동 기록 항목을 추가하거나 AI로 생성하세요.</p>
              ),
              children: commentsItems.map((item, idx) => {
                if (item.type === '공통') return null;
                const isChecked = commentsChecked.has(idx);
                return (
                  <CriteriaItemCard
                    key={idx}
                    checked={isChecked}
                    title={item.title}
                    instruction={commentsMetaPrompts[idx] || ''}
                    result={item.prompt}
                    draggable
                    dragActive={draggedItem?.kind === 'records' && draggedItem.index === idx}
                    dragOver={dragOverItem?.kind === 'records' && dragOverItem.index === idx && draggedItem?.index !== idx}
                    onDragStart={(event) => startItemDrag('records', idx, event)}
                    onDragEnd={finishItemDrag}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverItem({ kind: 'records', index: idx });
                    }}
                    onDrop={(event) => dropItem('records', idx, event)}
                    titlePlaceholder="항목 이름 (예: 자료수집 및 분석)"
                    instructionPlaceholder="기록 기준 내용 생성을 위한 지시사항을 입력하세요. (예: 학생의 탐구 과정 중심으로 작성 기준 생성)"
                    resultPlaceholder="이 항목의 기록 작성 기준 (예: 학생이 제출한 산출물을 분석하여 성취수준을 평가하고...)"
                    resultLabel="기록 기준 내용"
                    onCheckedChange={(checked) => {
                      const next = new Set(commentsChecked);
                      if (checked) next.add(idx); else next.delete(idx);
                      setCommentsChecked(next);
                    }}
                    onTitleChange={(value) => updateCommentsItem(idx, 'title', value)}
                    onInstructionChange={(value) => {
                      setCommentsMetaPrompts(p => ({ ...p, [idx]: value }));
                      setIsDirty(true);
                    }}
                    instructionDisabled={!aiEnabled}
                    showCheckbox={false}
                    showInstruction={false}
                    onResultChange={(value) => updateCommentsItem(idx, 'prompt', value)}
                    onRemove={() => removeCommentsItem(idx)}
                  />
                );
              }),
            }}
          />
        </Section>
      )}

      {selectedDomain && activeTab === 'comments' && (
        <Section className="h-full min-h-0">
          <div className="grid h-full min-h-0 grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)] gap-4">
            <div className="min-h-0 min-w-0">
              <DomainCriteriaPromptView
                prompt={{
                  label: '세특 기준 생성',
                  placeholder: '예: 학생의 탐구 과정과 성장, 과목 역량이 구체적으로 드러나게 작성해줘',
                  generateLabel: '세특 생성',
                  messages: subjectCommentsChat,
                  draft: subjectCommentsDraft,
                  onDraftChange: setSubjectCommentsDraft,
                  onSend: handleSubjectCommentsChatSend,
                  onGenerate: handleGenerateSubjectComments,
                  onClearChat: clearSubjectCommentsChat,
                  generating: generatingSubjectComments,
                  chatting: chattingSubjectComments,
                  disabled: !aiEnabled,
                }}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-sm">
              <div className="mb-3 flex h-9 shrink-0 items-center gap-3">
                <div className="w-24 text-sm font-semibold text-purple-800">공통</div>
              </div>
              <textarea
                className="textarea min-h-0 flex-1 resize-none bg-white text-sm leading-relaxed"
                placeholder="생성된 세특 기준이 여기에 표시됩니다. 직접 수정할 수도 있습니다."
                value={subjectCommentsPrompt}
                onChange={e => updateSubjectCommentsPrompt(e.target.value)}
              />
            </div>
          </div>
        </Section>
      )}

      {selectedDomain && activeTab === 'assignment' && (
        <Section>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-gray-500" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800">안내</h3>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-secondary py-1 text-xs"
                    onClick={async () => {
                      if (hasDesktopFileDialogs()) {
                        const files = await openFiles({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] });
                        if (files?.length) handleAssignmentGuideUpload(filesToInputChangeEvent(files) as any);
                        return;
                      }
                      assignmentGuideFileRef.current?.click();
                    }}
                    disabled={assignmentUploading}
                  >
                    {assignmentUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    MD 업로드
                  </button>
                  <button
                    className="btn-secondary py-1 text-xs"
                    onClick={() => { setGuideOriginal(assignmentConfig?.guide_md || ''); setGuideEditorOpen(true); }}
                  >
                    <Edit3 size={13} />
                    직접 작성
                  </button>
                  <input
                    ref={assignmentGuideFileRef}
                    type="file"
                    className="hidden"
                    accept=".md,.markdown,text/markdown,text/plain"
                    onChange={handleAssignmentGuideUpload}
                  />
                </div>
              </div>
              {assignmentLoading ? (
                <div className="flex h-[42rem] items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <div
                  className="prose-preview h-[42rem] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-800"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(assignmentConfig?.guide_md || '안내 사항을 입력하세요.') }}
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">배부 자료</h3>
                    <p className="mt-0.5 text-xs text-gray-500">학생이 다운로드할 파일입니다.</p>
                  </div>
                  <button
                    className="btn-secondary py-1 text-xs"
                    onClick={async () => {
                      if (hasDesktopFileDialogs()) {
                        const files = await openFiles({ multiple: true });
                        if (files?.length) handleAssignmentResourceUpload(filesToInputChangeEvent(files) as any);
                        return;
                      }
                      assignmentResourceFileRef.current?.click();
                    }}
                    disabled={assignmentUploading}
                  >
                    {assignmentUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    업로드
                  </button>
                  <input
                    ref={assignmentResourceFileRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={handleAssignmentResourceUpload}
                  />
                </div>
                <div className="space-y-2">
                  {assignmentResources.map((resource) => (
                    <div key={resource.id} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                      <div className="truncate text-xs font-medium text-gray-800" title={resource.filename}>{resource.filename}</div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                        <span>{formatBytes(Number(resource.size))}</span>
                        <div className="flex gap-1">
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            onClick={() => handleViewResource(resource)}
                            title="미리보기"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            onClick={() => downloadUrl(
                              assignmentConfigsApi.resourceFileUrl(resource.id),
                              resource.filename,
                            ).catch((error) => alert(error.message))}
                            title="다운로드"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-white text-red-500 hover:bg-red-50"
                            onClick={() => deleteAssignmentResource(resource.id)}
                            title="삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {assignmentResources.length === 0 && (
                    <div className="rounded-md border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                      업로드된 배부 자료가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 배부 자료 미리보기 모달 */}
              {viewingResource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-white rounded-lg shadow-xl w-[85vw] h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                      <div className="font-medium text-sm text-gray-800 truncate max-w-[60%]">{viewingResource.filename}</div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => downloadUrl(
                            assignmentConfigsApi.resourceFileUrl(viewingResource.id),
                            viewingResource.filename,
                          ).catch((error) => alert(error.message))}
                          className="btn-secondary text-xs py-1 inline-flex items-center gap-1"
                        >
                          <Download size={13} /> 다운로드
                        </button>
                        <button className="btn-secondary text-xs py-1 inline-flex items-center gap-1" onClick={() => setViewingResource(null)}>
                          <X size={13} /> 닫기
                        </button>
                      </div>
                    </div>
                    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 size={24} className="animate-spin text-gray-400" /></div>}>
                      <ArtifactPreviewContent
                        artifact={{ id: viewingResource.id, filename: viewingResource.filename, source: 'resource' }}
                        codeContent={resourceCodeContent}
                        loadingCode={resourceCodeLoading}
                        pdfPages={resourcePdfPages}
                        setPdfPages={setResourcePdfPages}
                      />
                    </Suspense>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">제출 파일 설정</h3>
                <div className="space-y-3">
                  <div>
                    <div className="rounded-md border border-gray-300 bg-white p-2">
                      <div className="space-y-1">
                        {assignmentExtensionRules.length > 0 && (
                          <div className="grid grid-cols-3 px-2 pb-1 text-[11px] font-medium text-gray-400">
                            <span className="text-center">확장자</span>
                            <span className="text-center">최대 용량</span>
                            <span className="text-center">파일 수</span>
                          </div>
                        )}
                        {assignmentExtensionRules.map((rule, index) => (
                          <div key={rule.extension} className="grid grid-cols-3 items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
                            <div className="flex justify-center">
                              <div className="relative group">
                                <span className={`px-2 py-0.5 text-[11px] font-bold rounded border whitespace-nowrap ${extBadgeClass(rule.extension)}`}>
                                  {rule.extension.toUpperCase()}
                                </span>
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white"
                                  onClick={() => updateAssignmentConfig({
                                    allowed_extensions: serializeExtensionRules(assignmentExtensionRules.filter((_, ruleIndex) => ruleIndex !== index)),
                                  })}
                                  title="삭제"
                                >
                                  <X size={8} />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <input
                                className="input h-7 w-14 px-1.5 py-0 text-center text-xs"
                                type="number"
                                min={1}
                                value={rule.max_file_size_mb}
                                onChange={(e) => {
                                  const next = [...assignmentExtensionRules];
                                  next[index] = { ...rule, max_file_size_mb: Number(e.target.value) };
                                  updateAssignmentExtensionRules(next);
                                }}
                              />
                              <span className="text-[11px] text-gray-500">MB</span>
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <input
                                className="input h-7 w-12 px-1.5 py-0 text-center text-xs"
                                type="number"
                                min={1}
                                value={rule.max_files}
                                onChange={(e) => {
                                  const next = [...assignmentExtensionRules];
                                  next[index] = { ...rule, max_files: Number(e.target.value) };
                                  updateAssignmentExtensionRules(next);
                                }}
                              />
                              <span className="text-[11px] text-gray-500">개</span>
                            </div>
                          </div>
                        ))}
                        {assignmentExtensionRules.length === 0 && (
                          <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-xs text-gray-400">
                            확장자를 추가하면 학생 화면에 확장자별 업로드 버튼이 표시됩니다. 비워두면 모든 확장자를 50MB, 1개까지 허용합니다.
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="input h-8 px-2 py-0 text-xs"
                          value={extensionDraft}
                          onChange={(e) => setExtensionDraft(e.target.value.replace(/[.,\s]/g, '').toLowerCase())}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const next = extensionDraft.trim().replace(/^\./, '').toLowerCase();
                            if (!next) return;
                            updateAssignmentExtensionRules([...assignmentExtensionRules, { extension: next, max_file_size_mb: 50, max_files: 1 }]);
                            setExtensionDraft('');
                          }}
                          placeholder="pdf"
                        />
                        <button
                          type="button"
                          className="btn-secondary h-8 py-0 text-xs"
                          onClick={() => {
                            const next = extensionDraft.trim().replace(/^\./, '').toLowerCase();
                            if (!next) return;
                            updateAssignmentExtensionRules([...assignmentExtensionRules, { extension: next, max_file_size_mb: 50, max_files: 1 }]);
                            setExtensionDraft('');
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {guideEditorOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
              <div className="flex h-[82vh] w-[min(980px,calc(100vw-3rem))] flex-col rounded-lg bg-white shadow-xl">
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">안내 사항 직접 작성</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary py-1 text-xs"
                      onClick={() => { updateAssignmentConfig({ guide_md: guideOriginal }); setGuideEditorOpen(false); }}
                    >
                      <X size={13} />
                      닫기
                    </button>
                    <button
                      className="btn-primary py-1 text-xs"
                      onClick={async () => {
                        const ok = await saveAssignmentConfig();
                        if (ok) setGuideEditorOpen(false);
                      }}
                    >
                      <Save size={13} />
                      저장
                    </button>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
                  <div className="min-h-0 border-r border-gray-200 p-4">
                    <textarea
                      className="textarea h-full w-full font-mono text-xs leading-relaxed"
                      value={assignmentConfig?.guide_md || ''}
                      onChange={(e) => updateAssignmentConfig({ guide_md: e.target.value })}
                      placeholder={'# 수행평가 안내\n\n| 항목 | 내용 |\n| --- | --- |\n| 제출물 | 보고서 |\n| 형식 | PDF |\n'}
                    />
                  </div>
                  <div className="min-h-0 p-4">
                    <div
                      className="prose-preview h-full overflow-auto rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(assignmentConfig?.guide_md || '안내문을 입력하세요.') }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      </div>
    </div>
  );
}
