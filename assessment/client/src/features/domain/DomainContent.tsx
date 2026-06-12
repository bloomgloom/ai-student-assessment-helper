import { Dispatch, ReactNode, RefObject, SetStateAction, useState } from 'react';
import { AlertCircle, ClipboardCheck, Download, Edit3, Eye, FileText, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { AiGenerateBox } from '../../components/common/AiGenerateBox';
import { CriteriaItemCard } from '../../components/common/CriteriaItemCard';
import { assignmentConfigsApi } from '../../lib/api';
import { DomainCriteriaPanel } from './DomainCriteriaPanel';
import { DomainSubjectCommentsPanel } from './DomainSubjectCommentsPanel';
import { AssignmentClassSnapshot, AssignmentConfig, AssignmentResource, EvalItem, CommentsItem, StandardRef, SubjectDomainRow, SubjectItem } from './types';

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
  handleGenerateCommon: (type: string, metaPrompt: string) => void;
  updateSubjectCommentsMetaPrompt: (type: string, metaPrompt: string) => void;
  updateSubjectComments: (type: string, prompt: string) => void;
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
        <p className="text-xs mt-2">과목을 선택하면 종합 세특 기준을, 영역을 선택하면 해당 영역의 기준을 설정합니다.</p>
      </div>
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdown(md: string) {
  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const nextLine = lines[i + 1]?.trimEnd() || '';
    if (!line.trim()) {
      closeList();
      html.push('<br />');
      continue;
    }
    if (line.includes('|') && isTableSeparator(nextLine)) {
      closeList();
      const headers = splitTableRow(line);
      const bodyRows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      i--;
      html.push('<table><thead><tr>');
      headers.forEach(cell => html.push(`<th>${escapeHtml(cell)}</th>`));
      html.push('</tr></thead><tbody>');
      bodyRows.forEach(row => {
        html.push('<tr>');
        headers.forEach((_, index) => html.push(`<td>${escapeHtml(row[index] || '')}</td>`));
        html.push('</tr>');
      });
      html.push('</tbody></table>');
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      closeList();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      closeList();
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else {
      closeList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return html.join('');
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
  handleGenerateCommon,
  updateSubjectCommentsMetaPrompt,
  updateSubjectComments,
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
  const [extensionDraft, setExtensionDraft] = useState('');
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

  return (
    <div className="flex-1 min-h-0 overflow-auto scrollbar-stable px-6 pt-6 pb-32">
      <div className="min-w-[760px] space-y-8">
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
        <Section>
          <DomainCriteriaPanel
            prompt={achievementStandards.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded border border-dashed border-gray-200">
                기준 관리에 성취기준을 먼저 업로드하세요.
              </p>
            ) : (
              {
                label: '성취 기준 항목 자동 생성',
                placeholder: "성취 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 이 영역의 핵심 성취기준 2~3개를 골라줘)",
                value: standardsMetaPrompt,
                onChange: (value) => {
                  setStandardsMetaPrompt(value);
                  setIsDirty(true);
                },
                onGenerate: handleGenerateStandards,
                generating: generatingStandards,
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
        <Section>
          <DomainCriteriaPanel
            top={(() => {
              const formulaIdx = evalItems.findIndex(i => i.item_type === 'formula');
              if (formulaIdx < 0) return null;
              const formulaItem = evalItems[formulaIdx];
              return (
                <div className={`border rounded-lg p-4 shadow-sm flex gap-3 items-center ${isScoreMismatch ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
                  <div className={`font-bold w-24 ${isScoreMismatch ? 'text-red-800' : 'text-blue-800'}`}>만점</div>
                  <div className={`text-sm flex-1 font-medium ${isScoreMismatch ? 'text-red-700' : 'text-blue-700'}`}>
                    {currentMaxScore}점
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
              );
            })()}
            prompt={{
              label: '채점 기준 항목 자동 생성',
              placeholder: '채점 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 코드 기반 수행평가, 4단계 루브릭으로)',
              value: evalMetaPrompts[-1] || '',
              onChange: (value) => {
                setEvalMetaPrompts(p => ({ ...p, [-1]: value }));
                setIsDirty(true);
              },
              onGenerate: handleGenerateEvalItems,
              generating: generatingEval,
              disabled: !aiEnabled,
            }}
            items={{
              title: '채점 기준 항목',
              addLabel: '항목 추가',
              generating: generatingEval,
              generateDisabled: !aiEnabled || evalItems.filter(i => i.item_type !== 'formula').length === 0,
              onGenerate: handleGenerateEvalRubrics,
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
        <Section>
          <DomainCriteriaPanel
            prompt={{
              label: '기록 기준 항목 자동 생성',
              placeholder: '기록 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 보고서와 코드를 각각 기록하는 항목으로 구성)',
              value: commentsMetaPrompts[-1] || '',
              onChange: (value) => {
                setCommentsMetaPrompts(p => ({ ...p, [-1]: value }));
                setIsDirty(true);
              },
              onGenerate: handleGenerateCommentsItems,
              generating: generatingComments,
              disabled: !aiEnabled,
            }}
            items={{
              title: '기록 기준 항목',
              addLabel: '항목 추가',
              generating: generatingComments,
              generateDisabled: !aiEnabled || commentsItems.length === 0,
              onGenerate: handleGenerateCommentsCriteria,
              onAdd: addDomainCommentsItem,
              empty: commentsItems.length === 0 && (
                <p className="text-center py-6 text-gray-400 text-sm">활동 기록 항목을 추가하거나 AI로 생성하세요.</p>
              ),
              children: commentsItems.map((item, idx) => {
                const isChecked = commentsChecked.has(idx);
                return (
                  <CriteriaItemCard
                    key={idx}
                    checked={isChecked}
                    title={item.title}
                    instruction={commentsMetaPrompts[idx] || ''}
                    result={item.prompt}
                    draggable
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
                    onResultChange={(value) => updateCommentsItem(idx, 'prompt', value)}
                    onRemove={() => removeCommentsItem(idx)}
                  />
                );
              }),
            }}
          />
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
                    <h3 className="text-sm font-semibold text-gray-800">안내문</h3>
                    <p className="mt-0.5 text-xs text-gray-500">학생 화면에 표시될 Markdown 미리보기입니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-secondary py-1 text-xs"
                    onClick={() => assignmentGuideFileRef.current?.click()}
                    disabled={assignmentUploading}
                  >
                    {assignmentUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    MD 업로드
                  </button>
                  <button
                    className="btn-secondary py-1 text-xs"
                    onClick={() => setGuideEditorOpen(true)}
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
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(assignmentConfig?.guide_md || '안내문을 입력하세요.') }}
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
                    onClick={() => assignmentResourceFileRef.current?.click()}
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
                          <a
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            href={assignmentConfigsApi.resourceFileUrl(resource.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="열기"
                          >
                            <Eye size={13} />
                          </a>
                          <a
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            href={assignmentConfigsApi.resourceFileUrl(resource.id)}
                            download={resource.filename}
                            title="다운로드"
                          >
                            <Download size={13} />
                          </a>
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

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">제출 설정</h3>
                <div className="space-y-3">
                  <div>
                    <span className="label">허용 확장자</span>
                    <div className="rounded-md border border-gray-300 bg-white p-2">
                      <div className="space-y-2">
                        {assignmentExtensionRules.map((rule, index) => (
                          <div key={rule.extension} className="grid grid-cols-[minmax(70px,1fr)_92px_78px_28px] items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2">
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-medium text-gray-500">확장자</span>
                              <input
                                className="input h-8 px-2 py-0 text-xs"
                                value={rule.extension}
                                onChange={(e) => {
                                  const next = [...assignmentExtensionRules];
                                  next[index] = { ...rule, extension: e.target.value.replace(/[.,\s]/g, '').toLowerCase() };
                                  updateAssignmentExtensionRules(next);
                                }}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-medium text-gray-500">최대 MB</span>
                              <input
                                className="input h-8 px-2 py-0 text-xs"
                                type="number"
                                min={1}
                                value={rule.max_file_size_mb}
                                onChange={(e) => {
                                  const next = [...assignmentExtensionRules];
                                  next[index] = { ...rule, max_file_size_mb: Number(e.target.value) };
                                  updateAssignmentExtensionRules(next);
                                }}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-medium text-gray-500">파일 수</span>
                              <input
                                className="input h-8 px-2 py-0 text-xs"
                                type="number"
                                min={1}
                                value={rule.max_files}
                                onChange={(e) => {
                                  const next = [...assignmentExtensionRules];
                                  next[index] = { ...rule, max_files: Number(e.target.value) };
                                  updateAssignmentExtensionRules(next);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded border border-red-200 bg-white text-red-500 hover:bg-red-50"
                              onClick={() => updateAssignmentConfig({
                                allowed_extensions: serializeExtensionRules(assignmentExtensionRules.filter((_, ruleIndex) => ruleIndex !== index)),
                              })}
                              title="삭제"
                            >
                              <X size={13} />
                            </button>
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
                          추가
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
                    <h3 className="text-sm font-semibold text-gray-800">안내문 직접 작성</h3>
                    <p className="mt-0.5 text-xs text-gray-500">저장 버튼을 누르면 안내문과 제출 설정이 저장됩니다.</p>
                  </div>
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

      {!selectedDomain && activeTab === 'comments' && (
        <Section>
          <DomainSubjectCommentsPanel
            items={commentsItems}
            onMetaPromptChange={updateSubjectCommentsMetaPrompt}
            onPromptChange={updateSubjectComments}
            onGenerate={handleGenerateCommon}
            aiDisabled={!aiEnabled}
          />
        </Section>
      )}
      </div>
    </div>
  );
}
