import { useEffect, useRef, useState, useMemo } from 'react';
import { criteriaApi } from '../lib/api';
import { AlertCircle, BookOpen, Loader2, Upload, ChevronDown, ChevronRight, ClipboardCheck, Folder, Download, Trash2, X } from 'lucide-react';

interface SubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  domain_name: string;
  credit: number;
  standards_count: number;
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
  label: string;
  children?: TreeNode[];
  subject?: SubjectItem;
  domainName?: string;
}

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
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => b[0] - a[0])) {
    const yearNode: TreeNode = { label: `${year}학년도`, children: [] };
    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      const semNode: TreeNode = { label: `${semester}학기`, children: [] };
      for (const [grade, subjectMap] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        const gradeNode: TreeNode = { label: `${grade}학년`, children: [] };
        for (const [subject, domains] of [...subjectMap.entries()].sort()) {
          const subjectNode: TreeNode = { label: subject, children: [], subject: domains[0] };
          for (const d of domains.sort((a, b) => a.domain_name.localeCompare(b.domain_name))) {
            subjectNode.children!.push({ label: d.domain_name, subject: d, domainName: d.domain_name });
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
  node, depth, selectedKey, onSelect, onDownloadSubject, onDeleteSubject
}: {
  node: TreeNode;
  depth: number;
  selectedKey: string | null;
  onSelect: (sub: SubjectItem) => void;
  onDownloadSubject: (sub: SubjectItem) => void;
  onDeleteSubject: (sub: SubjectItem) => void;
}) {
  const isLeaf = !!node.domainName;
  const isSubject = !!node.subject && !node.domainName;
  const [open, setOpen] = useState(true);
  const pl = `${8 + depth * 14}px`;

  if (isLeaf) {
    const sub = node.subject!;
    const key = `${sub.year}-${sub.semester}-${sub.grade}-${sub.subject}-${node.domainName}`;
    const isSelected = selectedKey === key;
    return (
      <div
        className={`group flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer rounded text-sm transition-colors ${isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'
          }`}
        style={{ paddingLeft: pl }}
        onClick={() => onSelect(sub)}
      >
        <ClipboardCheck size={13} className="shrink-0 text-green-500" />
        <span className="flex-1 truncate">{node.label}</span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 py-1 cursor-pointer hover:bg-gray-50 rounded text-sm text-gray-600 font-medium"
        style={{ paddingLeft: pl }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="p-0.5 hover:bg-gray-200 rounded text-gray-500"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        <span className="flex-1">{node.label}</span>
        {isSubject && (
          <>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-blue-100 rounded text-blue-500"
              onClick={(e) => { e.stopPropagation(); onDownloadSubject(node.subject!); }}
              title="원본 파일 다운로드"
            >
              <Download size={12} />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400"
              onClick={(e) => { e.stopPropagation(); onDeleteSubject(node.subject!); }}
              title="삭제"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
      {open && node.children?.map((child, i) => (
        <TreeNodeView
          key={i} node={child} depth={depth + 1}
          selectedKey={selectedKey}
          onSelect={onSelect}
          onDownloadSubject={onDownloadSubject}
          onDeleteSubject={onDeleteSubject}
        />
      ))}
    </div>
  );
}

export default function CriteriaPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<SubjectItem | null>(null);
  const [standards, setStandards] = useState<StandardRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('hideCriteriaGuide') !== '1');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSubjects = async () => {
    const res = await criteriaApi.getStandardSubjects();
    setSubjects(res.data);
    setTree(buildTree(res.data));
  };

  const loadStandards = async (subject: SubjectItem) => {
    setSelected(subject);
    const res = await criteriaApi.getStandards(subject.year, subject.semester, subject.grade, subject.subject);
    const filtered = res.data.filter((r: StandardRow) => r.domain_name === subject.domain_name);
    setStandards(filtered);
  };

  useEffect(() => { loadSubjects(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await criteriaApi.uploadStandards(file);
      const data = res.data;
      setMessage(`${data.year}학년도 ${data.semester}학기 ${data.grade}학년 ${data.subject}(${data.credit}): 성취/평가기준 ${data.standardsCount}개 업로드`);
      await loadSubjects();
      setSelected(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hideGuide = () => {
    localStorage.setItem('hideCriteriaGuide', '1');
    setShowGuide(false);
  };

  const handleDownloadSubject = (sub: SubjectItem) => {
    window.location.href = criteriaApi.sourceUrl('standards', sub.year, sub.semester, sub.grade, sub.subject);
  };

  const handleDeleteSubject = async (sub: SubjectItem) => {
    if (!confirm(`${sub.subject} 성취/평가기준 파일과 데이터를 삭제하시겠습니까?`)) return;
    await criteriaApi.deleteSource('standards', sub.year, sub.semester, sub.grade, sub.subject);
    setSelected(null);
    setStandards([]);
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
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">기준 관리</h2>
          <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${uploading ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? '처리 중...' : '성취기준 파일 업로드'}
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleUpload} disabled={uploading} />
          </label>
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
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {tree.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">성취/평가기준 파일을 업로드하세요</p>
            </div>
          ) : tree.map((node, i) => (
            <TreeNodeView
              key={i} node={node} depth={0}
              selectedKey={selectedKey}
              onSelect={loadStandards}
              onDownloadSubject={handleDownloadSubject}
              onDeleteSubject={handleDeleteSubject}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">왼쪽에서 영역을 선택하세요</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">{selected.subject} - {selected.domain_name} 성취/평가기준</h3>
              <p className="text-xs text-gray-500 mt-1">
                {selected.year}학년도 {selected.semester}학기 {selected.grade}학년 · {selected.credit}학점
              </p>
            </div>
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
        )}
      </div>
    </div>
  );
}
