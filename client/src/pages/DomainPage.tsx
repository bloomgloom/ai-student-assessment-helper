import { useState, useEffect, useCallback, useRef } from 'react';
import { criteriaApi, aiApi } from '../lib/api';
import { useAiOverlayStore } from '../stores/aiOverlayStore';
import {
  Plus, Trash2, Save, ChevronDown, ChevronRight, GripVertical,
  BookOpen, ClipboardCheck, Folder, School, Upload, Loader2, AlertCircle,
  Award, Download, X
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
  score: string;
  item_type: 'llm' | 'formula';
  rubric: string;
  sort_order: number;
}

interface StandardRef {
  domain_name_ref: string;
  code: string;
  content: string;
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
  node, depth, selectedDomainKey, selectedSubjectKey, onSelectDomain, onSelectSubject, onAddCustomDomain, onDeleteCustomDomain,
  onDownloadSubject, onDeleteSubject
}: {
  node: TreeNode;
  depth: number;
  selectedDomainKey: string | null;
  selectedSubjectKey: string | null;
  onSelectDomain: (sub: SubjectItem, domain: string, isCustom: boolean) => void;
  onSelectSubject: (sub: SubjectItem) => void;
  onAddCustomDomain: (sub: SubjectItem) => void;
  onDeleteCustomDomain: (sub: SubjectItem, domain: string) => void;
  onDownloadSubject: (sub: SubjectItem) => void;
  onDeleteSubject: (sub: SubjectItem) => void;
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
          <>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 rounded text-blue-500"
              onClick={(e) => { e.stopPropagation(); setOpen(true); onAddCustomDomain(node.subject!); }}
              title="임의 영역 추가"
            >
              <Plus size={13} />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 rounded text-blue-500"
              onClick={(e) => { e.stopPropagation(); onDownloadSubject(node.subject!); }}
              title="원본 파일 다운로드"
            >
              <Download size={13} />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400"
              onClick={(e) => { e.stopPropagation(); onDeleteSubject(node.subject!); }}
              title="삭제"
            >
              <Trash2 size={13} />
            </button>
          </>
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
          onDownloadSubject={onDownloadSubject}
          onDeleteSubject={onDeleteSubject}
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
  const [uploadingConfig, setUploadingConfig] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('hideDomainGuide') !== '1');
  const domainsFileRef = useRef<HTMLInputElement>(null);
  const configFileRef = useRef<HTMLInputElement>(null);

  const [evalMetaPrompts, setEvalMetaPrompts] = useState<Record<number, string>>({});
  const [setechMetaPrompts, setSetechMetaPrompts] = useState<Record<number, string>>({});
  const [evalChecked, setEvalChecked] = useState<Set<number>>(new Set());
  const [setechChecked, setSetechChecked] = useState<Set<number>>(new Set());
  const [standardsMetaPrompt, setStandardsMetaPrompt] = useState<string>('');
  const [subjectCommonPrompt, setSubjectCommonPrompt] = useState<string>('');
  const [generatingStandards, setGeneratingStandards] = useState(false);
  const [generatingEval, setGeneratingEval] = useState(false);
  const [generatingSetech, setGeneratingSetech] = useState(false);
  const [activeTab, setActiveTab] = useState<'standards' | 'scoring' | 'activity'>('standards');
  const [isDirty, setIsDirty] = useState(false);
  const overlayStore = useAiOverlayStore();
  const domainRestoredRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const loadSubjects = useCallback(async () => {
    const r = await criteriaApi.getSubjects();
    setSubjects(r.data);
  }, []);

  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  useEffect(() => {
    setTree(buildTree(subjects));
  }, [subjects]);

  const loadCriteria = useCallback(async (sub: SubjectItem, domainName: string, isCustom: boolean) => {
    setIsDirty(false);
    const sr = await criteriaApi.getSetech(sub.year, sub.semester, sub.grade, sub.subject, domainName);
    const allItems = sr.data as SetechItem[];

    // '성취기준' 타입은 standardRefs로 분리, '활동공통' 타입은 공통 기준으로 분리
    const refs: StandardRef[] = allItems
      .filter(i => i.type === '성취기준')
      .map(i => { try { return JSON.parse(i.extensions || '{}'); } catch { return { domain_name_ref: '', code: '', content: '' }; } });
    setStandardRefs(refs);
    setSetechItems(allItems.filter(i => i.type !== '성취기준' && i.type !== '활동공통'));

    // 성취기준 관리 데이터 로드 (영역 세특은 고정/세특 전용 모두 성취기준을 참조)
    if (domainName !== '__SUBJECT_COMPREHENSIVE__') {
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
        loaded.unshift({ name: '합계', score: '0', item_type: 'formula', rubric: '', sort_order: -1 });
      }
      setEvalItems(loaded);

      // 과목 공통 세특 기준 로드 (AI 생성 context용)
      try {
        const subjRes = await criteriaApi.getSetech(sub.year, sub.semester, sub.grade, sub.subject, '__SUBJECT_COMPREHENSIVE__');
        const commonItem = (subjRes.data as SetechItem[]).find(i => i.type === '공통');
        setSubjectCommonPrompt(commonItem?.prompt || '');
      } catch { setSubjectCommonPrompt(''); }
    } else {
      setEvalItems([]);
      setSubjectCommonPrompt('');
    }
  }, []);

  const handleSelectDomain = useCallback((sub: SubjectItem, domain: string, isCustom: boolean) => {
    if (isDirty && !confirm('저장되지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) return;
    setSelectedSubject(sub);
    setSelectedDomain(domain);
    setIsCustomDomain(isCustom);
    setAllSubjectDomains([]);
    setEvalMetaPrompts({});
    setSetechMetaPrompts({});
    setEvalChecked(new Set());
    setSetechChecked(new Set());
    setActiveTab('standards');
    loadCriteria(sub, domain, isCustom);
    localStorage.setItem('domainPage_lastSelection', JSON.stringify({ classId: sub.class_id, domain }));
  }, [isDirty, loadCriteria]);

  const handleSelectSubject = useCallback(async (sub: SubjectItem) => {
    if (isDirty && !confirm('저장되지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) return;
    setSelectedSubject(sub);
    setSelectedDomain(null);
    setIsCustomDomain(true);
    setSetechMetaPrompts({});
    setSetechChecked(new Set());
    setActiveTab('activity');
    loadCriteria(sub, '__SUBJECT_COMPREHENSIVE__', true);
    const dr = await criteriaApi.getDomains(sub.year, sub.semester, sub.grade, sub.subject);
    setAllSubjectDomains(dr.data);
    localStorage.setItem('domainPage_lastSelection', JSON.stringify({ classId: sub.class_id, domain: null }));
  }, [isDirty, loadCriteria]);

  // 마지막 선택 복원
  useEffect(() => {
    if (domainRestoredRef.current || subjects.length === 0) return;
    domainRestoredRef.current = true;
    const saved = localStorage.getItem('domainPage_lastSelection');
    if (!saved) return;
    try {
      const { classId, domain } = JSON.parse(saved);
      const sub = subjects.find(s => s.class_id === classId);
      if (!sub) return;
      if (domain) {
        const isCustom = sub.customDomains.some((d: any) => d.name === domain);
        handleSelectDomain(sub, domain, isCustom);
      } else {
        handleSelectSubject(sub);
      }
    } catch { /* ignore */ }
  }, [subjects, handleSelectDomain, handleSelectSubject]);

  const handleAddCustomDomain = async (sub: SubjectItem) => {
    const name = prompt(`${sub.subject} 과목에 추가할 세특 전용 임의 영역 이름을 입력하세요:`);
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    try {
      const res = await criteriaApi.addCustomDomain({
        year: sub.year, semester: sub.semester, grade: sub.grade, subject: sub.subject, name: trimmedName
      });
      await loadSubjects();
      const nextSub = {
        ...sub,
        customDomains: [...sub.customDomains, { id: res.data.id, name: trimmedName }],
      };
      handleSelectDomain(nextSub, trimmedName, true);
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

  const handleSave = async (): Promise<boolean> => {
    if (!selectedSubject) return false;
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
      setIsDirty(false);
      return true;
    } catch (e) {
      alert('저장 실패');
      return false;
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

  const hideGuide = () => {
    localStorage.setItem('hideDomainGuide', '1');
    setShowGuide(false);
  };

  const handleDownloadSubjectFile = (sub: SubjectItem) => {
    window.location.href = criteriaApi.sourceUrl('domains', sub.year, sub.semester, sub.grade, sub.subject);
  };

  const getDownloadFilename = (disposition: string, fallback: string) => {
    const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    return utf8Match ? decodeURIComponent(utf8Match[1]) : plainMatch ? plainMatch[1] : fallback;
  };

  const handleDownloadConfig = async () => {
    if (!selectedSubject) return;
    const domainName = selectedDomain || '__SUBJECT_COMPREHENSIVE__';
    try {
      const r = await criteriaApi.exportDomainConfig(
        selectedSubject.year,
        selectedSubject.semester,
        selectedSubject.grade,
        selectedSubject.subject,
        domainName
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = getDownloadFilename(
        r.headers['content-disposition'] || '',
        `${selectedSubject.year}_${selectedSubject.subject}_${selectedDomain || '종합세특'}_기준.xlsx`
      );
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('기준 다운로드 실패');
    }
  };

  const handleUploadConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedSubject || !e.target.files?.length) return;
    const file = e.target.files[0];
    const domainName = selectedDomain || '__SUBJECT_COMPREHENSIVE__';
    if (!confirm('현재 화면의 기준을 업로드한 엑셀 내용으로 덮어씁니다. 계속하시겠습니까?')) {
      e.target.value = '';
      return;
    }
    setUploadingConfig(true);
    try {
      const r = await criteriaApi.importDomainConfig(
        selectedSubject.year,
        selectedSubject.semester,
        selectedSubject.grade,
        selectedSubject.subject,
        domainName,
        file
      );
      await loadCriteria(selectedSubject, domainName, isCustomDomain || !selectedDomain);
      alert(`업로드 완료: 성취 기준 ${r.data.standards}개, 채점 기준 ${r.data.eval}개, 기록 기준 ${r.data.setech}개`);
    } catch (err: any) {
      alert(`기준 업로드 실패: ${err?.response?.data?.error || err.message || String(err)}`);
    } finally {
      setUploadingConfig(false);
      if (configFileRef.current) configFileRef.current.value = '';
    }
  };

  const handleDeleteSubjectFile = async (sub: SubjectItem) => {
    if (!confirm(`${sub.subject} 영역 관리 파일과 데이터를 삭제하시겠습니까?`)) return;
    await criteriaApi.deleteSource('domains', sub.year, sub.semester, sub.grade, sub.subject);
    setSelectedSubject(null);
    setSelectedDomain(null);
    await loadSubjects();
  };

  const selectedDomainKey = selectedSubject && selectedDomain
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}-${selectedDomain}`
    : null;

  const selectedSubjectKey = selectedSubject
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}`
    : null;

  const updateSetechItem = (idx: number, field: keyof SetechItem, value: string) => {
    setSetechItems(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    setIsDirty(true);
  };
  const removeSetechItem = (idx: number) => {
    setSetechItems(p => p.filter((_, i) => i !== idx));
    setIsDirty(true);
  };

  const addDomainSetechItem = () => {
    setSetechItems(p => [...p, { type: '항목', title: '', prompt: '', extensions: '', sort_order: p.length }]);
    setIsDirty(true);
  };

  // 성취기준 참조 헬퍼
  const addStandardRef = () => {
    setStandardRefs(p => [...p, { domain_name_ref: '', code: '', content: '' }]);
    setIsDirty(true);
  };
  const removeStandardRef = (idx: number) => {
    setStandardRefs(p => p.filter((_, i) => i !== idx));
    setIsDirty(true);
  };
  const updateStandardRefDomain = (idx: number, domain: string) => {
    setStandardRefs(p => p.map((r, i) => i === idx ? { ...r, domain_name_ref: domain, code: '', content: '', level: '' } : r));
    setIsDirty(true);
  };
  const updateStandardRefCode = (idx: number, code: string) => {
    // 항상 A 레벨 행을 우선 참조
    const candidates = achievementStandards.filter(s => s.code === code);
    const std = candidates.find(s => s.level === 'A') ?? candidates[0];
    setStandardRefs(p => p.map((r, i) => i === idx ? { ...r, code, content: std?.content || '' } : r));
    setIsDirty(true);
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
    setIsDirty(true);
  };

  const addEvalItem = () => {
    setEvalItems(p => [...p, { name: '', score: '2', item_type: 'llm', rubric: '', sort_order: p.length }]);
    setIsDirty(true);
  };
  const updateEvalItem = (idx: number, field: keyof EvalItem, value: string) => {
    setEvalItems(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    setIsDirty(true);
  };
  const removeEvalItem = (idx: number) => {
    setEvalItems(p => p.filter((_, i) => i !== idx && p[i].item_type !== 'formula'));
    setIsDirty(true);
  };

  const handleGenerateStandards = async () => {
    if (achievementStandards.length === 0) return alert('성취기준을 먼저 업로드하세요.');
    const controller = overlayStore.start('성취 기준 선택 중');
    setGeneratingStandards(true);
    try {
      // 코드 기준으로 중복 제거
      const uniqueStandards: any[] = Array.from(
        new Map(achievementStandards.map((s: any) => [s.code, s])).values()
      );
      const stdList = uniqueStandards.map((s: any) =>
        `{"code":"${s.code}","domain":"${s.domain_name}","content":${JSON.stringify(s.content)}}`
      ).join('\n');
      const systemPrompt = `당신은 교육과정 성취기준 선택 AI입니다. 주어진 성취기준 목록에서 적합한 성취기준들을 선택하여 code 배열을 JSON으로 반환하세요. 반드시 아래 형식만 반환하세요: ["코드1","코드2",...]`;
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const extra = standardsMetaPrompt.trim() ? `\n추가 요청: ${standardsMetaPrompt.trim()}` : '\n위 과목과 영역에 가장 관련성 높은 성취기준을 2~4개 선택해주세요.';
      const prompt = `${base}${extra}\n\n사용 가능한 성취기준 목록:\n${stdList}`;
      const res = await aiApi.generatePrompt({ prompt, systemPrompt }, controller.signal);
      const codes: string[] = JSON.parse(res.data.result.replace(/```json/g, '').replace(/```/g, '').trim());
      const selected = uniqueStandards.filter((s: any) => codes.includes(s.code));
      if (selected.length === 0) return alert('선택된 성취기준이 없습니다. 다시 시도해보세요.');
      setStandardRefs(selected.map((s: any) => ({
        domain_name_ref: s.domain_name,
        code: s.code,
        content: s.content,
      })));
      setIsDirty(true);
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('생성 실패: 다시 시도해주세요.');
      }
    } finally {
      overlayStore.finish();
      setGeneratingStandards(false);
    }
  };

  const handleGenerateCommon = async (type: string, metaPrompt: string) => {
    const label = type === '공통' ? '세특 공통 기준' : '종합 세특 기준';
    const controller = overlayStore.start(`${label} 생성 중`);
    try {
      const systemPrompt = `당신은 ${label} 생성 AI입니다. 주어진 과목/조건에 맞게 AI 기록 작성 지시 프롬프트를 작성하세요. 부가적인 설명 없이 생성된 프롬프트 내용만 반환하세요.`;
      const base = `과목: ${selectedSubject?.subject}\n기준 유형: ${label}`;
      const extra = metaPrompt.trim() ? `\n추가 요청: ${metaPrompt.trim()}` : '';
      const res = await aiApi.generatePrompt({ prompt: base + extra, systemPrompt }, controller.signal);
      updateSubjectSetech(type, res.data.result.trim());
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('기준 생성에 실패했습니다.');
      }
    } finally {
      overlayStore.finish();
    }
  };

  // 성취 기준 컨텍스트 문자열 빌더
  const buildStandardsContext = () =>
    standardRefs.filter(r => r.content).map(r => `[${r.code}] ${r.content}`).join('\n');

  // 세특 공통 기준 + 채점 기준 컨텍스트 빌더
  const buildActivityContext = () => {
    const parts: string[] = [];
    if (subjectCommonPrompt.trim()) {
      parts.push(`세특 공통 기준:\n${subjectCommonPrompt.trim()}`);
    }
    const formulaRubric = evalItems.find(i => i.item_type === 'formula')?.rubric?.trim();
    const itemRubrics = evalItems
      .filter(i => i.item_type === 'llm' && (i.name || i.rubric))
      .map(i => `  - ${i.name}(${i.score}점)${i.rubric ? `: ${i.rubric}` : ''}`)
      .join('\n');
    if (formulaRubric || itemRubrics) {
      const scoringParts: string[] = [];
      if (formulaRubric) scoringParts.push(`  공통: ${formulaRubric}`);
      if (itemRubrics) scoringParts.push(itemRubrics);
      parts.push(`채점 기준:\n${scoringParts.join('\n')}`);
    }
    return parts.join('\n\n');
  };

  // 채점 항목 목록 AI 생성 (상단 버튼)
  const handleGenerateEvalItems = async () => {
    const controller = overlayStore.start('채점 항목 생성 중');
    setGeneratingEval(true);
    try {
      const formulaItem = evalItems.find(i => i.item_type === 'formula');
      const stdCtx = buildStandardsContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const maxScore = currentMaxScore > 0 ? `${currentMaxScore}점` : '미설정';
      const baseScore = formulaItem ? `${formulaItem.score}점` : '0점';
      const extra = evalMetaPrompts[-1]?.trim() ? `\n추가 요청: ${evalMetaPrompts[-1]}` : '';
      const systemPrompt = `당신은 채점 기준 생성 AI입니다. 과목·영역·성취기준을 참고하여 채점 항목 목록(이름, 배점, 루브릭)을 JSON 배열로 생성하세요. 배점 합계는 만점에서 기본점수를 뺀 값이어야 합니다. 반드시 아래 형식만 반환하세요: [{"name":"항목명","score":"배점","rubric":"루브릭 내용"}]`;
      const prompt = `${base}\n만점: ${maxScore}, 기본점수: ${baseScore}${stdPart}${extra}`;
      const res = await aiApi.generatePrompt({ prompt, systemPrompt }, controller.signal);
      const newItems = JSON.parse(res.data.result.replace(/```json/g, '').replace(/```/g, '').trim());
      setEvalItems(prev => {
        const fItems = prev.filter(i => i.item_type === 'formula');
        return [...fItems, ...newItems.map((item: any, j: number) => ({
          name: item.name || '',
          score: String(item.score ?? '2'),
          rubric: item.rubric || '',
          item_type: 'llm' as const,
          sort_order: j,
        }))];
      });
      setIsDirty(true);
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('생성 실패');
      }
    } finally {
      overlayStore.finish();
      setGeneratingEval(false);
    }
  };

  // 채점 항목 루브릭 AI 생성 (소제목 옆 버튼 - 선택/전체 항목)
  const handleGenerateEvalRubrics = async () => {
    const llmIndices = evalItems.map((_, i) => i).filter(i => evalItems[i].item_type !== 'formula');
    const targets = evalChecked.size > 0 ? llmIndices.filter(i => evalChecked.has(i)) : llmIndices;
    if (targets.length === 0) return;
    const targetLabel = evalChecked.size > 0 ? `선택한 ${evalChecked.size}개` : `전체 ${targets.length}개`;
    if (!confirm(`${targetLabel} 채점 루브릭을 AI로 생성하시겠습니까?`)) return;
    const controller = overlayStore.start('채점 루브릭 생성 중');
    overlayStore.setProgress(0, `0/${targets.length} 완료`);
    setGeneratingEval(true);
    try {
      const stdCtx = buildStandardsContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const systemPrompt = `당신은 채점 기준 생성 AI입니다. 과목·영역·성취기준·항목명·배점을 참고하여 채점 루브릭(기준 내용)을 생성하세요. 루브릭 내용만 반환하고 부가 설명은 하지 마세요.`;
      for (let i = 0; i < targets.length; i++) {
        if (controller.signal.aborted) break;
        const idx = targets[i];
        const item = evalItems[idx];
        const extra = evalMetaPrompts[idx]?.trim() ? `\n추가 요청: ${evalMetaPrompts[idx]}` : '';
        const prompt = `${base}\n항목명: ${item.name || '(미입력)'}\n배점: ${item.score || '?'}점${stdPart}${extra}`;
        const res = await aiApi.generatePrompt({ prompt, systemPrompt }, controller.signal);
        updateEvalItem(idx, 'rubric', res.data.result.trim());
        overlayStore.setProgress(((i + 1) / targets.length) * 100, `${i + 1}/${targets.length} 완료`);
      }
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('생성 실패');
      }
    } finally {
      overlayStore.finish();
      setGeneratingEval(false);
    }
  };

  // 활동 기록 항목 목록 AI 생성 (상단 버튼)
  const handleGenerateSetechItems = async () => {
    const controller = overlayStore.start('기록 기준 항목 생성 중');
    setGeneratingSetech(true);
    try {
      const stdCtx = buildStandardsContext();
      const actCtx = buildActivityContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const actPart = actCtx ? `\n\n${actCtx}` : '';
      const extra = setechMetaPrompts[-1]?.trim() ? `\n\n추가 요청: ${setechMetaPrompts[-1]}` : '';
      const systemPrompt = `당신은 기록 기준 생성 AI입니다. 과목·영역·성취기준·채점기준을 참고하여 활동 기록 항목 목록(제목, 기록 작성 지시사항)을 JSON 배열로 생성하세요. 반드시 아래 형식만 반환하세요: [{"title":"항목명","prompt":"기록 작성 지시사항"}]`;
      const prompt = `${base}${stdPart}${actPart}${extra}`;
      const res = await aiApi.generatePrompt({ prompt, systemPrompt }, controller.signal);
      const newItems = JSON.parse(res.data.result.replace(/```json/g, '').replace(/```/g, '').trim());
      setSetechItems(newItems.map((item: any, j: number) => ({
        title: item.title || '',
        prompt: item.prompt || '',
        type: '항목',
        extensions: '',
        sort_order: j,
      })));
      setIsDirty(true);
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('생성 실패');
      }
    } finally {
      overlayStore.finish();
      setGeneratingSetech(false);
    }
  };

  // 활동 기록 항목 기준 AI 생성 (소제목 옆 버튼 - 선택/전체 항목)
  const handleGenerateSetechCriteria = async () => {
    const targets = setechChecked.size > 0
      ? setechItems.map((_, i) => i).filter(i => setechChecked.has(i))
      : setechItems.map((_, i) => i);
    if (targets.length === 0) return;
    const targetLabel = setechChecked.size > 0 ? `선택한 ${setechChecked.size}개` : `전체 ${targets.length}개`;
    if (!confirm(`${targetLabel} 기록 작성 기준을 AI로 생성하시겠습니까?`)) return;
    const controller = overlayStore.start('기록 작성 기준 생성 중');
    overlayStore.setProgress(0, `0/${targets.length} 완료`);
    setGeneratingSetech(true);
    try {
      const stdCtx = buildStandardsContext();
      const actCtx = buildActivityContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const actPart = actCtx ? `\n\n${actCtx}` : '';
      const systemPrompt = `당신은 기록 기준 생성 AI입니다. 과목·영역·성취기준·채점기준·항목명을 참고하여 활동 기록 작성 지시사항을 생성하세요. 지시사항 내용만 반환하고 부가 설명은 하지 마세요.`;
      for (let i = 0; i < targets.length; i++) {
        if (controller.signal.aborted) break;
        const idx = targets[i];
        const item = setechItems[idx];
        const extra = setechMetaPrompts[idx]?.trim() ? `\n\n추가 요청: ${setechMetaPrompts[idx]}` : '';
        const prompt = `${base}\n항목명: ${item.title || '(미입력)'}${stdPart}${actPart}${extra}`;
        const res = await aiApi.generatePrompt({ prompt, systemPrompt }, controller.signal);
        updateSetechItem(idx, 'prompt', res.data.result.trim());
        overlayStore.setProgress(((i + 1) / targets.length) * 100, `${i + 1}/${targets.length} 완료`);
      }
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        alert('생성 실패');
      }
    } finally {
      overlayStore.finish();
      setGeneratingSetech(false);
    }
  };

  // 계산 로직
  const calculateTotal = () => {
    let total = 0;
    let base = 0;
    evalItems.forEach(item => {
      if (item.item_type === 'formula') {
        base = Number(item.score) || 0;
      } else if (item.item_type === 'llm') {
        total += Number(item.score) || 0;
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700">평가 영역 관리</h2>
            <div className="h-8 w-8 shrink-0" />
          </div>
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
          {showGuide && (
            <div className="relative rounded border border-blue-200 bg-blue-50 p-2 pr-7 text-xs leading-relaxed text-blue-900">
              <button className="absolute right-1.5 top-1.5 text-blue-500 hover:text-blue-700" onClick={hideGuide} title="다시 보지 않기">
                <X size={12} />
              </button>
              <div className="font-medium mb-1">업로드 안내</div>
              <p>나이스 &gt; 교과담임 &gt; 성적 &gt; 지필/수행선행작업 &gt; 반영비율/만점관리에서</p>
              <p>조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.</p>
            </div>
          )}
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
                onDownloadSubject={handleDownloadSubjectFile}
                onDeleteSubject={handleDeleteSubjectFile}
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
                <label
                  className={`btn-secondary p-2 cursor-pointer ${uploadingConfig ? 'opacity-60' : ''}`}
                  title="작업 내용 업로드"
                  aria-label="작업 내용 업로드"
                >
                  {uploadingConfig ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <input
                    ref={configFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleUploadConfig}
                    disabled={uploadingConfig}
                  />
                </label>
                <button
                  className="btn-secondary p-2"
                  onClick={handleDownloadConfig}
                  title="작업 내용 다운로드"
                  aria-label="작업 내용 다운로드"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* 탭 바 (영역 선택 시) */}
            {selectedDomain && (
              <div className="flex border-b border-gray-200 bg-white shrink-0 px-5">
                <button
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === 'standards' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('standards')}
                >
                  <Award size={14} />
                  성취 기준
                </button>
                {!isCustomDomain && (
                  <button
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === 'scoring' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('scoring')}
                  >
                    <ClipboardCheck size={14} />
                    채점 기준
                  </button>
                )}
                <button
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === 'activity' ? (isCustomDomain ? 'border-purple-500 text-purple-700' : 'border-blue-500 text-blue-700') : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setActiveTab('activity')}
                >
                  <BookOpen size={14} />
                  기록 기준
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-8">

              {/* 성취 기준 설정 (고정 영역, 도메인 선택 시) */}
              {selectedDomain && activeTab === 'standards' && (
                <section>
                  <div className="flex items-center mb-3 border-b border-gray-100 pb-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Award size={16} className="text-amber-500" />
                      성취 기준 관리
                    </h3>
                  </div>
                  {achievementStandards.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2 text-center py-2 bg-gray-50 rounded border border-dashed border-gray-200">
                      기준 관리에 성취기준을 먼저 업로드하세요.
                    </p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center py-1">
                        <span className="text-sm font-medium text-gray-600">성취 기준 항목 자동 생성</span>
                      </div>
                      <div className="flex gap-3">
                        <textarea
                          className="textarea flex-1 text-sm resize-y"
                          style={{ minHeight: '72px' }}
                          placeholder="성취 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 이 영역의 핵심 성취기준 2~3개를 골라줘)"
                          value={standardsMetaPrompt}
                          onChange={e => setStandardsMetaPrompt(e.target.value)}
                        />
                        <button
                          className="btn-rainbow text-xs px-3 py-2 flex items-center gap-1 whitespace-nowrap shrink-0 self-stretch"
                          onClick={handleGenerateStandards}
                          disabled={generatingStandards}
                        >
                          {generatingStandards ? <><Loader2 size={12} className="animate-spin" /> 생성 중…</> : <>✨ 생성</>}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-1 mb-2">
                    <span className="text-sm font-medium text-gray-600">성취 기준 항목</span>
                    <button className="btn-secondary text-xs px-2 py-1" onClick={addStandardRef}>
                      <Plus size={12} /> 기준 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {standardRefs.length === 0 && achievementStandards.length > 0 && (
                      <p className="text-center py-4 text-gray-400 text-sm">참조할 성취기준을 추가하거나 AI로 선택하세요.</p>
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
              {!isCustomDomain && (!selectedDomain || activeTab === 'scoring') && (
                <section>
                  <div className="flex items-center mb-3 border-b border-gray-100 pb-2">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <ClipboardCheck size={16} className="text-green-500" />
                      채점 기준 관리
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {/* 만점 행 */}
                    {(() => {
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

                    {/* 항목 자동 생성 */}
                    <div className="space-y-2">
                      <div className="flex items-center py-1">
                        <span className="text-sm font-medium text-gray-600">채점 기준 항목 자동 생성</span>
                      </div>
                      <div className="flex gap-3">
                        <textarea
                          className="textarea flex-1 text-sm leading-relaxed resize-y"
                          style={{ minHeight: '72px' }}
                          placeholder="채점 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 코드 기반 수행평가, 4단계 루브릭으로)"
                          value={evalMetaPrompts[-1] || ''}
                          onChange={e => setEvalMetaPrompts(p => ({ ...p, [-1]: e.target.value }))}
                        />
                        <button
                          className="btn-rainbow text-xs px-3 py-2 flex items-center gap-1 whitespace-nowrap shrink-0 self-stretch"
                          onClick={handleGenerateEvalItems}
                          disabled={generatingEval}
                          title="AI로 채점 항목 목록 생성"
                        >
                          {generatingEval ? <><Loader2 size={12} className="animate-spin" /> 생성 중…</> : <>✨ 생성</>}
                        </button>
                      </div>
                    </div>

                    {/* 채점 기준 항목 소제목 + 루브릭 AI 버튼 + 수동 추가 버튼 */}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium text-gray-600">채점 기준 항목</span>
                      <div className="flex gap-2">
                        <button
                          className="btn-rainbow text-xs px-2 py-1 flex items-center gap-1"
                          onClick={handleGenerateEvalRubrics}
                          disabled={generatingEval || evalItems.filter(i => i.item_type !== 'formula').length === 0}
                        >
                          {generatingEval ? <><Loader2 size={12} className="animate-spin" /> 생성 중…</> : <>✨ 생성</>}
                        </button>
                        <button className="btn-secondary text-xs px-2 py-1" onClick={addEvalItem}>
                          <Plus size={12} /> 채점 항목 추가
                        </button>
                      </div>
                    </div>

                    {/* 채점 항목 목록 */}
                    {evalItems.filter(i => i.item_type !== 'formula').length === 0 && (
                      <p className="text-center py-6 text-gray-400 text-sm">채점 항목을 추가하거나 AI로 생성하세요.</p>
                    )}
                    {evalItems.map((item, idx) => {
                      if (item.item_type === 'formula') return null;
                      const isChecked = evalChecked.has(idx);
                      return (
                        <div key={idx} className={`bg-white border rounded-lg p-4 shadow-sm ${isChecked ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                          {/* 항목 헤더 */}
                          <div className="flex gap-3 items-center mb-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 shrink-0 accent-blue-500"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(evalChecked);
                                if (e.target.checked) next.add(idx); else next.delete(idx);
                                setEvalChecked(next);
                              }}
                            />
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
                                value={item.score}
                                onChange={(e) => updateEvalItem(idx, 'score', e.target.value)}
                              />
                            </div>
                            <button
                              className="p-1.5 hover:bg-red-50 text-red-400 rounded transition-colors shrink-0"
                              onClick={() => removeEvalItem(idx)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {/* 프롬프트 입력 | 루브릭 */}
                          <div className="flex gap-3 items-start">
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-xs text-gray-500 font-medium">지시 사항</span>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '80px' }}
                                placeholder="채점 기준 내용 생성을 위한 지시사항을 입력하세요. (예: 코드 완성도 기준으로 4단계로 나눠줘)"
                                value={evalMetaPrompts[idx] || ''}
                                onChange={e => setEvalMetaPrompts(p => ({ ...p, [idx]: e.target.value }))}
                              />
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-xs text-gray-500 font-medium">채점 기준 내용</span>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '80px' }}
                                placeholder="루브릭 내용 (예: A(10점): 코드가 완벽히 동작하고 예외 처리가 됨, B(8점): ...)"
                                value={item.rubric}
                                onChange={(e) => updateEvalItem(idx, 'rubric', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 활동 기록 기준 설정 / 세특 기준 설정 */}
              {(!selectedDomain || activeTab === 'activity') && <section>
                <div className="flex items-center mb-3 border-b border-gray-100 pb-2">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <BookOpen size={16} className={isCustomDomain ? 'text-purple-500' : 'text-blue-500'} />
                    {selectedDomain ? '기록 기준 관리' : '기록 기준 관리'}
                  </h3>
                </div>

                {selectedDomain ? (
                  // 도메인 레벨 활동 기준 설정
                  <div className="space-y-4">
                    {/* 항목 자동 생성 */}
                    <div className="space-y-2">
                      <div className="flex items-center py-1">
                        <span className="text-sm font-medium text-gray-600">기록 기준 항목 자동 생성</span>
                      </div>
                      <div className="flex gap-3">
                        <textarea
                          className="textarea flex-1 text-sm leading-relaxed resize-y"
                          style={{ minHeight: '72px' }}
                          placeholder="기록 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 보고서와 코드를 각각 기록하는 항목으로 구성)"
                          value={setechMetaPrompts[-1] || ''}
                          onChange={e => setSetechMetaPrompts(p => ({ ...p, [-1]: e.target.value }))}
                        />
                        <button
                          className="btn-rainbow text-xs px-3 py-2 flex items-center gap-1 whitespace-nowrap shrink-0 self-stretch"
                          onClick={handleGenerateSetechItems}
                          disabled={generatingSetech}
                          title="AI로 기록 기준 항목 목록 생성"
                        >
                          {generatingSetech ? <><Loader2 size={12} className="animate-spin" /> 생성 중…</> : <>✨ 생성</>}
                        </button>
                      </div>
                    </div>

                    {/* 기록 기준 항목 소제목 + 기준 AI 버튼 + 수동 추가 버튼 */}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium text-gray-600">기록 기준 항목</span>
                      <div className="flex gap-2">
                        <button
                          className="btn-rainbow text-xs px-2 py-1 flex items-center gap-1"
                          onClick={handleGenerateSetechCriteria}
                          disabled={generatingSetech || setechItems.length === 0}
                        >
                          {generatingSetech ? <><Loader2 size={12} className="animate-spin" /> 생성 중…</> : <>✨ 생성</>}
                        </button>
                        <button className="btn-secondary text-xs px-2 py-1" onClick={addDomainSetechItem}>
                          <Plus size={12} /> 항목 추가
                        </button>
                      </div>
                    </div>

                    {/* 활동 항목 목록 */}
                    {setechItems.length === 0 && (
                      <p className="text-center py-6 text-gray-400 text-sm">활동 기록 항목을 추가하거나 AI로 생성하세요.</p>
                    )}
                    {setechItems.map((item, idx) => {
                      const isChecked = setechChecked.has(idx);
                      return (
                        <div key={idx} className={`bg-white border rounded-lg p-4 shadow-sm ${isChecked ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                          {/* 항목 헤더 */}
                          <div className="flex items-center gap-3 mb-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 shrink-0 accent-blue-500"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = new Set(setechChecked);
                                if (e.target.checked) next.add(idx); else next.delete(idx);
                                setSetechChecked(next);
                              }}
                            />
                            <GripVertical size={16} className="text-gray-300 cursor-grab shrink-0" />
                            <input
                              className="input flex-1 text-sm font-medium"
                              placeholder="항목 이름 (예: 자료수집 및 분석)"
                              value={item.title}
                              onChange={(e) => updateSetechItem(idx, 'title', e.target.value)}
                            />
                            <button
                              className="p-1.5 hover:bg-red-50 text-red-400 rounded transition-colors shrink-0"
                              onClick={() => removeSetechItem(idx)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {/* 프롬프트 입력 | 기록 작성 기준 */}
                          <div className="flex gap-3 items-start">
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-xs text-gray-500 font-medium">지시 사항</span>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '90px' }}
                                placeholder="기록 기준 내용 생성을 위한 지시사항을 입력하세요. (예: 학생의 탐구 과정 중심으로 작성 기준 생성)"
                                value={setechMetaPrompts[idx] || ''}
                                onChange={e => setSetechMetaPrompts(p => ({ ...p, [idx]: e.target.value }))}
                              />
                            </div>
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-xs text-gray-500 font-medium">기록 기준 내용</span>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '90px' }}
                                placeholder="이 항목의 기록 작성 기준 (예: 학생이 제출한 산출물을 분석하여 성취수준을 평가하고...)"
                                value={item.prompt}
                                onChange={(e) => updateSetechItem(idx, 'prompt', e.target.value)}
                              />
                            </div>
                          </div>
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
                      {['공통', '종합'].map((type) => {
                        const item = setechItems.find(i => i.type === type);
                        let metaPrompt = '';
                        try { metaPrompt = JSON.parse(item?.extensions || '{}').metaPrompt || ''; } catch { }
                        const label = type === '공통' ? '세특 공통 기준' : '종합 세특 기준';
                        const desc = type === '공통'
                          ? '모든 영역별 세특 및 종합 세특을 작성할 때 AI에게 공통으로 지시할 프롬프트입니다.'
                          : '최종 학기말 세특을 작성할 때 사용할 프롬프트입니다.';

                        return (
                          <div key={type} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                              <BookOpen size={14} className="text-blue-400" />
                              <span className="font-medium text-gray-700 text-sm">{label}</span>
                              <span className="text-xs text-gray-400 ml-1">{desc}</span>
                            </div>
                            <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                              <span className="text-xs text-gray-500 font-medium">지시 사항</span>
                              <div />
                              <span className="text-xs text-gray-500 font-medium">생성된 기준</span>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '100px' }}
                                placeholder={`${label} 위한 지시사항을 입력하세요.`}
                                value={metaPrompt}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSetechItems(prev => {
                                    if (prev.find(i => i.type === type)) {
                                      return prev.map(i => {
                                        if (i.type === type) {
                                          const ext = { ...JSON.parse(i.extensions || '{}'), metaPrompt: val };
                                          return { ...i, extensions: JSON.stringify(ext) };
                                        }
                                        return i;
                                      });
                                    }
                                    return [...prev, { type, title: label, prompt: '', extensions: JSON.stringify({ metaPrompt: val }), sort_order: type === '공통' ? 0 : 1 }];
                                  });
                                  setIsDirty(true);
                                }}
                              />
                              <button
                                className="btn-rainbow px-3 text-xs flex items-center justify-center gap-1 whitespace-nowrap"
                                style={{ alignSelf: 'stretch' }}
                                onClick={() => handleGenerateCommon(type, metaPrompt)}
                                title={`AI로 ${label} 생성`}
                              >
                                ✨ 생성
                              </button>
                              <textarea
                                className="textarea w-full text-sm leading-relaxed resize-y"
                                style={{ minHeight: '100px' }}
                                placeholder="생성된 기준이 여기에 표시됩니다. 직접 수정도 가능합니다."
                                value={item?.prompt || ''}
                                onChange={(e) => updateSubjectSetech(type, e.target.value)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>}

            </div>
          </>
        )}
      </div>
    </div>
  );
}
