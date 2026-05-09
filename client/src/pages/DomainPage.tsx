import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { criteriaApi, aiApi } from '../lib/api';
import { useAiAction } from '../hooks/useAiAction';
import {
  Plus, Trash2, Save,
  BookOpen, ClipboardCheck, School, Upload, Loader2, AlertCircle,
  Award, Download, X
} from 'lucide-react';
import { AiGenerateBox } from '../components/common/AiGenerateBox';
import { CriteriaItemCard } from '../components/common/CriteriaItemCard';
import { CriteriaItemSection } from '../components/common/CriteriaItemSection';
import { PageHeader } from '../components/common/PageHeader';
import { PageSidebar } from '../components/common/PageSidebar';
import { PageTabs, PageTab } from '../components/common/PageTabs';
import { SectionTitle } from '../components/common/SectionTitle';
import { SetechCriteriaPanels } from '../components/common/SetechCriteriaPanels';
import { TreeView } from '../components/common/TreeView';
import { TreeIconButton, TreeNodeView } from '../components/common/TreeNodeView';

interface SubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  class_id: number;
  fixedDomains: { name: string; max_score: number; sort_order: number }[];
  customDomains: { id: number; name: string }[];
  has_source?: number;
}

interface SubjectDomainRow {
  id?: number | string;
  year?: number;
  semester?: number;
  grade?: number;
  subject?: string;
  credit?: number;
  eval_type: '지필' | '수행' | '기록' | string;
  name: string;
  reflected: 'O' | 'X' | string;
  ratio: number | string;
  max_score: number | string;
  sort_order?: number;
  source_filename?: string;
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

interface AiPromptRow {
  prompt_key: string;
  prompt: string;
}


interface TreeNode {
  key: string;
  label: string;
  kind: 'year' | 'semester' | 'grade' | 'subject' | 'domain';
  year?: number;
  semester?: number;
  grade?: number;
  subjectName?: string;
  children?: TreeNode[];
  subject?: SubjectItem;
  domainName?: string;
  isCustom?: boolean;
  isDraft?: boolean;
  parentKey?: string | null;
}

type EditingTreeItem = { key: string; mode: 'add'; value: string };

function nodeKey(parts: Array<string | number | undefined>) {
  return parts.filter(v => v !== undefined && v !== '').join('|');
}

function nextChildKind(kind?: TreeNode['kind']): TreeNode['kind'] {
  if (!kind) return 'year';
  if (kind === 'year') return 'semester';
  if (kind === 'semester') return 'grade';
  if (kind === 'grade') return 'subject';
  return 'domain';
}

function mergeDraftNodes(nodes: TreeNode[], drafts: TreeNode[], parentKey: string | null = null): TreeNode[] {
  const existingKeys = new Set(nodes.map(node => node.key));
  const directDrafts = drafts
    .filter(node => node.parentKey === parentKey && !existingKeys.has(node.key))
    .map(node => ({ ...node, children: mergeDraftNodes([], drafts, node.key) }));
  return [
    ...nodes.map(node => ({
      ...node,
      children: mergeDraftNodes(node.children || [], drafts, node.key),
    })),
    ...directDrafts,
  ];
}

function domainSelectionPayload(sub: SubjectItem, domain: string | null) {
  return {
    year: sub.year,
    semester: sub.semester,
    grade: sub.grade,
    subject: sub.subject,
    domain,
  };
}

function promptsToRecord(items: AiPromptRow[]) {
  return Object.fromEntries(items.map(item => [item.prompt_key, item.prompt])) as Record<string, string>;
}

function compactPromptRows(rows: AiPromptRow[]) {
  return rows.filter(item => item.prompt_key && item.prompt.trim());
}

function parseAiJson<T>(value: string): T {
  return JSON.parse(value.replace(/```json/g, '').replace(/```/g, '').trim());
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
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => a[0] - b[0])) {
    const yearNode: TreeNode = { key: nodeKey(['dy', year]), label: `${year}학년도`, kind: 'year', year, children: [] };
    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      if (semester === 0) continue;
      const semNode: TreeNode = { key: nodeKey(['ds', year, semester]), label: `${semester}학기`, kind: 'semester', year, semester, children: [] };
      for (const [grade, subjects] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        if (grade === 0) continue;
        const gradeNode: TreeNode = { key: nodeKey(['dg', year, semester, grade]), label: `${grade}학년`, kind: 'grade', year, semester, grade, children: [] };
        for (const sub of subjects.sort((a, b) => a.subject.localeCompare(b.subject))) {
          if (!sub.subject) continue;
          const subjectNode: TreeNode = {
            key: nodeKey(['dsub', sub.year, sub.semester, sub.grade, sub.subject]),
            label: sub.subject,
            kind: 'subject',
            year: sub.year,
            semester: sub.semester,
            grade: sub.grade,
            subjectName: sub.subject,
            children: [],
            subject: sub,
          };

          for (const fd of sub.fixedDomains) {
            subjectNode.children!.push({
              key: nodeKey(['ddom', sub.year, sub.semester, sub.grade, sub.subject, fd.name]),
              label: fd.name,
              kind: 'domain',
              year: sub.year,
              semester: sub.semester,
              grade: sub.grade,
              subjectName: sub.subject,
              subject: sub,
              domainName: fd.name,
              isCustom: false,
            });
          }
          for (const cd of sub.customDomains) {
            subjectNode.children!.push({
              key: nodeKey(['ddom', sub.year, sub.semester, sub.grade, sub.subject, cd.name]),
              label: cd.name,
              kind: 'domain',
              year: sub.year,
              semester: sub.semester,
              grade: sub.grade,
              subjectName: sub.subject,
              subject: sub,
              domainName: cd.name,
              isCustom: true,
            });
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

export default function DomainPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [draftNodes, setDraftNodes] = useState<TreeNode[]>([]);
  const [editing, setEditing] = useState<EditingTreeItem | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [isCustomDomain, setIsCustomDomain] = useState<boolean>(false);

  const [setechItems, setSetechItems] = useState<SetechItem[]>([]);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);

  const [allSubjectDomains, setAllSubjectDomains] = useState<SubjectDomainRow[]>([]);
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
  const [subjectDomainsMetaPrompt, setSubjectDomainsMetaPrompt] = useState<string>('');
  const [subjectCommonPrompt, setSubjectCommonPrompt] = useState<string>('');
  const [generatingStandards, setGeneratingStandards] = useState(false);
  const [generatingSubjectDomains, setGeneratingSubjectDomains] = useState(false);
  const [generatingEval, setGeneratingEval] = useState(false);
  const [generatingSetech, setGeneratingSetech] = useState(false);
  const [activeTab, setActiveTab] = useState<'standards' | 'scoring' | 'activity' | 'ratio'>('standards');
  const [isDirty, setIsDirty] = useState(false);
  const runAiAction = useAiAction();
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

  const visibleTree = useMemo(() => mergeDraftNodes(tree, draftNodes), [tree, draftNodes]);

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

    // 성취기준 관리 데이터 로드 (과목/영역 자동 생성 모두 성취기준을 참조)
    try {
      const stdRes = await criteriaApi.getStandards(sub.year, sub.semester, sub.grade, sub.subject);
      setAchievementStandards(stdRes.data);
    } catch { setAchievementStandards([]); }

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

    try {
      const promptRes = await criteriaApi.getAiPrompts(sub.year, sub.semester, sub.grade, sub.subject, domainName);
      const savedPrompts = promptsToRecord(promptRes.data as AiPromptRow[]);
      setSubjectDomainsMetaPrompt(savedPrompts.subject_domains || '');
      setStandardsMetaPrompt(savedPrompts.standards || '');
      setEvalMetaPrompts(Object.fromEntries(
        Object.entries(savedPrompts)
          .filter(([key]) => key === 'eval_items' || key.startsWith('eval_item:'))
          .map(([key, value]) => [key === 'eval_items' ? -1 : Number(key.slice('eval_item:'.length)), value])
      ));
      setSetechMetaPrompts(Object.fromEntries(
        Object.entries(savedPrompts)
          .filter(([key]) => key === 'setech_items' || key.startsWith('setech_item:'))
          .map(([key, value]) => [key === 'setech_items' ? -1 : Number(key.slice('setech_item:'.length)), value])
      ));
    } catch {
      setSubjectDomainsMetaPrompt('');
      setStandardsMetaPrompt('');
      setEvalMetaPrompts({});
      setSetechMetaPrompts({});
    }
  }, []);

  const handleSelectDomain = useCallback((sub: SubjectItem, domain: string, isCustom: boolean) => {
    if (isDirty && !confirm('저장되지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) return;
    setSelectedSubject(sub);
    setSelectedDomain(domain);
    setIsCustomDomain(isCustom);
    setAllSubjectDomains([]);
    setEvalChecked(new Set());
    setSetechChecked(new Set());
    setActiveTab('standards');
    loadCriteria(sub, domain, isCustom);
    localStorage.setItem('domainPage_lastSelection', JSON.stringify(domainSelectionPayload(sub, domain)));
  }, [isDirty, loadCriteria]);

  const handleSelectSubject = useCallback(async (sub: SubjectItem) => {
    if (isDirty && !confirm('저장되지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) return;
    setSelectedSubject(sub);
    setSelectedDomain(null);
    setIsCustomDomain(true);
    setSetechChecked(new Set());
    setActiveTab('ratio');
    loadCriteria(sub, '__SUBJECT_COMPREHENSIVE__', true);
    const dr = await criteriaApi.getSubjectDomains(sub.year, sub.semester, sub.grade, sub.subject);
    setAllSubjectDomains(dr.data);
    localStorage.setItem('domainPage_lastSelection', JSON.stringify(domainSelectionPayload(sub, null)));
  }, [isDirty, loadCriteria]);

  useEffect(() => {
    if (!selectedSubject || subjects.length === 0) return;
    const fresh = subjects.find(s =>
      s.year === selectedSubject.year &&
      s.semester === selectedSubject.semester &&
      s.grade === selectedSubject.grade &&
      s.subject === selectedSubject.subject
    );
    if (!fresh) return;
    if (fresh === selectedSubject) return;
    setSelectedSubject(fresh);
  }, [subjects, selectedSubject]);

  // 마지막 선택 복원
  useEffect(() => {
    if (domainRestoredRef.current || subjects.length === 0) return;
    domainRestoredRef.current = true;
    const saved = localStorage.getItem('domainPage_lastSelection');
    if (!saved) return;
    try {
      const { classId, year, semester, grade, subject, domain } = JSON.parse(saved);
      const sub = subjects.find(s =>
        year !== undefined
          ? s.year === year && s.semester === semester && s.grade === grade && s.subject === subject
          : s.class_id === classId
      );
      if (!sub) return;
      if (domain) {
        const isCustom = sub.customDomains.some((d: any) => d.name === domain);
        handleSelectDomain(sub, domain, isCustom);
      } else {
        handleSelectSubject(sub);
      }
    } catch { /* ignore */ }
  }, [subjects, handleSelectDomain, handleSelectSubject]);

  const handleSave = async (): Promise<boolean> => {
    if (!selectedSubject) return false;
    if (!selectedDomain && subjectAssessmentRatioError) {
      alert(subjectAssessmentRatioError);
      return false;
    }
    const domainToSave = selectedDomain || '__SUBJECT_COMPREHENSIVE__';
    setSaving(true);
    try {
      if (!selectedDomain) {
        await criteriaApi.bulkSaveSubjectDomains(
          selectedSubject.year,
          selectedSubject.semester,
          selectedSubject.grade,
          selectedSubject.subject,
          allSubjectDomains
        );
        await loadSubjects();
      }

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

      const aiPromptRows = compactPromptRows([
        ...(!selectedDomain ? [{ prompt_key: 'subject_domains', prompt: subjectDomainsMetaPrompt }] : []),
        ...(selectedDomain ? [{ prompt_key: 'standards', prompt: standardsMetaPrompt }] : []),
        ...(selectedDomain ? Object.entries(evalMetaPrompts).map(([key, prompt]) => ({
          prompt_key: Number(key) === -1 ? 'eval_items' : `eval_item:${key}`,
          prompt,
        })) : []),
        ...(selectedDomain ? Object.entries(setechMetaPrompts).map(([key, prompt]) => ({
          prompt_key: Number(key) === -1 ? 'setech_items' : `setech_item:${key}`,
          prompt,
        })) : []),
      ]);
      await criteriaApi.bulkSaveAiPrompts(
        selectedSubject.year,
        selectedSubject.semester,
        selectedSubject.grade,
        selectedSubject.subject,
        domainToSave,
        aiPromptRows
      );

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

  const isSameSubject = (a: SubjectItem | null, b: Pick<SubjectItem, 'year' | 'semester' | 'grade' | 'subject'>) =>
    !!a && a.year === b.year && a.semester === b.semester && a.grade === b.grade && a.subject === b.subject;

  const isSelectedInScope = (node: TreeNode) => {
    if (!selectedSubject || selectedSubject.year !== node.year) return false;
    if (node.semester !== undefined && selectedSubject.semester !== node.semester) return false;
    if (node.grade !== undefined && selectedSubject.grade !== node.grade) return false;
    if (node.subjectName !== undefined && selectedSubject.subject !== node.subjectName) return false;
    if (node.domainName !== undefined && selectedDomain !== node.domainName) return false;
    return true;
  };
  const clearDomainSelection = () => {
    setSelectedSubject(null);
    setSelectedDomain(null);
    setAllSubjectDomains([]);
    setStandardRefs([]);
    setSetechItems([]);
    setEvalItems([]);
    setAchievementStandards([]);
    localStorage.removeItem('domainPage_lastSelection');
  };

  const removeDraftSubtree = (nodes: TreeNode[], rootKey: string) => {
    const childrenByParent = new Map<string | null | undefined, TreeNode[]>();
    for (const draft of nodes) {
      const children = childrenByParent.get(draft.parentKey) || [];
      children.push(draft);
      childrenByParent.set(draft.parentKey, children);
    }
    const keysToRemove = new Set<string>();
    const visit = (key: string) => {
      keysToRemove.add(key);
      for (const child of childrenByParent.get(key) || []) visit(child.key);
    };
    visit(rootKey);
    return nodes.filter(item => !keysToRemove.has(item.key));
  };

  const preserveParentPath = (sub: Pick<SubjectItem, 'year' | 'semester' | 'grade'>) => {
    const yearNode: TreeNode = {
      key: nodeKey(['dy', sub.year]),
      label: `${sub.year}학년도`,
      kind: 'year',
      year: sub.year,
      children: [],
      isDraft: true,
      parentKey: null,
    };
    const semesterNode: TreeNode = {
      key: nodeKey(['ds', sub.year, sub.semester]),
      label: `${sub.semester}학기`,
      kind: 'semester',
      year: sub.year,
      semester: sub.semester,
      children: [],
      isDraft: true,
      parentKey: yearNode.key,
    };
    const gradeNode: TreeNode = {
      key: nodeKey(['dg', sub.year, sub.semester, sub.grade]),
      label: `${sub.grade}학년`,
      kind: 'grade',
      year: sub.year,
      semester: sub.semester,
      grade: sub.grade,
      children: [],
      isDraft: true,
      parentKey: semesterNode.key,
    };
    const parents = [yearNode, semesterNode, gradeNode];
    setDraftNodes(prev => {
      const keys = new Set(prev.map(node => node.key));
      return [...prev, ...parents.filter(node => !keys.has(node.key))];
    });
  };

  const handleAddNode = (node?: TreeNode) => {
    const kind = nextChildKind(node?.kind);
    const draftKey = `domain-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const draft: TreeNode = {
      key: draftKey,
      parentKey: node?.key ?? null,
      isDraft: true,
      kind,
      label: '',
      year: node?.year,
      semester: node?.semester,
      grade: node?.grade,
      subjectName: node?.subjectName,
      subject: node?.subject,
      children: kind === 'domain' ? undefined : [],
    };
    setDraftNodes(prev => [...prev, draft]);
    setEditing({ key: draftKey, mode: 'add', value: '' });
  };

  const findNodeByKey = (nodes: TreeNode[], key: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const child = findNodeByKey(node.children || [], key);
      if (child) return child;
    }
    return null;
  };

  const commitAddNode = async (node: TreeNode, value: string): Promise<boolean> => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDraftNodes(prev => removeDraftSubtree(prev, node.key));
      return true;
    }

    if (node.kind === 'year') {
      const year = Number(trimmed);
      if (!year) {
        alert('학년도는 숫자로 입력하세요.');
        return false;
      }
      await criteriaApi.createDomainsAnchor(year, 0, 0, '');
    } else if (node.kind === 'semester') {
      const semester = Number(trimmed);
      if (!semester || !node.year) {
        alert('학기는 숫자로 입력하세요.');
        return false;
      }
      await criteriaApi.createDomainsAnchor(node.year, semester, 0, '');
    } else if (node.kind === 'grade') {
      const grade = Number(trimmed);
      if (!grade || !node.year || !node.semester) {
        alert('학년은 숫자로 입력하세요.');
        return false;
      }
      await criteriaApi.createDomainsAnchor(node.year, node.semester, grade, '');
    } else if (node.kind === 'subject') {
      if (!node.year || !node.semester || !node.grade) {
        alert('상위 항목을 먼저 입력하세요.');
        return false;
      }
      await criteriaApi.createDomainsAnchor(node.year, node.semester, node.grade, trimmed);
    } else if (node.subject) {
      await criteriaApi.addCustomDomain({
        year: node.subject.year,
        semester: node.subject.semester,
        grade: node.subject.grade,
        subject: node.subject.subject,
        name: trimmed,
      });
    }

    setDraftNodes(prev => removeDraftSubtree(prev, node.key));
    await loadSubjects();
    return true;
  };

  const commitEditing = async () => {
    if (!editing) return;
    const current = editing;
    const node = findNodeByKey(visibleTree, current.key);
    if (!node) {
      setEditing(null);
      return;
    }
    try {
      const ok = await commitAddNode(node, current.value);
      if (ok) setEditing(null);
      else setEditing(current);
    } catch (e: any) {
      alert(e?.response?.data?.error || '저장에 실패했습니다.');
      setEditing(current);
    }
  };

  const cancelEditing = () => {
    if (editing) setDraftNodes(prev => removeDraftSubtree(prev, editing.key));
    setEditing(null);
  };

  const handleDeleteNode = async (node: TreeNode) => {
    if (node.isDraft) {
      setDraftNodes(prev => removeDraftSubtree(prev, node.key));
      return;
    }
    if (!node.year) return;
    if (!confirm(`${node.label} 아래 평가 영역 데이터를 모두 삭제하시겠습니까?`)) return;
    await criteriaApi.deleteDomainsScope({
      year: node.year,
      semester: node.semester,
      grade: node.grade,
      subject: node.subjectName,
      domainName: node.domainName,
    });
    setDraftNodes(prev => removeDraftSubtree(prev, node.key));
    if (isSelectedInScope(node)) {
      clearDomainSelection();
    }
    await loadSubjects();
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
      alert(`업로드 완료: 성취 기준 ${r.data.standards}개, 채점 기준 ${r.data.eval}개, 기록 기준 ${r.data.setech}개, AI 요청 ${r.data.prompts ?? 0}개`);
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
    preserveParentPath(sub);
    if (isSameSubject(selectedSubject, sub)) {
      clearDomainSelection();
    }
    await loadSubjects();
  };

  const selectedDomainKey = selectedSubject && selectedDomain
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}-${selectedDomain}`
    : null;

  const selectedSubjectKey = selectedSubject
    ? `${selectedSubject.year}-${selectedSubject.semester}-${selectedSubject.grade}-${selectedSubject.subject}`
    : null;

  const subjectHasUploadedFile = !!selectedSubject?.has_source;
  const subjectAssessmentRows = allSubjectDomains.filter(row => row.eval_type === '지필' || row.eval_type === '수행');
  const subjectAssessmentRatioTotal = subjectAssessmentRows.reduce((sum, row) => sum + (Number(row.ratio) || 0), 0);
  const subjectAssessmentRatioInvalid = !subjectHasUploadedFile && subjectAssessmentRows.length > 0 && subjectAssessmentRatioTotal !== 100;
  const subjectAssessmentRatioError = subjectAssessmentRatioInvalid
    ? `지필/수행 반영비율 합계가 ${subjectAssessmentRatioTotal}%입니다. 합계가 100%가 되도록 수정하세요.`
    : null;
  const isLockedSubjectDomainRow = (row: SubjectDomainRow) => !!row.source_filename;
  const normalizeSubjectDomainRow = (row: SubjectDomainRow): SubjectDomainRow => ({
    ...row,
    eval_type: subjectHasUploadedFile ? '기록' : row.eval_type,
    reflected: subjectHasUploadedFile || row.eval_type === '기록' ? 'X' : 'O',
    ratio: subjectHasUploadedFile || row.eval_type === '기록' ? 0 : (row.ratio === '' ? '' : Number(row.ratio)),
    max_score: subjectHasUploadedFile || row.eval_type === '기록' ? 0 : (row.max_score === '' ? '' : Number(row.max_score)),
  });
  const updateSubjectDomainRow = (idx: number, patch: Partial<SubjectDomainRow>) => {
    setAllSubjectDomains(prev => prev.map((row, i) => {
      if (i !== idx || isLockedSubjectDomainRow(row)) return row;
      const next = normalizeSubjectDomainRow({ ...row, ...patch });
      return next;
    }));
    setIsDirty(true);
  };
  const addSubjectDomainRow = () => {
    const next: SubjectDomainRow = normalizeSubjectDomainRow({
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      eval_type: subjectHasUploadedFile ? '기록' : '수행',
      name: '',
      reflected: subjectHasUploadedFile ? 'X' : 'O',
      ratio: 0,
      max_score: 0,
      source_filename: '',
    });
    setAllSubjectDomains(prev => [...prev, next]);
    setIsDirty(true);
  };
  const removeSubjectDomainRow = (idx: number) => {
    setAllSubjectDomains(prev => prev.filter((row, i) => i !== idx || isLockedSubjectDomainRow(row)));
    setIsDirty(true);
  };

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

  const runAiJsonArrayGeneration = async <T,>({
    title,
    errorMessage,
    setLoading,
    prompt,
    systemPrompt,
    onGenerated,
    emptyMessage,
  }: {
    title: string;
    errorMessage: string;
    setLoading: (loading: boolean) => void;
    prompt: string;
    systemPrompt: string;
    onGenerated: (items: T[]) => void;
    emptyMessage?: string;
  }) => {
    await runAiAction({
      title,
      errorMessage,
      setLoading,
    }, async ({ signal }) => {
      const res = await aiApi.generatePrompt({ prompt, systemPrompt }, signal);
      const parsed = parseAiJson<T[]>(res.data.result);
      if (!Array.isArray(parsed)) throw new Error('AI 응답이 배열이 아닙니다.');
      if (parsed.length === 0) {
        if (emptyMessage) alert(emptyMessage);
        return;
      }
      onGenerated(parsed);
      setIsDirty(true);
    });
  };

  const handleGenerateSubjectDomains = async () => {
    if (!selectedSubject) return;
    const existingRows = allSubjectDomains.map(row => ({
      eval_type: row.eval_type,
      name: row.name,
      reflected: row.reflected,
      ratio: row.ratio,
      max_score: row.max_score,
      locked: !!row.source_filename,
    }));
    const standardsContext = achievementStandards.length > 0
      ? Array.from(
        new Map(achievementStandards.map((s: any) => [s.code, s])).values()
      ).map((s: any) => `${s.domain_name ? `[${s.domain_name}] ` : ''}${s.code} ${String(s.content || '').replace(s.code, '').trim()}`)
        .join('\n')
      : '';
    const systemPrompt = subjectHasUploadedFile
      ? '당신은 평가 영역 구성 AI입니다. 업로드 원본 행은 수정할 수 없으므로 세특 전용 기록 영역만 JSON 배열로 생성하세요. 각 행은 {"eval_type":"기록","name":"영역명","reflected":"X","ratio":0,"max_score":0} 형식입니다. 반드시 JSON 배열만 반환하세요.'
      : '당신은 평가 영역 구성 AI입니다. 과목 성취기준을 참고해 지필/수행/기록 영역을 JSON 배열로 생성하세요. 각 행은 {"eval_type":"지필|수행|기록","name":"영역명","reflected":"O|X","ratio":숫자,"max_score":숫자} 형식입니다. 지필/수행 행의 ratio 합계는 반드시 100이 되게 하고 reflected는 O로 하세요. 기록 행은 reflected를 X로 하세요. 반드시 JSON 배열만 반환하세요.';
    const prompt = [
      `과목: ${selectedSubject.subject}`,
      subjectHasUploadedFile ? '조건: 파일 업로드 과목이므로 새 행은 기록 영역만 가능' : '조건: 지필/수행 반영비율 합계는 100',
      standardsContext ? `과목 성취기준:\n${standardsContext}` : '',
      subjectDomainsMetaPrompt.trim() ? `추가 요청: ${subjectDomainsMetaPrompt.trim()}` : '',
      `현재 행: ${JSON.stringify(existingRows)}`,
    ].filter(Boolean).join('\n');
    await runAiJsonArrayGeneration<any>({
      title: '반영비율/만점관리 생성 중',
      errorMessage: '반영비율/만점관리 생성에 실패했습니다.',
      setLoading: setGeneratingSubjectDomains,
      prompt,
      systemPrompt,
      emptyMessage: '생성된 행이 없습니다.',
      onGenerated: (parsed) => {
      const generated = parsed
        .filter((row: any) => row && row.name)
        .map((row: any, idx: number) => normalizeSubjectDomainRow({
          id: `ai-${Date.now()}-${idx}`,
          eval_type: subjectHasUploadedFile ? '기록' : (['지필', '수행', '기록'].includes(row.eval_type) ? row.eval_type : '수행'),
          name: String(row.name || ''),
          reflected: row.eval_type === '기록' || subjectHasUploadedFile ? 'X' : 'O',
          ratio: Number(row.ratio) || 0,
          max_score: Number(row.max_score) || 0,
          source_filename: '',
        }));
      if (generated.length === 0) return alert('생성된 행이 없습니다.');
      setAllSubjectDomains(prev => [
        ...prev.filter(row => isLockedSubjectDomainRow(row)),
        ...generated,
      ]);
      },
    });
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
    await runAiJsonArrayGeneration<string>({
      title: '성취 기준 선택 중',
      errorMessage: '생성 실패: 다시 시도해주세요.',
      setLoading: setGeneratingStandards,
      systemPrompt: `당신은 교육과정 성취기준 선택 AI입니다. 주어진 성취기준 목록에서 적합한 성취기준들을 선택하여 code 배열을 JSON으로 반환하세요. 반드시 아래 형식만 반환하세요: ["코드1","코드2",...]`,
      prompt: (() => {
      // 코드 기준으로 중복 제거
      const uniqueStandards: any[] = Array.from(
        new Map(achievementStandards.map((s: any) => [s.code, s])).values()
      );
      const stdList = uniqueStandards.map((s: any) =>
        `{"code":"${s.code}","domain":"${s.domain_name}","content":${JSON.stringify(s.content)}}`
      ).join('\n');
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const extra = standardsMetaPrompt.trim() ? `\n추가 요청: ${standardsMetaPrompt.trim()}` : '\n위 과목과 영역에 가장 관련성 높은 성취기준을 2~4개 선택해주세요.';
      return `${base}${extra}\n\n사용 가능한 성취기준 목록:\n${stdList}`;
      })(),
      emptyMessage: '선택된 성취기준이 없습니다. 다시 시도해보세요.',
      onGenerated: (codes) => {
      const uniqueStandards: any[] = Array.from(
        new Map(achievementStandards.map((s: any) => [s.code, s])).values()
      );
      const selected = uniqueStandards.filter((s: any) => codes.includes(s.code));
      if (selected.length === 0) return alert('선택된 성취기준이 없습니다. 다시 시도해보세요.');
      setStandardRefs(selected.map((s: any) => ({
        domain_name_ref: s.domain_name,
        code: s.code,
        content: s.content,
      })));
      },
    });
  };

  const handleGenerateCommon = async (type: string, metaPrompt: string) => {
    const label = type === '공통' ? '세특 공통 기준' : '종합 세특 기준';
    await runAiAction({
      title: `${label} 생성 중`,
      errorMessage: '기준 생성에 실패했습니다.',
    }, async ({ signal }) => {
      const systemPrompt = `당신은 ${label} 생성 AI입니다. 주어진 과목/조건에 맞게 AI 기록 작성 지시 프롬프트를 작성하세요. 부가적인 설명 없이 생성된 프롬프트 내용만 반환하세요.`;
      const base = `과목: ${selectedSubject?.subject}\n기준 유형: ${label}`;
      const extra = metaPrompt.trim() ? `\n추가 요청: ${metaPrompt.trim()}` : '';
      const res = await aiApi.generatePrompt({ prompt: base + extra, systemPrompt }, signal);
      updateSubjectSetech(type, res.data.result.trim());
    });
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
    const formulaItem = evalItems.find(i => i.item_type === 'formula');
    const stdCtx = buildStandardsContext();
    const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
    const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
    const maxScore = currentMaxScore > 0 ? `${currentMaxScore}점` : '미설정';
    const baseScore = formulaItem ? `${formulaItem.score}점` : '0점';
    const extra = evalMetaPrompts[-1]?.trim() ? `\n추가 요청: ${evalMetaPrompts[-1]}` : '';
    await runAiJsonArrayGeneration<any>({
      title: '채점 항목 생성 중',
      errorMessage: '생성 실패',
      setLoading: setGeneratingEval,
      systemPrompt: `당신은 채점 기준 생성 AI입니다. 과목·영역·성취기준을 참고하여 채점 항목 목록(이름, 배점, 루브릭)을 JSON 배열로 생성하세요. 배점 합계는 만점에서 기본점수를 뺀 값이어야 합니다. 반드시 아래 형식만 반환하세요: [{"name":"항목명","score":"배점","rubric":"루브릭 내용"}]`,
      prompt: `${base}\n만점: ${maxScore}, 기본점수: ${baseScore}${stdPart}${extra}`,
      onGenerated: (newItems) => {
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
      },
    });
  };

  // 채점 항목 루브릭 AI 생성 (소제목 옆 버튼 - 선택/전체 항목)
  const handleGenerateEvalRubrics = async () => {
    const llmIndices = evalItems.map((_, i) => i).filter(i => evalItems[i].item_type !== 'formula');
    const targets = evalChecked.size > 0 ? llmIndices.filter(i => evalChecked.has(i)) : llmIndices;
    if (targets.length === 0) return;
    const targetLabel = evalChecked.size > 0 ? `선택한 ${evalChecked.size}개` : `전체 ${targets.length}개`;
    if (!confirm(`${targetLabel} 채점 루브릭을 AI로 생성하시겠습니까?`)) return;
    await runAiAction({
      title: '채점 루브릭 생성 중',
      errorMessage: '생성 실패',
      setLoading: setGeneratingEval,
      initialProgress: { progress: 0, message: `0/${targets.length} 완료` },
    }, async ({ signal, setProgress }) => {
      const stdCtx = buildStandardsContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const systemPrompt = `당신은 채점 기준 생성 AI입니다. 과목·영역·성취기준·항목명·배점을 참고하여 채점 루브릭(기준 내용)을 생성하세요. 루브릭 내용만 반환하고 부가 설명은 하지 마세요.`;
      for (let i = 0; i < targets.length; i++) {
        if (signal.aborted) break;
        const idx = targets[i];
        const item = evalItems[idx];
        const extra = evalMetaPrompts[idx]?.trim() ? `\n추가 요청: ${evalMetaPrompts[idx]}` : '';
        const prompt = `${base}\n항목명: ${item.name || '(미입력)'}\n배점: ${item.score || '?'}점${stdPart}${extra}`;
        const res = await aiApi.generatePrompt({ prompt, systemPrompt }, signal);
        updateEvalItem(idx, 'rubric', res.data.result.trim());
        setProgress(((i + 1) / targets.length) * 100, `${i + 1}/${targets.length} 완료`);
      }
    });
  };

  // 활동 기록 항목 목록 AI 생성 (상단 버튼)
  const handleGenerateSetechItems = async () => {
    const stdCtx = buildStandardsContext();
    const actCtx = buildActivityContext();
    const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
    const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
    const actPart = actCtx ? `\n\n${actCtx}` : '';
    const extra = setechMetaPrompts[-1]?.trim() ? `\n\n추가 요청: ${setechMetaPrompts[-1]}` : '';
    await runAiJsonArrayGeneration<any>({
      title: '기록 기준 항목 생성 중',
      errorMessage: '생성 실패',
      setLoading: setGeneratingSetech,
      systemPrompt: `당신은 기록 기준 생성 AI입니다. 과목·영역·성취기준·채점기준을 참고하여 활동 기록 항목 목록(제목, 기록 작성 지시사항)을 JSON 배열로 생성하세요. 반드시 아래 형식만 반환하세요: [{"title":"항목명","prompt":"기록 작성 지시사항"}]`,
      prompt: `${base}${stdPart}${actPart}${extra}`,
      onGenerated: (newItems) => {
      setSetechItems(newItems.map((item: any, j: number) => ({
        title: item.title || '',
        prompt: item.prompt || '',
        type: '항목',
        extensions: '',
        sort_order: j,
      })));
      },
    });
  };

  // 활동 기록 항목 기준 AI 생성 (소제목 옆 버튼 - 선택/전체 항목)
  const handleGenerateSetechCriteria = async () => {
    const targets = setechChecked.size > 0
      ? setechItems.map((_, i) => i).filter(i => setechChecked.has(i))
      : setechItems.map((_, i) => i);
    if (targets.length === 0) return;
    const targetLabel = setechChecked.size > 0 ? `선택한 ${setechChecked.size}개` : `전체 ${targets.length}개`;
    if (!confirm(`${targetLabel} 기록 작성 기준을 AI로 생성하시겠습니까?`)) return;
    await runAiAction({
      title: '기록 작성 기준 생성 중',
      errorMessage: '생성 실패',
      setLoading: setGeneratingSetech,
      initialProgress: { progress: 0, message: `0/${targets.length} 완료` },
    }, async ({ signal, setProgress }) => {
      const stdCtx = buildStandardsContext();
      const actCtx = buildActivityContext();
      const base = `과목: ${selectedSubject?.subject}\n영역: ${selectedDomain}`;
      const stdPart = stdCtx ? `\n\n성취 기준:\n${stdCtx}` : '';
      const actPart = actCtx ? `\n\n${actCtx}` : '';
      const systemPrompt = `당신은 기록 기준 생성 AI입니다. 과목·영역·성취기준·채점기준·항목명을 참고하여 활동 기록 작성 지시사항을 생성하세요. 지시사항 내용만 반환하고 부가 설명은 하지 마세요.`;
      for (let i = 0; i < targets.length; i++) {
        if (signal.aborted) break;
        const idx = targets[i];
        const item = setechItems[idx];
        const extra = setechMetaPrompts[idx]?.trim() ? `\n\n추가 요청: ${setechMetaPrompts[idx]}` : '';
        const prompt = `${base}\n항목명: ${item.title || '(미입력)'}${stdPart}${actPart}${extra}`;
        const res = await aiApi.generatePrompt({ prompt, systemPrompt }, signal);
        updateSetechItem(idx, 'prompt', res.data.result.trim());
        setProgress(((i + 1) / targets.length) * 100, `${i + 1}/${targets.length} 완료`);
      }
    });
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
  const domainTabs: PageTab<typeof activeTab>[] = [
    { value: 'standards', label: '성취 기준', icon: <Award size={14} />, color: 'amber' },
    ...(!isCustomDomain ? [{ value: 'scoring' as const, label: '채점 기준', icon: <ClipboardCheck size={14} />, color: 'green' as const }] : []),
    { value: 'activity', label: '기록 기준', icon: <BookOpen size={14} />, color: isCustomDomain ? 'purple' : 'blue' },
  ];
  const subjectTabs: PageTab<typeof activeTab>[] = [
    { value: 'ratio', label: '반영비율/만점관리', icon: <ClipboardCheck size={14} />, color: 'green' },
    { value: 'activity', label: '세특 기준 관리', icon: <BookOpen size={14} />, color: 'blue' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <PageSidebar
        title="평가 영역 관리"
        upload={(
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
        )}
        notices={(
          <>
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
          </>
        )}
        tree={(
        <TreeView
          nodes={visibleTree}
          empty={(
            <div className="text-center py-10 text-gray-400">
              <School size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">영역 관리 파일을 업로드하면<br />과목과 수행평가 영역이 표시됩니다</p>
              <button
                className="mt-4 flex w-full items-center justify-center rounded border border-dashed border-blue-200 py-1.5 text-blue-500 hover:bg-blue-50"
                onClick={() => handleAddNode()}
                title="학년도 추가"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
          addYearButton={(
            <button
              className="flex w-full items-center justify-center rounded border border-dashed border-transparent py-1 text-blue-500 opacity-0 transition hover:border-blue-200 hover:bg-blue-50 hover:opacity-100 group-hover/tree:opacity-100"
              onClick={() => handleAddNode()}
              title="학년도 추가"
            >
              <Plus size={14} />
            </button>
          )}
        >
          {(node, i) => (
            <TreeNodeView
              key={node.key || i}
              node={node}
              editing={editing}
              selected={(item) => {
                if (!item.subject) return false;
                if (item.kind === 'domain') {
                  const key = `${item.subject.year}-${item.subject.semester}-${item.subject.grade}-${item.subject.subject}-${item.domainName}`;
                  return selectedDomainKey === key;
                }
                if (item.kind === 'subject' && !selectedDomainKey) {
                  const key = `${item.subject.year}-${item.subject.semester}-${item.subject.grade}-${item.subject.subject}`;
                  return selectedSubjectKey === key;
                }
                return false;
              }}
              clickable={(item) => (item.kind === 'subject' || item.kind === 'domain') && !!item.subject}
              onSelect={(item) => {
                if (!item.subject) return;
                if (item.kind === 'domain') handleSelectDomain(item.subject, item.domainName!, !!item.isCustom);
                else if (item.kind === 'subject') handleSelectSubject(item.subject);
              }}
              canAdd={(item) => item.kind !== 'subject' && item.kind !== 'domain'}
              onAdd={handleAddNode}
              canDelete={(item) => item.kind !== 'domain'}
              onDelete={(item) => {
                const isSubject = !!item.subject && !item.domainName;
                if (isSubject) handleDeleteSubjectFile(item.subject!);
                else handleDeleteNode(item);
              }}
              actions={(item) => item.kind === 'subject' ? (
                item.subject?.has_source ? (
                  <TreeIconButton
                    title="원본 파일 다운로드"
                    onClick={() => handleDownloadSubjectFile(item.subject!)}
                    variant="blue"
                  >
                    <Download size={13} />
                  </TreeIconButton>
                ) : (
                  <span className="w-[21px]" />
                )
              ) : null}
              onEditChange={(value) => setEditing(prev => prev ? { ...prev, value } : prev)}
              onEditCommit={commitEditing}
              onEditCancel={cancelEditing}
            />
          )}
        </TreeView>
        )}
      />

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
            <PageHeader
              eyebrow={(
                <>
                  {selectedSubject?.year}학년도 {selectedSubject?.semester}학기 {selectedSubject?.grade}학년 &gt; {selectedSubject?.subject}
                </>
              )}
              title={selectedDomain ? selectedDomain : '종합 세특 기준 (과목 공통)'}
              actions={(
                <>
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
                </>
              )}
            />

            <PageTabs value={activeTab} tabs={selectedDomain ? domainTabs : subjectTabs} onChange={setActiveTab} />

            <div className="flex-1 overflow-y-auto scrollbar-stable p-6 space-y-8">

              {/* 과목 반영비율/만점관리 */}
              {!selectedDomain && activeTab === 'ratio' && (
                <section>
                  <SectionTitle icon={<ClipboardCheck size={16} className="text-green-500" />}>
                    반영비율/만점관리
                  </SectionTitle>
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
                </section>
              )}

              {/* 성취 기준 설정 (고정 영역, 도메인 선택 시) */}
              {selectedDomain && activeTab === 'standards' && (
                <section>
                  <SectionTitle icon={<Award size={16} className="text-amber-500" />}>
                    성취 기준 관리
                  </SectionTitle>
                  <div className="space-y-4">
                    {achievementStandards.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded border border-dashed border-gray-200">
                        기준 관리에 성취기준을 먼저 업로드하세요.
                      </p>
                    ) : (
                      <AiGenerateBox
                        label="성취 기준 항목 자동 생성"
                        placeholder="성취 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 이 영역의 핵심 성취기준 2~3개를 골라줘)"
                        value={standardsMetaPrompt}
                        onChange={(value) => {
                          setStandardsMetaPrompt(value);
                          setIsDirty(true);
                        }}
                        onGenerate={handleGenerateStandards}
                        generating={generatingStandards}
                      />
                    )}
                    <CriteriaItemSection
                      title="성취 기준 항목"
                      addLabel="항목 추가"
                      onAdd={addStandardRef}
                      empty={standardRefs.length === 0 && achievementStandards.length > 0 && (
                        <p className="text-center py-4 text-gray-400 text-sm">참조할 성취기준을 추가하거나 AI로 선택하세요.</p>
                      )}
                    >
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
                    </CriteriaItemSection>
                  </div>
                </section>
              )}

              {/* 채점 항목 설정 (고정 영역일 때만 표시) */}
              {selectedDomain && !isCustomDomain && activeTab === 'scoring' && (
                <section>
                  <SectionTitle icon={<ClipboardCheck size={16} className="text-green-500" />}>
                    채점 기준 관리
                  </SectionTitle>
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

                    <AiGenerateBox
                      label="채점 기준 항목 자동 생성"
                      placeholder="채점 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 코드 기반 수행평가, 4단계 루브릭으로)"
                      value={evalMetaPrompts[-1] || ''}
                      onChange={(value) => {
                        setEvalMetaPrompts(p => ({ ...p, [-1]: value }));
                        setIsDirty(true);
                      }}
                      onGenerate={handleGenerateEvalItems}
                      generating={generatingEval}
                    />

                    <CriteriaItemSection
                      title="채점 기준 항목"
                      addLabel="항목 추가"
                      generating={generatingEval}
                      generateDisabled={evalItems.filter(i => i.item_type !== 'formula').length === 0}
                      onGenerate={handleGenerateEvalRubrics}
                      onAdd={addEvalItem}
                      empty={evalItems.filter(i => i.item_type !== 'formula').length === 0 && (
                        <p className="text-center py-6 text-gray-400 text-sm">채점 항목을 추가하거나 AI로 생성하세요.</p>
                      )}
                    >
                      {evalItems.map((item, idx) => {
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
                      })}
                    </CriteriaItemSection>
                  </div>
                </section>
              )}

              {/* 활동 기록 기준 설정 / 세특 기준 설정 */}
              {activeTab === 'activity' && <section>
                <SectionTitle icon={<BookOpen size={16} className={isCustomDomain ? 'text-purple-500' : 'text-blue-500'} />}>
                  {selectedDomain ? '기록 기준 관리' : '세특 기준 관리'}
                </SectionTitle>

                {selectedDomain ? (
                  // 도메인 레벨 활동 기준 설정
                  <div className="space-y-4">
                    <AiGenerateBox
                      label="기록 기준 항목 자동 생성"
                      placeholder="기록 기준 항목 생성을 위한 지시사항을 입력하세요. (예: 보고서와 코드를 각각 기록하는 항목으로 구성)"
                      value={setechMetaPrompts[-1] || ''}
                      onChange={(value) => {
                        setSetechMetaPrompts(p => ({ ...p, [-1]: value }));
                        setIsDirty(true);
                      }}
                      onGenerate={handleGenerateSetechItems}
                      generating={generatingSetech}
                    />

                    <CriteriaItemSection
                      title="기록 기준 항목"
                      addLabel="항목 추가"
                      generating={generatingSetech}
                      generateDisabled={setechItems.length === 0}
                      onGenerate={handleGenerateSetechCriteria}
                      onAdd={addDomainSetechItem}
                      empty={setechItems.length === 0 && (
                        <p className="text-center py-6 text-gray-400 text-sm">활동 기록 항목을 추가하거나 AI로 생성하세요.</p>
                      )}
                    >
                      {setechItems.map((item, idx) => {
                        const isChecked = setechChecked.has(idx);
                        return (
                          <CriteriaItemCard
                            key={idx}
                            checked={isChecked}
                            title={item.title}
                            instruction={setechMetaPrompts[idx] || ''}
                            result={item.prompt}
                            draggable
                            titlePlaceholder="항목 이름 (예: 자료수집 및 분석)"
                            instructionPlaceholder="기록 기준 내용 생성을 위한 지시사항을 입력하세요. (예: 학생의 탐구 과정 중심으로 작성 기준 생성)"
                            resultPlaceholder="이 항목의 기록 작성 기준 (예: 학생이 제출한 산출물을 분석하여 성취수준을 평가하고...)"
                            resultLabel="기록 기준 내용"
                            onCheckedChange={(checked) => {
                              const next = new Set(setechChecked);
                              if (checked) next.add(idx); else next.delete(idx);
                              setSetechChecked(next);
                            }}
                            onTitleChange={(value) => updateSetechItem(idx, 'title', value)}
                            onInstructionChange={(value) => {
                              setSetechMetaPrompts(p => ({ ...p, [idx]: value }));
                              setIsDirty(true);
                            }}
                            onResultChange={(value) => updateSetechItem(idx, 'prompt', value)}
                            onRemove={() => removeSetechItem(idx)}
                          />
                        );
                      })}
                    </CriteriaItemSection>
                  </div>
                ) : (
                  // 과목 레벨 (종합 세특) 설정
                  <div className="space-y-6">
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
