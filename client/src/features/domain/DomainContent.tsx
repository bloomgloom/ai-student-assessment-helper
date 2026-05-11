import { Dispatch, ReactNode, SetStateAction } from 'react';
import { AlertCircle, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { AiGenerateBox } from '../../components/common/AiGenerateBox';
import { CriteriaItemCard } from '../../components/common/CriteriaItemCard';
import { DomainCriteriaPanel } from './DomainCriteriaPanel';
import { DomainSubjectCommentsPanel } from './DomainSubjectCommentsPanel';
import { EvalItem, CommentsItem, StandardRef, SubjectDomainRow, SubjectItem } from './types';

type DomainTab = 'standards' | 'scoring' | 'records' | 'ratio' | 'comments';

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
}: DomainContentProps) {
  if (!selectedSubject) {
    return <EmptySelection />;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto scrollbar-stable p-6">
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
            }}
            items={{
              title: '채점 기준 항목',
              addLabel: '항목 추가',
              generating: generatingEval,
              generateDisabled: evalItems.filter(i => i.item_type !== 'formula').length === 0,
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
            }}
            items={{
              title: '기록 기준 항목',
              addLabel: '항목 추가',
              generating: generatingComments,
              generateDisabled: commentsItems.length === 0,
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
                    onResultChange={(value) => updateCommentsItem(idx, 'prompt', value)}
                    onRemove={() => removeCommentsItem(idx)}
                  />
                );
              }),
            }}
          />
        </Section>
      )}

      {!selectedDomain && activeTab === 'comments' && (
        <Section>
          <DomainSubjectCommentsPanel
            items={commentsItems}
            onMetaPromptChange={updateSubjectCommentsMetaPrompt}
            onPromptChange={updateSubjectComments}
            onGenerate={handleGenerateCommon}
          />
        </Section>
      )}
      </div>
    </div>
  );
}
