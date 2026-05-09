import { useEffect, useRef, useState, useMemo } from 'react';
import { criteriaApi } from '../lib/api';
import { AlertCircle, BookOpen, Loader2, Upload, Download, Trash2, X, Plus } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { PageSidebar } from '../components/common/PageSidebar';
import { TreeView } from '../components/common/TreeView';
import { TreeIconButton, TreeNodeView } from '../components/common/TreeNodeView';

interface SubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  domain_name: string;
  credit: number;
  standards_count: number;
  has_source?: number;
}

interface StandardRow {
  id: number;
  domain_name: string;
  code: string;
  content: string;
  level: string;
  description: string;
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
  isDraft?: boolean;
  parentKey?: string | null;
}

type EditingTreeItem = { key: string; mode: 'add' | 'edit'; value: string };

function buildTree(items: SubjectItem[]): TreeNode[] {
  const yearMap = new Map<number, Map<number, Map<number, Map<string, SubjectItem[]>>>>();

  for (const item of items) {
    if (!yearMap.has(item.year)) yearMap.set(item.year, new Map());
    const semMap = yearMap.get(item.year)!;
    if (!semMap.has(item.semester)) semMap.set(item.semester, new Map());
    const gradeMap = semMap.get(item.semester)!;
    if (!gradeMap.has(item.grade)) gradeMap.set(item.grade, new Map());
    const subjectMap = gradeMap.get(item.grade)!;
    if (!subjectMap.has(item.subject)) subjectMap.set(item.subject, []);
    subjectMap.get(item.subject)!.push(item);
  }

  const result: TreeNode[] = [];
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => a[0] - b[0])) {
    const yearNode: TreeNode = { key: nodeKey(['y', year]), label: `${year}학년도`, kind: 'year', year, children: [] };
    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      if (semester === 0) continue;
      const semNode: TreeNode = { key: nodeKey(['s', year, semester]), label: `${semester}학기`, kind: 'semester', year, semester, children: [] };
      for (const [grade, subjectMap] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        if (grade === 0) continue;
        const gradeNode: TreeNode = { key: nodeKey(['g', year, semester, grade]), label: `${grade}학년`, kind: 'grade', year, semester, grade, children: [] };
        for (const [subject, domains] of [...subjectMap.entries()].sort()) {
          if (!subject) continue;
          const subjectNode: TreeNode = { key: nodeKey(['sub', year, semester, grade, subject]), label: subject, kind: 'subject', year, semester, grade, subjectName: subject, children: [], subject: domains[0] };
          for (const d of domains.filter(d => d.domain_name).sort((a, b) => a.domain_name.localeCompare(b.domain_name))) {
            subjectNode.children!.push({ key: nodeKey(['dom', year, semester, grade, subject, d.domain_name]), label: d.domain_name, kind: 'domain', year, semester, grade, subjectName: subject, subject: d, domainName: d.domain_name });
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

function displayValue(node: TreeNode) {
  if (node.kind === 'year') return String(node.year ?? '');
  if (node.kind === 'semester') return String(node.semester ?? '');
  if (node.kind === 'grade') return String(node.grade ?? '');
  if (node.kind === 'subject') return node.subjectName || node.label;
  return node.domainName || node.label;
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

export default function CriteriaPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [draftNodes, setDraftNodes] = useState<TreeNode[]>([]);
  const [editing, setEditing] = useState<EditingTreeItem | null>(null);
  const [selected, setSelected] = useState<SubjectItem | null>(null);
  const [standards, setStandards] = useState<StandardRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('hideCriteriaGuide') !== '1');
  const fileRef = useRef<HTMLInputElement>(null);
  const criteriaRestoredRef = useRef(false);
  const pendingStandardsFile = useRef<File | null>(null);
  const loadStandardsRef = useRef<((subject: SubjectItem) => void) | null>(null);

  const loadSubjects = async () => {
    const res = await criteriaApi.getStandardSubjects();
    setSubjects(res.data);
    setTree(buildTree(res.data));
  };

  const visibleTree = useMemo(() => mergeDraftNodes(tree, draftNodes), [tree, draftNodes]);

  const loadStandards = async (subject: SubjectItem) => {
    setSelected(subject);
    localStorage.setItem('criteriaPage_lastSelection', JSON.stringify({
      year: subject.year, semester: subject.semester, grade: subject.grade,
      subject: subject.subject, domain_name: subject.domain_name,
    }));
    const res = await criteriaApi.getStandards(subject.year, subject.semester, subject.grade, subject.subject);
    const filtered = res.data.filter((r: StandardRow) => r.domain_name === subject.domain_name);
    setStandards(filtered);
  };
  loadStandardsRef.current = loadStandards;

  useEffect(() => { loadSubjects(); }, []);

  // 마지막 선택 복원
  useEffect(() => {
    if (criteriaRestoredRef.current || subjects.length === 0) return;
    criteriaRestoredRef.current = true;
    const saved = localStorage.getItem('criteriaPage_lastSelection');
    if (!saved) return;
    try {
      const { year, semester, grade, subject, domain_name } = JSON.parse(saved);
      const sub = subjects.find(s =>
        s.year === year && s.semester === semester && s.grade === grade &&
        s.subject === subject && s.domain_name === domain_name
      );
      if (sub && loadStandardsRef.current) loadStandardsRef.current(sub);
    } catch { /* ignore */ }
  }, [subjects]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement> | null, overwrite?: boolean) => {
    const file = e?.target.files?.[0] ?? pendingStandardsFile.current;
    if (!file) return;
    if (e) pendingStandardsFile.current = file;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await criteriaApi.uploadStandards(file, overwrite);
      const data = res.data;
      setMessage(`${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 성취 기준 ${data.standardsCount}개 업로드`);
      await loadSubjects();
      setSelected(null);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const d = err.response.data;
        const msg = `${d.year}학년도 ${d.semester}학기 ${d.grade}학년 ${d.subject}의 데이터가 이미 있습니다. 덮어씌우시겠습니까?\n(기존의 성취기준 및 영역 데이터가 모두 삭제됩니다)`;
        if (window.confirm(msg)) {
          await handleUpload(null, true);
        } else {
          if (fileRef.current) fileRef.current.value = '';
          pendingStandardsFile.current = null;
        }
        return;
      }
      setError(err?.response?.data?.error || String(err));
    } finally {
      setUploading(false);
      if (e && fileRef.current) fileRef.current.value = '';
    }
  };

  const hideGuide = () => {
    localStorage.setItem('hideCriteriaGuide', '1');
    setShowGuide(false);
  };

  const handleDownloadSubject = (sub: SubjectItem) => {
    window.location.href = criteriaApi.sourceUrl('standards', sub.year, sub.semester, sub.grade, sub.subject);
  };

  const isSameSubject = (a: SubjectItem | null, b: Pick<SubjectItem, 'year' | 'semester' | 'grade' | 'subject'>) =>
    !!a && a.year === b.year && a.semester === b.semester && a.grade === b.grade && a.subject === b.subject;

  const isSelectedInScope = (node: TreeNode) => {
    if (!selected || selected.year !== node.year) return false;
    if (node.semester !== undefined && selected.semester !== node.semester) return false;
    if (node.grade !== undefined && selected.grade !== node.grade) return false;
    if (node.subjectName !== undefined && selected.subject !== node.subjectName) return false;
    if (node.domainName !== undefined && selected.domain_name !== node.domainName) return false;
    return true;
  };
  const clearCriteriaSelection = () => {
    setSelected(null);
    setStandards([]);
    localStorage.removeItem('criteriaPage_lastSelection');
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

  const handleDeleteSubject = async (sub: SubjectItem) => {
    if (!confirm(`${sub.subject} 성취 기준 파일과 데이터를 삭제하시겠습니까?`)) return;
    await criteriaApi.deleteSource('standards', sub.year, sub.semester, sub.grade, sub.subject);
    preserveParentPath(sub);
    if (isSameSubject(selected, sub)) {
      clearCriteriaSelection();
    }
    await loadSubjects();
  };

  const handleAddNode = (node?: TreeNode) => {
    const kind = nextChildKind(node?.kind);
    const draftKey = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  const handleEditNode = (node: TreeNode) => {
    setEditing({ key: node.key, mode: 'edit', value: displayValue(node) });
  };

  const findNodeByKey = (nodes: TreeNode[], key: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const child = findNodeByKey(node.children || [], key);
      if (child) return child;
    }
    return null;
  };

  const preserveParentPath = (sub: Pick<SubjectItem, 'year' | 'semester' | 'grade'>) => {
    const yearNode: TreeNode = {
      key: nodeKey(['y', sub.year]),
      label: `${sub.year}학년도`,
      kind: 'year',
      year: sub.year,
      children: [],
      isDraft: true,
      parentKey: null,
    };
    const semesterNode: TreeNode = {
      key: nodeKey(['s', sub.year, sub.semester]),
      label: `${sub.semester}학기`,
      kind: 'semester',
      year: sub.year,
      semester: sub.semester,
      children: [],
      isDraft: true,
      parentKey: yearNode.key,
    };
    const gradeNode: TreeNode = {
      key: nodeKey(['g', sub.year, sub.semester, sub.grade]),
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

  const commitAddNode = async (node: TreeNode, value: string): Promise<boolean> => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDraftNodes(prev => prev.filter(item => item.key !== node.key));
      return true;
    }

    if (node.kind === 'year') {
      const year = Number(trimmed);
      if (!year) {
        alert('학년도는 숫자로 입력하세요.');
        return false;
      }
      try {
        await criteriaApi.createStandardsAnchor(year, 0, 0, '');
        setDraftNodes(prev => prev.filter(item => item.key !== node.key && item.parentKey !== node.key));
        await loadSubjects();
      } catch {
        alert('저장에 실패했습니다.');
        return false;
      }
      return true;
    }
    if (node.kind === 'semester') {
      const semester = Number(trimmed);
      if (!semester || !node.year) {
        alert('학기는 숫자로 입력하세요.');
        return false;
      }
      try {
        await criteriaApi.createStandardsAnchor(node.year, semester, 0, '');
        setDraftNodes(prev => prev.filter(item => item.key !== node.key && item.parentKey !== node.key));
        await loadSubjects();
      } catch {
        alert('저장에 실패했습니다.');
        return false;
      }
      return true;
    }
    if (node.kind === 'grade') {
      const grade = Number(trimmed);
      if (!grade || !node.year || !node.semester) {
        alert('학년은 숫자로 입력하세요.');
        return false;
      }
      try {
        await criteriaApi.createStandardsAnchor(node.year, node.semester, grade, '');
        setDraftNodes(prev => prev.filter(item => item.key !== node.key && item.parentKey !== node.key));
        await loadSubjects();
      } catch {
        alert('저장에 실패했습니다.');
        return false;
      }
      return true;
    }
    if (node.kind === 'subject') {
      if (!node.year || !node.semester || !node.grade) {
        alert('상위 항목을 먼저 입력하세요.');
        return false;
      }
      try {
        await criteriaApi.seedStandardsFromCurriculum({
          year: node.year,
          semester: node.semester,
          grade: node.grade,
          subject: trimmed,
          credit: node.subject?.credit ?? 0,
        });
      } catch (e: any) {
        alert(e?.response?.data?.error || '내장 성취 기준을 찾을 수 없습니다.');
        return false;
      }
      setDraftNodes(prev => prev.filter(item => item.key !== node.key));
      await loadSubjects();
      return true;
    }

    alert('성취 기준 카테고리 직접 추가는 TODO입니다. 과목명을 입력하면 내장 성취 기준이 자동으로 입력됩니다.');
    setDraftNodes(prev => prev.filter(item => item.key !== node.key));
    return true;
  };

  const commitEditNode = async (node: TreeNode, value: string): Promise<boolean> => {
    const trimmed = value.trim();
    if (!trimmed) return false;

    if (node.isDraft) {
      return commitAddNode(node, trimmed);
    }

    const nextNumber = Number(trimmed);
    const to: { year?: number; semester?: number; grade?: number; subject?: string; domainName?: string } = {};
    if (node.kind === 'year') {
      if (!nextNumber) {
        alert('학년도는 숫자로 입력하세요.');
        return false;
      }
      to.year = nextNumber;
    } else if (node.kind === 'semester') {
      if (!nextNumber) {
        alert('학기는 숫자로 입력하세요.');
        return false;
      }
      to.semester = nextNumber;
    } else if (node.kind === 'grade') {
      if (!nextNumber) {
        alert('학년은 숫자로 입력하세요.');
        return false;
      }
      to.grade = nextNumber;
    } else if (node.kind === 'subject') {
      to.subject = trimmed;
    } else {
      to.domainName = trimmed;
    }

    if (!node.year) return false;
    await criteriaApi.updateStandardsScope({
      from: { year: node.year, semester: node.semester, grade: node.grade, subject: node.subjectName, domainName: node.domainName },
      to,
    });
    setSelected(null);
    setStandards([]);
    await loadSubjects();
    return true;
  };

  const commitEditing = async () => {
    if (!editing) return;
    const current = editing;
    const node = findNodeByKey(visibleTree, editing.key);
    if (!node) {
      setEditing(null);
      return;
    }
    const ok = current.mode === 'add'
      ? await commitAddNode(node, current.value)
      : await commitEditNode(node, current.value);
    if (ok) setEditing(null);
    else setEditing(current);
  };

  const cancelEditing = () => {
    if (editing?.mode === 'add') setDraftNodes(prev => removeDraftSubtree(prev, editing.key));
    setEditing(null);
  };

  const handleDeleteNode = async (node: TreeNode) => {
    if (node.isDraft) {
      setDraftNodes(prev => removeDraftSubtree(prev, node.key));
      return;
    }
    if (!node.year) return;
    if (!confirm(`${node.label} 아래 성취 기준을 모두 삭제하시겠습니까?`)) return;
    await criteriaApi.deleteStandardsScope({
      year: node.year,
      semester: node.semester,
      grade: node.grade,
      subject: node.subjectName,
      domainName: node.domainName,
    });
    setDraftNodes(prev => removeDraftSubtree(prev, node.key));
    if (isSelectedInScope(node)) {
      clearCriteriaSelection();
    }
    await loadSubjects();
  };

  const spans = useMemo(() => {
    const result: Record<number, number> = {};
    let currentContent = '';
    let startIndex = -1;
    let count = 0;

    standards.forEach((row, i) => {
      if (row.content !== currentContent) {
        if (startIndex !== -1) {
          result[startIndex] = count;
        }
        currentContent = row.content;
        startIndex = i;
        count = 1;
      } else {
        count++;
        result[i] = 0;
      }
    });
    if (startIndex !== -1) {
      result[startIndex] = count;
    }
    return result;
  }, [standards]);

  const selectedKey = selected
    ? `${selected.year}-${selected.semester}-${selected.grade}-${selected.subject}-${selected.domain_name}`
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <PageSidebar
        title="성취 기준 관리"
        upload={(
          <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${uploading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? '처리 중...' : '성취 기준 파일 업로드'}
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} disabled={uploading} />
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
              <p>나이스 &gt; 교과담임 &gt; 성적 &gt; 지필/수행선행작업 &gt; 성취기준관리에서</p>
              <p>성취기준 및 성취수준(평가기준)을 조회 및 출력 후 파일 저장 버튼을 눌러 엑셀(XLS)를 선택하세요.</p>
            </div>
          )}
          {message && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 leading-snug">{message}</p>}
          {error && (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <p className="whitespace-pre-wrap leading-snug">{error}</p>
            </div>
          )}
          </>
        )}
        tree={(
        <TreeView
          nodes={visibleTree}
          empty={(
            <div className="text-center py-10 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">성취 기준 파일을 업로드하세요</p>
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
                const sub = item.subject;
                const key = sub ? `${sub.year}-${sub.semester}-${sub.grade}-${sub.subject}-${item.domainName}` : '';
                return item.kind === 'domain' && !!sub && selectedKey === key;
              }}
              clickable={(item) => item.kind === 'domain' && !!item.subject}
              onSelect={(item) => item.subject && loadStandards(item.subject)}
              canAdd={(item) => item.kind !== 'subject' && item.kind !== 'domain'}
              onAdd={handleAddNode}
              canDelete={(item) => item.kind !== 'domain'}
              onDelete={(item) => {
                const isSubject = !!item.subject && !item.domainName;
                if (isSubject) handleDeleteSubject(item.subject!);
                else handleDeleteNode(item);
              }}
              actions={(item) => item.kind === 'subject' ? (
                item.subject?.has_source ? (
                  <TreeIconButton
                    title="원본 파일 다운로드"
                    onClick={() => handleDownloadSubject(item.subject!)}
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

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">왼쪽에서 영역을 선택하세요</div>
        ) : (
          <>
            <PageHeader
              eyebrow={(
                <>
                  {selected.year}학년도 {selected.semester}학기 {selected.grade}학년 &gt; {selected.subject}
                </>
              )}
              title={selected.domain_name}
            />

            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-center px-4 py-2 font-medium w-32">코드</th>
                      <th className="text-left px-4 py-2 font-medium w-[35%]">성취기준</th>
                      <th className="text-center px-3 py-2 font-medium w-16">수준</th>
                      <th className="text-left px-4 py-2 font-medium">성취수준</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standards.map((row, i) => {
                      const span = spans[i];
                      return (
                        <tr key={row.id} className="border-t border-gray-100 align-top">

                          {span > 0 && (
                            <td rowSpan={span} className="px-2 py-2 font-mono text-xs text-blue-600 text-center border-r border-gray-100 align-middle">
                              {row.code}
                            </td>
                          )}
                          {span > 0 && (
                            <td rowSpan={span} className="px-4 py-2 text-gray-700 border-r border-gray-100 align-middle">
                              {row.content.replace(row.code, '').trim()}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center font-bold text-gray-700 border-r border-gray-100">{row.level}</td>
                          <td className="px-4 py-2 text-gray-700 leading-relaxed">{row.description}</td>
                        </tr>
                      );
                    })}
                    {standards.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">데이터가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
