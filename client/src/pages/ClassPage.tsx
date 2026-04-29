import { useState, useEffect, useCallback, useRef } from 'react';
import { classesApi } from '../lib/api';
import {
  Upload, Trash2, ChevronRight, ChevronDown, School,
  BookOpen, Users, AlertCircle, Loader2, Trophy,
} from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────

interface ClassItem {
  id: number;
  year: number;
  semester: number;
  grade: number;
  subject: string;
  room: string;
  filename: string;
  scoring_filename: string;
  setech_filename: string;
  created_at: string;
}

interface Domain {
  id: number;
  name: string;
  max_score: number;
  excel_col: string;
  sort_order: number;
}

interface ClassStudent {
  id: number;
  student_num: number;
  name: string;
}

interface ClassDetail extends ClassItem {
  domains: Domain[];
}

// ── 트리 구조 타입 ────────────────────────────────────────────────────────

interface TreeNode {
  label: string;
  children?: TreeNode[];
  classItem?: ClassItem; // 리프 노드만
}

function buildTree(classes: ClassItem[]): TreeNode[] {
  const yearMap = new Map<number, Map<number, Map<number, Map<string, ClassItem[]>>>>();

  for (const cls of classes) {
    if (!yearMap.has(cls.year)) yearMap.set(cls.year, new Map());
    const semMap = yearMap.get(cls.year)!;
    if (!semMap.has(cls.semester)) semMap.set(cls.semester, new Map());
    const gradeMap = semMap.get(cls.semester)!;
    if (!gradeMap.has(cls.grade)) gradeMap.set(cls.grade, new Map());
    const subjectMap = gradeMap.get(cls.grade)!;
    if (!subjectMap.has(cls.subject)) subjectMap.set(cls.subject, []);
    subjectMap.get(cls.subject)!.push(cls);
  }

  const result: TreeNode[] = [];
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => b[0] - a[0])) {
    const yearNode: TreeNode = { label: `${year}학년도`, children: [] };
    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      const semNode: TreeNode = { label: `${semester}학기`, children: [] };
      for (const [grade, subjectMap] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        const gradeNode: TreeNode = { label: `${grade}학년`, children: [] };
        for (const [subject, rooms] of [...subjectMap.entries()].sort()) {
          const subjectNode: TreeNode = { label: subject, children: [] };
          for (const cls of rooms.sort((a, b) => a.room.localeCompare(b.room))) {
            subjectNode.children!.push({ label: cls.room || cls.filename, classItem: cls });
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

// ── 트리 노드 컴포넌트 ────────────────────────────────────────────────────

function TreeNodeView({
  node,
  depth,
  selectedId,
  onSelect,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  selectedId: number | null;
  onSelect: (cls: ClassItem) => void;
  onDelete: (id: number) => void;
}) {
  const isLeaf = !!node.classItem;
  const [open, setOpen] = useState(true);

  const pl = `${8 + depth * 14}px`;

  if (isLeaf) {
    const cls = node.classItem!;
    const isSelected = selectedId === cls.id;
    return (
      <div
        className={`group flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer rounded text-sm transition-colors ${
          isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'
        }`}
        style={{ paddingLeft: pl }}
        onClick={() => onSelect(cls)}
      >
        <BookOpen size={13} className="shrink-0 text-green-500" />
        <span className="flex-1 truncate">{node.label}</span>
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400"
          onClick={(e) => { e.stopPropagation(); onDelete(cls.id); }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 cursor-pointer hover:bg-gray-50 rounded text-sm text-gray-600 font-medium"
        style={{ paddingLeft: pl }}
      >
        <div 
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="p-0.5 hover:bg-gray-200 rounded text-gray-500"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        <span>{node.label}</span>
      </div>
      {open && node.children?.map((child, i) => (
        <TreeNodeView
          key={i}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────

export default function ClassPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<ClassDetail | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const scoringFileRef = useRef<HTMLInputElement>(null);
  const setechFileRef = useRef<HTMLInputElement>(null);
  const [scoringFile, setScoringFile] = useState<File | null>(null);
  const [setechFile, setSetechFile] = useState<File | null>(null);

  const loadClasses = useCallback(async () => {
    const r = await classesApi.getAll();
    const list: ClassItem[] = r.data;
    setClasses(list);
    setTree(buildTree(list));
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const handleSelect = async (cls: ClassItem) => {
    setLoadingDetail(true);
    try {
      const [detailRes, studentsRes] = await Promise.all([
        classesApi.getOne(cls.id),
        classesApi.getStudents(cls.id),
      ]);
      setSelected(detailRes.data);
      setStudents(studentsRes.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('수업을 삭제하면 관련 데이터가 모두 삭제됩니다. 계속하시겠습니까?')) return;
    await classesApi.delete(id);
    if (selected?.id === id) { setSelected(null); setStudents([]); }
    await loadClasses();
  };

  const handleUpload = async () => {
    if (!scoringFile) {
      setUploadError('채점 파일을 먼저 선택하세요.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const r = await classesApi.upload(scoringFile, setechFile);
      const d = r.data;
      setUploadResult(
        `✅ "${d.subject} ${d.room}" 수업 등록 완료 — 영역 ${d.domainsCount}개, 학생 ${d.studentsCount}명`
      );
      setScoringFile(null);
      setSetechFile(null);
      await loadClasses();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string; hint?: string } } })
              .response?.data?.error ?? String(err))
          : String(err);
      const hint =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { hint?: string } } }).response?.data?.hint
          : undefined;
      setUploadError(hint ? `${msg}\n${hint}` : msg);
    } finally {
      setUploading(false);
      if (scoringFileRef.current) scoringFileRef.current.value = '';
      if (setechFileRef.current) setechFileRef.current.value = '';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── 좌측: 트리 ── */}
      <div className="w-64 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">수업 관리</h2>

          <label className="flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
            <Upload size={13} />
            {scoringFile ? '채점 파일 선택됨' : '채점 파일 선택'}
            <input
              ref={scoringFileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={(e) => setScoringFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
          </label>
          {scoringFile && <p className="text-[11px] text-gray-500 truncate" title={scoringFile.name}>{scoringFile.name}</p>}

          <label className="flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
            <Upload size={13} />
            {setechFile ? '세특 파일 선택됨' : '세특 파일 선택'}
            <input
              ref={setechFileRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={(e) => setSetechFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
          </label>
          {setechFile && <p className="text-[11px] text-gray-500 truncate" title={setechFile.name}>{setechFile.name}</p>}

          <button
            className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md border transition-colors ${
              uploading || !scoringFile
                ? 'bg-gray-100 text-gray-400 border-gray-200'
                : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'
            }`}
            onClick={handleUpload}
            disabled={uploading || !scoringFile}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? '처리 중...' : '수업 등록'}
          </button>

          {/* 업로드 결과 */}
          {uploadResult && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 leading-snug">
              {uploadResult}
            </p>
          )}
          {uploadError && (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <p className="whitespace-pre-wrap leading-snug">{uploadError}</p>
            </div>
          )}
        </div>

        {/* 트리 */}
        <div className="flex-1 overflow-y-auto p-1.5">
          {tree.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <School size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">채점 파일을 업로드하면<br />수업 목록이 표시됩니다</p>
              <p className="text-xs mt-2 text-gray-300 leading-tight">
                파일명 예시:<br />
                수행평가 파일일괄등록 - 2026학년도<br />
                1학기 2 정보(3)_전체영역_1강의실.xlsx
              </p>
            </div>
          ) : (
            tree.map((node, i) => (
              <TreeNodeView
                key={i}
                node={node}
                depth={0}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>

      {/* ── 우측: 수업 상세 ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <School size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">왼쪽 트리에서 강의실을 선택하세요</p>
          </div>
        </div>
      ) : loadingDetail ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* 수업 정보 카드 */}
          <div className="card p-5">
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <School size={16} className="text-blue-500" />
              수업 정보
            </h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {[
                ['학년도', `${selected.year}학년도`],
                ['학기',   `${selected.semester}학기`],
                ['학년',   `${selected.grade}학년`],
                ['과목',    selected.subject],
                ['강의실',  selected.room],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-gray-500 w-14 shrink-0">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-gray-400 mt-3 truncate" title={selected.filename}>
              채점 파일: {selected.scoring_filename || selected.filename}
            </p>
            {selected.setech_filename && (
              <p className="text-xs text-gray-400 mt-1 truncate" title={selected.setech_filename}>
                세특 파일: {selected.setech_filename}
              </p>
            )}
          </div>

          {/* 수행평가 영역 */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Trophy size={15} className="text-yellow-500" />
              수행평가 영역 ({selected.domains.length}개)
            </h3>
            {selected.domains.length === 0 ? (
              <p className="text-sm text-gray-400">영역 정보가 없습니다.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 text-xs">
                    <th className="text-left py-1.5 font-medium">영역명</th>
                    <th className="text-center py-1.5 font-medium w-16">만점</th>
                    <th className="text-center py-1.5 font-medium w-16">Excel 열</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.domains.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 font-medium">{d.name}</td>
                      <td className="py-1.5 text-center text-blue-600 font-mono">{d.max_score}점</td>
                      <td className="py-1.5 text-center text-gray-400 font-mono text-xs">{d.excel_col}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2 text-xs text-gray-400">합계</td>
                    <td className="pt-2 text-center font-mono text-blue-700 font-semibold">
                      {selected.domains.reduce((s, d) => s + d.max_score, 0)}점
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* 학생 명단 */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users size={15} className="text-green-500" />
              학생 명단 ({students.length}명)
            </h3>
            {students.length === 0 ? (
              <p className="text-sm text-gray-400">학생 정보가 없습니다.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {students.map((s) => {
                  const classNum = Math.floor((s.student_num % 10000) / 100);
                  const stuNum   = s.student_num % 100;
                  return (
                    <div key={s.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="text-gray-400 font-mono w-16 shrink-0">
                        {classNum}반 {String(stuNum).padStart(2, '0')}번
                      </span>
                      <span className="font-medium text-gray-800">{s.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
