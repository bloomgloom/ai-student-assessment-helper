import { useState, useEffect, useCallback, useRef } from 'react';
import { criteriaApi } from '../lib/api';
import {
  Plus, Trash2, Save, ChevronDown, ChevronRight, GripVertical,
  BookOpen, ClipboardCheck, Folder, School, Upload, Loader2, AlertCircle,
  Award
} from 'lucide-react';

interface SubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  class_id: number;
  fixedDomains: { name: string; max_score: number; sort_order: number }[];
  customDomains: { id: number; name: string }[];
}

interface SetechItem {
  id?: number;
  type: string;
  title: string;
  prompt: string;
  extensions: string;
  sort_order: number;
}

interface EvalItem {
  id?: number;
  name: string;
  excel_col: string;
  item_type: 'llm' | 'formula';
  rubric: string;
  sort_order: number;
}

interface StandardRef {
  domain_name_ref: string;
  code: string;
  content: string;
  level: string;
}


interface TreeNode {
  label: string;
  children?: TreeNode[];
  subject?: SubjectItem;
  domainName?: string;
  isCustom?: boolean;
}

function buildTree(subjects: SubjectItem[]): TreeNode[] {
  const yearMap = new Map<number, Map<number, Map<number, SubjectItem[]>>>();

  for (const sub of subjects) {
    if (!yearMap.has(sub.year)) yearMap.set(sub.year, new Map());
    const semMap = yearMap.get(sub.year)!;
    if (!semMap.has(sub.semester)) semMap.set(sub.semester, new Map());
    const gradeMap = semMap.get(sub.semester)!;
    if (!gradeMap.has(sub.grade)) gradeMap.set(sub.grade, []);
    gradeMap.get(sub.grade)!.push(sub);
  }

  const result: TreeNode[] = [];
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => b[0] - a[0])) {
    const yearNode: TreeNode = { label: `${year}학년도`, children: [] };
    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      const semNode: TreeNode = { label: `${semester}학기`, children: [] };
      for (const [grade, subjects] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        const gradeNode: TreeNode = { label: `${grade}학년`, children: [] };
        for (const sub of subjects.sort((a, b) => a.subject.localeCompare(b.subject))) {
          const subjectNode: TreeNode = { label: sub.subject, children: [], subject: sub };

          for (const fd of sub.fixedDomains) {
            subjectNode.children!.push({ label: fd.name, subject: sub, domainName: fd.name, isCustom: false });
          }
          for (const cd of sub.customDomains) {
            subjectNode.children!.push({ label: cd.name, subject: sub, domainName: cd.name, isCustom: true });
          }
          gradeNode.children!.push(subjectNode);
        }
        semNode.children!.push(gradeNode);
      }
      yearNode.children!.push(semNode);
    }
    result.push(yearNode);
  }
  return result;
}

function TreeNodeView({
  node, depth, selectedDomainKey, selectedSubjectKey, onSelectDomain, onSelectSubject, onAddCustomDomain, onDeleteCustomDomain
}: {
  node: TreeNode;
  depth: number;
  selectedDomainKey: string | null;
  selectedSubjectKey: string | null;
  onSelectDomain: (sub: SubjectItem, domain: string, isCustom: boolean) => void;
  onSelectSubject: (sub: SubjectItem) => void;
  onAddCustomDomain: (sub: SubjectItem) => void;
  onDeleteCustomDomain: (sub: SubjectItem, domain: string) => void;
}) {
  const isLeaf = !!node.domainName;
  const isSubject = !!node.subject && !node.domainName;
  const [open, setOpen] = useState(true);
  const pl = `${8 + depth * 14}px`;

  if (isLeaf) {
    const key = `${node.subject!.year}-${node.subject!.semester}-${node.subject!.grade}-${node.subject!.subject}-${node.domainName}`;
    const isSelected = selectedDomainKey === key;
    return (
      <div
        className={`group flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer rounded text-sm transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'
          }`}
        style={{ paddingLeft: pl }}
        onClick={() => onSelectDomain(node.subject!, node.domainName!, node.isCustom!)}
      >
        {node.isCustom ? (
          <BookOpen size={13} className="shrink-0 text-purple-500" />
        ) : (
          <ClipboardCheck size={13} className="shrink-0 text-green-500" />
        )}
        <span className="flex-1 truncate">{node.label}</span>
        {node.isCustom && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400"
            onClick={(e) => { e.stopPropagation(); onDeleteCustomDomain(node.subject!, node.domainName!); }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );
  }

  const subjKey = isSubject ? `${node.subject!.year}-${node.subject!.semester}-${node.subject!.grade}-${node.subject!.subject}` : null;
  const isSubjectSelected = isSubject && selectedSubjectKey === subjKey && !selectedDomainKey;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 pr-2 cursor-pointer hover:bg-gray-50 rounded text-sm text-gray-600 font-medium ${isSubjectSelected ? 'bg-blue-100 text-blue-800' : isSubject ? 'text-blue-800' : ''}`}
        style={{ paddingLeft: pl }}
        onClick={() => {
          if (isSubject) onSelectSubject(node.subject!);
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="p-0.5 hover:bg-gray-200 rounded text-gray-500"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        {isSubject && <Folder size={13} className="text-blue-400 mr-0.5" />}
        <span className="flex-1">{node.label}</span>
        {isSubject && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 rounded text-blue-500"
            onClick={(e) => { e.stopPropagation(); setOpen(true); onAddCustomDomain(node.subject!); }}
            title="임의 영역 추가"
          >
            <Plus size={13} />
          </button>
        )}
      </div>
      {open && node.children?.map((child, i) => (
        <TreeNodeView
          key={i} node={child} depth={depth + 1}
          selectedDomainKey={selectedDomainKey}
          selectedSubjectKey={selectedSubjectKey}
          onSelectDomain={onSelectDomain}
          onSelectSubject={onSelectSubject}
          onAddCustomDomain={onAddCustomDomain}
          onDeleteCustomDomain={onDeleteCustomDomain}
        />
      ))}
    </div>
  );
}

export default function DomainPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);

  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [isCustomDomain, setIsCustomDomain] = useState<boolean>(false);

  const [setechItems, setSetechItems] = useState<SetechItem[]>([]);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);

  const [allSubjectDomains, setAllSubjectDomains] = useState<any[]>([]);
  const [standardRefs, setStandardRefs] = useState<StandardRef[]>([]);
  const [achievementStandards, setAchievementStandards] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingDomains, setUploadingDomains] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const domainsFileRef = useRef<HTMLInputElement>(null);

  const loadSubjects = useCallback(async () => {
    const r = await criteriaApi.getSubjects();
    setSubjects(r.data);
  }, []);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  useEffect(() => {
    setTree(buildTree(subjects));
  }, [subjects]);

  const loadCriteria = useCallback(async (sub: SubjectItem, domainName: string, isCustom: boolean) => {
    const sr = await criteriaApi.getSetech(sub.year, sub.semester, sub.grade, sub.subject, domainName);
    const allItems = sr.data as SetechItem[];

    // '성취기준' 타입은 standardRefs로 분리
    const refs: StandardRef[] = allItems
      .filter(i => i.type === '성취기준')
      .map(i => { try { return JSON.parse(i.extensions || '{}'); } catch { return { domain_name_ref: '', code: '', content: '', level: '' }; } });
    setStandardRefs(refs);
    setSetechItems(allItems.filter(i => i.type !== '성취기준'));

    // 성취기준 관리 데이터 로드 (커스텀 영역 아닐 때)
    if (!isCustom) {
      try {
        const stdRes = await criteriaApi.getStandards(sub.year, sub.semester, sub.grade, sub.subject);
        setAchievementStandards(stdRes.data);
      } catch { setAchievementStandards([]); }
    } else {
      setAchievementStandards([]);
    }

    if (!isCustom && domainName !== '__SUBJECT_COMPREHENSIVE__') {
      const er = await criteriaApi.getEval(sub.year, sub.semester, sub.grade, sub.subject, domainName);
      let loaded = er.data as EvalItem[];
      loaded.sort((a, b) => a.sort_order - b.sort_order);
      if (!loaded.find(i => i.item_type === 'formula')) {
        loaded.unshift({ name: '합계', excel_col: '0', item_type: 'formula', rubric: '', sort_order: -1 });
      }
      setEvalItems(loaded);
    } else {
      setEvalItems([]);
    }
  }, []);

  const handleSelectDomain = (sub: SubjectItem, domain: string, isCustom: boolean) => {
    setSelectedSubject(sub);
    setSelectedDomain(domain);
    setIsCustomDomain(isCustom);
    setAllSubjectDomains([]);
    loadCriteria(sub, domain, isCustom);
  };

  const handleSelectSubject = async (sub: SubjectItem) => {
    setSelectedSubject(sub);
    setSelectedDomain(null);
    setIsCustomDomain(true); // Treat subject level as custom so eval panel is hidden
    loadCriteria(sub, '__SUBJECT_COMPREHENSIVE__', true);
    const dr = await criteriaApi.getDomains(sub.year, sub.semester, sub.grade, sub.subject);
    setAllSubjectDomains(dr.data);
  };

  const handleAddCustomDomain = async (sub: SubjectItem) => {
    const name = prompt(`${sub.subject} 과목에 추가할 세특 전용 임의 영역 이름을 입력하세요:`);
    if (!name || !name.trim()) return;
    try {
      await criteriaApi.addCustomDomain({
        year: sub.year, semester: sub.semester, grade: sub.grade, subject: sub.subject, name: name.trim()
      });
      await loadSubjects();
    } catch (e: any) {
      alert('추가 실패: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteCustomDomain = async (sub: SubjectItem, domain: string) => {
    if (!confirm(`'${domain}' 임의 영역을 삭제하시겠습니까? 관련된 세특 기준도 모두 삭제됩니다.`)) return;
    const cd = sub.customDomains.find(d => d.name === domain);
    if (!cd) return;
    await criteriaApi.deleteCustomDomain(cd.id);
    if (selectedSubject?.subject === sub.subject && selectedDomain === domain) {
      setSelectedDomain(null);
    }
    await loadSubjects();
  };

  const handleSave = async () => {
    if (!selectedSubject) return;
    const domainToSave = selectedDomain || '__SUBJECT_COMPREHENSIVE__';
    setSaving(true);
    try {
      // standardRefs를 '성취기준' 타입 아이템으로 변환 후 앞에 붙임
      const refItems: SetechItem[] = standardRefs.map((r, i) => ({
        type: '성취기준',
        title: r.code,
        prompt: '',
        extensions: JSON.stringify(r),
        sort_order: i,
      }));
      const sItems = [
        ...refItems,
        ...setechItems.map((item, i) => ({ ...item, sort_order: refItems.length + i })),
      ];
      await criteriaApi.bulkSaveSetech(selectedSubject.year, selectedSubject.semester, selectedSubject.grade, selectedSubject.subject, domainToSave, sItems);

      if (selectedDomain && !isCustomDomain) {
        const eItems = evalItems.map((item, j) => ({ ...item, sort_order: item.item_type === 'formula' ? -1 : j }));
        await criteriaApi.bulkSaveEval(selectedSubject.year, selectedSubject.semester, selectedSubject.grade, selectedSubject.subject, selectedDomain, eItems);
      }
      alert('저장되었습니다.');
    } catch (e) {
      alert('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDomainsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDomains(true);
    setUploadMessage(null);
    setUploadError(null);
    try {
      const res = await criteriaApi.uploadDomains(file);
      const data = res.data;
      setUploadMessage(`${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 영역 ${data.totalCount}개 업로드, 수행 반영 영역 ${data.reflectedPerformanceCount}개`);
      await loadSubjects();
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || String(err));
    } finally {
      setUploadingDomains(false);
      if (domainsFileRef.current) domainsFileRef.current.value = '';
    }
  };

  const selectedDomainKey = selectedSubject && selectedDomain
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}-${selectedDomain}`
    : null;

  const selectedSubjectKey = selectedSubject
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}`
    : null;

  const updateSetechItem = (idx: number, field: keyof SetechItem, value: string) => setSetechItems(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  const removeSetechItem = (idx: number) => setSetechItems(p => p.filter((_, i) => i !== idx));

  const addDomainSetechItem = () => setSetechItems(p => [...p, { type: '항목', title: '', prompt: '', extensions: '', sort_order: p.length }]);

  // 성취기준 참조 헬퍼
  const addStandardRef = () => setStandardRefs(p => [...p, { domain_name_ref: '', code: '', content: '', level: '' }]);
  const removeStandardRef = (idx: number) => setStandardRefs(p => p.filter((_, i) => i !== idx));
  const updateStandardRefDomain = (idx: number, domain: string) =>
    setStandardRefs(p => p.map((r, i) => i === idx ? { ...r, domain_name_ref: domain, code: '', content: '', level: '' } : r));
  const updateStandardRefCode = (idx: number, code: string) => {
    const std = achievementStandards.find(s => s.code === code);
    setStandardRefs(p => p.map((r, i) => i === idx ? { ...r, code, content: std?.content || '', level: std?.level || '' } : r));
  };

  // 성취기준 데이터 보조
  const uniqueStandardDomains = [...new Set(achievementStandards.map(s => s.domain_name))];
  const uniqueCodesForDomain = (domain: string) => {
    const seen = new Set<string>();
    return achievementStandards.filter(s => s.domain_name === domain && !seen.has(s.code) && seen.add(s.code));
  };
  const updateSubjectSetech = (type: string, prompt: string) => {
    setSetechItems(prev => {
      if (prev.find(i => i.type === type)) {
        return prev.map(i => i.type === type ? { ...i, prompt } : i);
      }
      return [...prev, { type, title: type === '공통' ? '세특 공통 기준' : '종합 세특 기준', prompt, extensions: '', sort_order: type === '공통' ? 0 : 1 }];
    });
  };

  const addEvalItem = () => setEvalItems(p => [...p, { name: '', excel_col: '2', item_type: 'llm', rubric: '', sort_order: p.length }]);
  const updateEvalItem = (idx: number, field: keyof EvalItem, value: string) => setEvalItems(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  const removeEvalItem = (idx: number) => setEvalItems(p => p.filter((_, i) => i !== idx && p[i].item_type !== 'formula'));

  // 계산 로직
  const calculateTotal = () => {
    let total = 0;
    let base = 0;
    evalItems.forEach(item => {
      if (item.item_type === 'formula') {
        base = Number(item.excel_col) || 0;
      } else if (item.item_type === 'llm') {
        total += Number(item.excel_col) || 0;
      }
    });
    return total + base;
  };

  const currentMaxScore = selectedSubject?.fixedDomains.find(d => d.name === selectedDomain)?.max_score || 0;
  const calculatedScore = calculateTotal();
  const isScoreMismatch = !isCustomDomain && currentMaxScore > 0 && calculatedScore !== currentMaxScore;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 좌측: 트리 */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">영역 관리</h2>
          <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${uploadingDomains ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
            {uploadingDomains ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadingDomains ? '처리 중...' : '영역 관리 파일 업로드'}
            <input
              ref={domainsFileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleDomainsUpload}
              disabled={uploadingDomains}
            />
          </label>
          {uploadMessage && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 leading-snug">{uploadMessage}</p>}
          {uploadError && (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <p className="whitespace-pre-wrap leading-snug">{uploadError}</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <School size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">영역 관리 파일을 업로드하면<br />과목과 수행평가 영역이 표시됩니다</p>
            </div>
          ) : (
            tree.map((node, i) => (
              <TreeNodeView
                key={i} node={node} depth={0}
                selectedDomainKey={selectedDomainKey}
                selectedSubjectKey={selectedSubjectKey}
                onSelectDomain={handleSelectDomain}
                onSelectSubject={handleSelectSubject}
                onAddCustomDomain={handleAddCustomDomain}
                onDeleteCustomDomain={handleDeleteCustomDomain}
              />
            ))
          )}
        </div>
      </div>

      {/* 우측: 편집 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSubject ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <ClipboardCheck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">왼쪽 트리에서 영역이나 과목명을 선택하세요</p>
              <p className="text-xs mt-2">과목을 선택하면 종합 세특 기준을, 영역을 선택하면 해당 영역의 기준을 설정합니다.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">
                  {selectedSubject?.year}학년도 {selectedSubject?.semester}학기 {selectedSubject?.grade}학년 &gt; {selectedSubject?.subject}
                </div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  {selectedDomain ? selectedDomain : '종합 세특 기준 (과목 공통)'}
                  {isCustomDomain && selectedDomain && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">임의 영역</span>}
                </h2>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-sm px-4" onClick={handleSave} disabled={saving}>
                  <Save size={14} /> {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">

              {/* 성취/평가기준 설정 (고정 영역, 도메인 선택 시) */}
              {!isCustomDomain && selectedDomain && (
                <section>
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Award size={16} className="text-amber-500" />
                      성취/평가기준 설정
                    </h3>
                    <button className="btn-secondary text-xs px-2 py-1" onClick={addStandardRef}>
                      <Plus size={12} /> 기준 추가
                    </button>
                  </div>
                  {achievementStandards.length === 0 && (
                    <p className="text-xs text-gray-400 mb-2 text-center py-2 bg-gray-50 rounded border border-dashed border-gray-200">
                      기준 관리에 성취기준을 먼저 업로드하세요.
                    </p>
                  )}
                  <div className="space-y-2">
                    {standardRefs.length === 0 && achievementStandards.length > 0 && (
                      <p className="text-center py-4 text-gray-400 text-sm">참조할 성취기준을 추가하세요.</p>
                    )}
                    {standardRefs.map((ref, idx) => {
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
                    })}
                  </div>
                </section>
              )}

              {/* 채점 항목 설정 (고정 영역일 때만 표시) */}
              {!isCustomDomain && (
                <section>
                  <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <ClipboardCheck size={16} className="text-green-500" />
                      채점 기준 설정
                    </h3>
                    <button className="btn-secondary text-xs px-2 py-1" onClick={addEvalItem}>
                      <Plus size={12} /> 채점 항목 추가
                    </button>
                  </div>
                  <div className="space-y-3">
                    {evalItems.length === 0 && (
                      <p className="text-center py-6 text-gray-400 text-sm">이 영역의 채점 기준을 추가하세요.</p>
                    )}
                    {evalItems.map((item, idx) => {
                      if (item.item_type === 'formula') {
                        return (
                          <div key={idx} className={`border rounded-lg p-4 shadow-sm flex gap-3 items-center ${isScoreMismatch ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
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
                                value={item.excel_col}
                                onChange={e => updateEvalItem(idx, 'excel_col', e.target.value)}
                              />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex gap-3 items-start">
                          <div className="flex-1 space-y-3">
                            <div className="flex gap-4 items-center">
                              <input
                                className="input flex-1 text-sm font-medium"
                                placeholder="채점 항목명 (예: 코드 완성도)"
                                value={item.name}
                                onChange={(e) => updateEvalItem(idx, 'name', e.target.value)}
                              />
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm text-gray-600">배점:</span>
                                <input
                                  className="input w-16 text-sm text-center"
                                  type="number"
                                  placeholder="2"
                                  value={item.excel_col}
                                  onChange={(e) => updateEvalItem(idx, 'excel_col', e.target.value)}
                                />
                              </div>
                            </div>
                            <textarea
                              className="textarea w-full text-sm leading-relaxed"
                              rows={3}
                              placeholder="루브릭 (채점 기준) (예: A(10점): 코드가 완벽히 동작하고 예외 처리가 됨, B(8점): ...)"
                              value={item.rubric}
                              onChange={(e) => updateEvalItem(idx, 'rubric', e.target.value)}
                            />
                          </div>
                          <button
                            className="p-1.5 hover:bg-red-50 text-red-400 rounded mt-1 transition-colors shrink-0"
                            onClick={() => removeEvalItem(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 세특 항목 설정 */}
              <section>
                <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <BookOpen size={16} className={isCustomDomain ? 'text-purple-500' : 'text-blue-500'} />
                    세특 기준 설정
                  </h3>
                  {selectedDomain && (
                    <button className="btn-secondary text-xs px-2 py-1" onClick={addDomainSetechItem}>
                      <Plus size={12} /> 항목 추가
                    </button>
                  )}
                </div>

                {selectedDomain ? (
                  // 도메인 레벨 세특 설정
                  <div className="space-y-3">
                    {setechItems.length === 0 && (
                      <p className="text-center py-6 text-gray-400 text-sm">이 영역의 세특 항목을 추가하세요.</p>
                    )}
                    {setechItems.map((item, idx) => {
                      return (
                        <div key={idx} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                          <div className="flex items-center gap-3 mb-3">
                            <GripVertical size={16} className="text-gray-300 cursor-grab" />
                            <input
                              className="input flex-1 text-sm font-medium"
                              placeholder="항목 이름 (예: 자료수집 및 분석)"
                              value={item.title}
                              onChange={(e) => updateSetechItem(idx, 'title', e.target.value)}
                            />
                            <button
                              className="p-1.5 hover:bg-red-50 text-red-400 rounded transition-colors"
                              onClick={() => removeSetechItem(idx)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <textarea
                            className="textarea w-full text-sm leading-relaxed"
                            rows={4}
                            placeholder="이 항목의 기록 작성 기준을 입력하세요. (예: 학생이 제출한 산출물을 분석하여 성취수준을 평가하고...)"
                            value={item.prompt}
                            onChange={(e) => updateSetechItem(idx, 'prompt', e.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // 과목 레벨 (종합 세특) 설정
                  <div className="space-y-6">
                    {/* 파싱된 영역 정보 테이블 */}
                    {allSubjectDomains.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <span className="text-xs font-semibold text-gray-600">파일에서 파싱된 영역 정보</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50/50">
                            <tr className="border-b border-gray-100">
                              <th className="px-3 py-2 text-left font-medium text-gray-500">평가종류</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-500">영역명</th>
                              <th className="px-3 py-2 text-center font-medium text-gray-500">학기말반영</th>
                              <th className="px-3 py-2 text-center font-medium text-gray-500">반영비율</th>
                              <th className="px-3 py-2 text-center font-medium text-gray-500">만점</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // 평가종류 span 계산
                              const spans: number[] = allSubjectDomains.map(() => 0);
                              allSubjectDomains.forEach((d: any, i: number) => {
                                if (i === 0 || d.eval_type !== allSubjectDomains[i - 1].eval_type) {
                                  let count = 1;
                                  for (let j = i + 1; j < allSubjectDomains.length; j++) {
                                    if (allSubjectDomains[j].eval_type === d.eval_type) count++;
                                    else break;
                                  }
                                  spans[i] = count;
                                }
                              });
                              return allSubjectDomains.map((d: any, i: number) => (
                                <tr key={i} className={`border-b border-gray-100 last:border-0 ${d.reflected === 'O' ? '' : 'text-gray-400'}`}>
                                  {spans[i] > 0 && (
                                    <td rowSpan={spans[i]} className="px-3 py-2 border-r border-gray-100 align-middle text-center font-medium text-gray-600">
                                      {d.eval_type}
                                    </td>
                                  )}
                                  <td className="px-3 py-2 font-medium">{d.name}</td>
                                  <td className="px-3 py-2 text-center">
                                    {d.reflected === 'O'
                                      ? <span className="text-green-600 font-semibold">O</span>
                                      : <span className="text-gray-300">-</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">{d.ratio != null ? `${d.ratio}%` : '-'}</td>
                                  <td className="px-3 py-2 text-center">{d.max_score != null ? `${d.max_score}점` : '-'}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 세특 공통/종합 기준 */}
                    <div className="space-y-4">
                      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                        <div className="mb-2 font-medium text-gray-700 text-sm">세특 공통 기준</div>
                        <p className="text-xs text-gray-500 mb-3">모든 영역별 세특 및 종합 세특을 작성할 때 AI에게 공통으로 지시할 프롬프트를 입력하세요.</p>
                        <textarea
                          className="textarea w-full text-sm leading-relaxed"
                          rows={5}
                          placeholder="공통 지시사항을 입력하세요. (예: 학생의 긍정적인 면을 부각하고, ~이다. 체로 작성할 것 등)"
                          value={setechItems.find(i => i.type === '공통')?.prompt || ''}
                          onChange={(e) => updateSubjectSetech('공통', e.target.value)}
                        />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                        <div className="mb-2 font-medium text-gray-700 text-sm">종합 세특 기준</div>
                        <p className="text-xs text-gray-500 mb-3">각 영역별 수행 내용(학생 산출물 및 채점 결과)을 모두 종합하여 최종 학기말 세특을 작성할 때 사용할 프롬프트를 입력하세요.</p>
                        <textarea
                          className="textarea w-full text-sm leading-relaxed"
                          rows={6}
                          placeholder="종합 세특 지시사항을 입력하세요. (예: 전체 영역의 성취도를 바탕으로 학생의 전반적인 교과 역량을 1500바이트 내외로 종합하여 작성하라...)"
                          value={setechItems.find(i => i.type === '종합')?.prompt || ''}
                          onChange={(e) => updateSubjectSetech('종합', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
