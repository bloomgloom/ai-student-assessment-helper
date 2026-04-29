import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { recordsApi, criteriaApi, classesApi } from '../lib/api';
import ArtifactViewer from '../components/ArtifactViewer';
import {
  Download, Loader2, Users, ChevronRight, ChevronDown, Folder,
  FileSpreadsheet, Bot, Save, Upload, Square, AlertCircle, CheckCircle2, Trash2
} from 'lucide-react';

interface ClassItem {
  id: number;
  year: number;
  semester: number;
  grade: number;
  subject: string;
  room: string;
  scoring_filename: string;
  setech_filename: string;
}

interface Student {
  id: number;
  student_num: number;
  name: string;
  personal_num?: string;
}

interface EvalItem {
  name: string;
  excel_col: string;
  item_type: 'llm' | 'formula';
  sort_order: number;
}

interface ContentItem {
  student_id: number;
  content_type: string;
  domain: string;
  content: string;
}

interface TreeNode {
  year?: number;
  semester?: number;
  grade?: number;
  subject?: string;
  room?: string;
  domain?: string;
  classItem?: ClassItem;
  label: string;
  children?: TreeNode[];
}

function buildTree(classes: ClassItem[], subjects: any[]): TreeNode[] {
  const result: TreeNode[] = [];
  const yMap = new Map<number, TreeNode>();

  for (const c of classes) {
    if (!yMap.has(c.year)) {
      const node: TreeNode = { year: c.year, label: `${c.year}학년도`, children: [] };
      yMap.set(c.year, node);
      result.push(node);
    }
    const yNode = yMap.get(c.year)!;

    let sNode = yNode.children!.find(n => n.semester === c.semester);
    if (!sNode) {
      sNode = { semester: c.semester, label: `${c.semester}학기`, children: [] };
      yNode.children!.push(sNode);
    }

    let gNode = sNode.children!.find(n => n.grade === c.grade);
    if (!gNode) {
      gNode = { grade: c.grade, label: `${c.grade}학년`, children: [] };
      sNode.children!.push(gNode);
    }

    let subNode = gNode.children!.find(n => n.subject === c.subject);
    if (!subNode) {
      subNode = { subject: c.subject, label: c.subject, children: [] };
      gNode.children!.push(subNode);
    }

    let roomNode = subNode.children!.find(n => n.room === c.room);
    if (!roomNode) {
      roomNode = { room: c.room, label: c.room, classItem: c, children: [] };
      subNode.children!.push(roomNode);
    }
  }
  return result;
}

function TreeNodeView({
  node, depth, selectedClassId, selectedDomain, onSelectDomain, onSelectClass, onDeleteClass
}: {
  node: TreeNode;
  depth: number;
  selectedClassId: number | null;
  selectedDomain: string | null;
  onSelectDomain: (c: ClassItem, d: string) => void;
  onSelectClass: (c: ClassItem) => void;
  onDeleteClass: (c: ClassItem) => void;
}) {
  const isRoom = !!node.room;
  const [open, setOpen] = useState(true);
  const pl = `${8 + depth * 14}px`;

  const isRoomSelected = isRoom && selectedClassId === node.classItem!.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer font-medium transition-colors border-l-2 whitespace-nowrap group ${
          isRoomSelected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent hover:bg-gray-100 text-gray-700'
        }`}
        style={{ paddingLeft: pl }}
        onClick={() => { if (isRoom) onSelectClass(node.classItem!); }}
      >
        {!isRoom && (
          <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="p-0.5 hover:bg-gray-200 rounded text-gray-400">
            {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          </div>
        )}
        {isRoom && <div className="w-[14px] shrink-0" />}
        {isRoom ? <FileSpreadsheet size={14} className="text-green-500 shrink-0" /> : <Folder size={14} className="text-blue-400 shrink-0" />}
        <span className="text-sm whitespace-nowrap flex-1">{node.label}</span>
        {isRoom && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-all shrink-0"
            onClick={(e) => { e.stopPropagation(); onDeleteClass(node.classItem!); }}
            title="강의실 삭제"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {open && node.children?.map((child, idx) => (
        <TreeNodeView
          key={idx} node={child} depth={depth + 1}
          selectedClassId={selectedClassId}
          selectedDomain={selectedDomain}
          onSelectDomain={onSelectDomain}
          onSelectClass={onSelectClass}
          onDeleteClass={onDeleteClass}
        />
      ))}
    </div>
  );
}

export default function RecordsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');

  const [students, setStudents] = useState<Student[]>([]);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);
  
  const [contents, setContents] = useState<Record<string, any>>({});
  const [evalItemsMap, setEvalItemsMap] = useState<Record<string, EvalItem[]>>({});
  
  const [saving, setSaving] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number; message: string } | null>(null);
  const [uploadingZip, setUploadingZip] = useState(false);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);
  const [showScoring, setShowScoring] = useState(true);
  const [showSetech, setShowSetech] = useState(true);
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());

  // 파일 업로드 상태
  const [uploadingScoring, setUploadingScoring] = useState(false);
  const [uploadingSetech, setUploadingSetech] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const scoringFileRef = useRef<HTMLInputElement>(null);
  const setechFileRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchAbortRef = useRef<AbortController | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  // ── Column resize ──────────────────────────────────────────────────────────
  const handleResizeStart = (e: React.MouseEvent, key: string, defW: number) => {
    e.preventDefault();
    const sx = e.clientX;
    const sw = colWidths[key] ?? defW;
    const onMove = (mv: MouseEvent) =>
      setColWidths(p => ({ ...p, [key]: Math.max(30, sw + mv.clientX - sx) }));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyNav = (e: React.KeyboardEvent, ri: number, ci: number) => {
    const isTA = (e.currentTarget as HTMLElement).tagName === 'TEXTAREA';
    let dr = 0, dc = 0;
    if (e.key === 'ArrowUp') dr = -1;
    else if (e.key === 'ArrowDown') dr = 1;
    else if (!isTA && e.key === 'ArrowLeft') dc = -1;
    else if (!isTA && e.key === 'ArrowRight') dc = 1;
    else return;
    const t = tableRef.current?.querySelector<HTMLElement>(
      `[data-row="${ri + dr}"][data-col="${ci + dc}"]`
    );
    if (t) { e.preventDefault(); t.focus(); }
  };

  const loadData = useCallback(async () => {
    const [cr, sr] = await Promise.all([classesApi.getAll(), criteriaApi.getSubjects()]);
    setClasses(cr.data);
    setSubjects(sr.data);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setTree(buildTree(classes, subjects)); }, [classes, subjects]);

  const parseContent = (c: string) => {
    try {
      if (c.trim().startsWith('{')) return JSON.parse(c);
      return { text: c };
    } catch {
      return { text: c };
    }
  };

  const loadDomainData = useCallback(async (c: ClassItem) => {
    // Load students
    const str = await fetch(`/api/classes/${c.id}/students`);
    const sData = await str.json();
    sData.sort((a: Student, b: Student) => a.student_num - b.student_num);
    setStudents(sData);
    setSelectedStudentIds(new Set());

    const subj = subjects.find(s => s.year === c.year && s.semester === c.semester && s.grade === c.grade && s.subject === c.subject);
    if (!subj) return;

    // Load eval items for all fixed domains
    const eMap: Record<string, EvalItem[]> = {};
    for (const fd of subj.fixedDomains) {
      const er = await criteriaApi.getEval(c.year, c.semester, c.grade, c.subject, fd.name);
      eMap[fd.name] = er.data;
    }
    setEvalItemsMap(eMap);

    // Load all content
    const cr = await fetch(`/api/records/classes/${c.id}/content`);
    const cData = await cr.json() as ContentItem[];
    const map: Record<string, any> = {};
    for (const item of cData) {
      map[`${item.student_id}_${item.content_type}_${item.domain}`] = parseContent(item.content);
    }
    setContents(map);
  }, [subjects]);

  const handleSelectClass = useCallback(async (c: ClassItem) => {
    setSelectedClass(c);
    setSelectedDomain('');
    setDomainFilter('all');
    // 업로드된 파일 기준으로 토글 초기화
    const hasScoring = !!c.scoring_filename;
    const hasSetech = !!c.setech_filename;
    setShowScoring(hasScoring);
    setShowSetech(hasSetech || !hasScoring); // 채점만 있어도 세특은 숨김
    if (hasScoring && !hasSetech) { setShowScoring(true); setShowSetech(false); }
    else if (!hasScoring && hasSetech) { setShowScoring(false); setShowSetech(true); }
    else { setShowScoring(true); setShowSetech(true); }
    await loadDomainData(c);
  }, [loadDomainData]);

  const handleScoringUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScoring(true);
    setUploadMsg(null);
    try {
      const res = await classesApi.uploadScoring(file);
      const d = res.data;
      const warnings: string[] = [];
      if (d.domainMismatch) warnings.push(`영역 불일치:\n${d.domainMismatch}`);
      if (d.studentMismatch?.length) warnings.push(`학생 명단 불일치:\n${d.studentMismatch.join('\n')}`);
      const baseMsg = `채점 파일 업로드 완료 — ${d.subject} ${d.room}, 영역 ${d.domainsCount}개, 학생 ${d.studentsCount}명`;
      setUploadMsg(warnings.length
        ? { type: 'warn', text: `${baseMsg}\n\n⚠ ${warnings.join('\n')}` }
        : { type: 'success', text: baseMsg });
      const refreshed = (await classesApi.getAll()).data as ClassItem[];
      setClasses(refreshed);
      const found = refreshed.find(c =>
        c.year === d.year && c.semester === d.semester &&
        c.grade === d.grade && c.subject === d.subject && c.room === d.room
      );
      if (found) await handleSelectClass(found);
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err?.response?.data?.error || String(err) });
    } finally {
      setUploadingScoring(false);
      if (scoringFileRef.current) scoringFileRef.current.value = '';
    }
  };

  const handleSetechUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSetech(true);
    setUploadMsg(null);
    try {
      const res = await classesApi.uploadSetech(file);
      const d = res.data;
      const warnings: string[] = [];
      if (d.studentMismatch?.length) warnings.push(`학생 명단 불일치:\n${d.studentMismatch.join('\n')}`);
      const baseMsg = `세특 파일 업로드 완료 — ${d.subject} ${d.room}, 학생 ${d.studentsCount}명`;
      setUploadMsg(warnings.length
        ? { type: 'warn', text: `${baseMsg}\n\n⚠ ${warnings.join('\n')}` }
        : { type: 'success', text: baseMsg });
      const refreshed = (await classesApi.getAll()).data as ClassItem[];
      setClasses(refreshed);
      const found = refreshed.find(c =>
        c.year === d.year && c.semester === d.semester &&
        c.grade === d.grade && c.subject === d.subject && c.room === d.room
      );
      if (found) await handleSelectClass(found);
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err?.response?.data?.error || String(err) });
    } finally {
      setUploadingSetech(false);
      if (setechFileRef.current) setechFileRef.current.value = '';
    }
  };

  const handleDeleteClass = useCallback(async (c: ClassItem) => {
    const label = `${c.year}학년도 ${c.semester}학기 ${c.grade}학년 ${c.subject} ${c.room}`;
    if (!confirm(`"${label}" 강의실을 삭제하시겠습니까?\n채점 파일과 세특 파일도 함께 삭제됩니다.`)) return;
    try {
      await classesApi.delete(c.id);
      if (selectedClass?.id === c.id) {
        setSelectedClass(null);
        setStudents([]);
        setContents({});
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || '삭제 중 오류가 발생했습니다.');
    }
  }, [selectedClass, loadData]);

  const handleSelectDomain = useCallback(async (c: ClassItem, d: string) => {
    // Legacy support if needed, but tree no longer calls this.
  }, []);

  const updateContent = (studentId: number, type: 'scoring' | 'setech', field: string, value: string, explicitDomain?: string) => {
    setContents(prev => {
      const targetDomain = explicitDomain || selectedDomain;
      const key = `${studentId}_${type}_${targetDomain}`;
      const obj = prev[key] || {};
      
      const newObj = { ...obj, [field]: value };
      
      // Auto-calc total if evaluating scoring
      if (type === 'scoring' && explicitDomain && evalItemsMap[explicitDomain]) {
        let total = 0;
        let base = 0;
        evalItemsMap[explicitDomain].forEach(item => {
           if (item.item_type === 'formula') base = Number(item.excel_col) || 0;
           else if (item.item_type === 'llm') total += (Number(newObj[item.name]) || 0);
        });
        newObj['total'] = total + base;
      }
      
      return { ...prev, [key]: newObj };
    });
  };

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.has(student.id)),
    [students, selectedStudentIds]
  );
  const allStudentsSelected = students.length > 0 && selectedStudentIds.size === students.length;

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleAllStudents = () => {
    setSelectedStudentIds(prev => (
      prev.size === students.length ? new Set() : new Set(students.map(student => student.id))
    ));
  };

  const applyGeneratedContent = (studentId: number, type: 'scoring' | 'setech', domain: string, content: string | null) => {
    if (!content) return;
    setContents(prev => ({
      ...prev,
      [`${studentId}_${type}_${domain}`]: parseContent(content),
    }));
  };

  const handleStopBatch = () => {
    batchAbortRef.current?.abort();
    setBatchProgress(prev => prev ? { ...prev, message: '중단 중...' } : prev);
  };

  const handleSaveAll = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      const promises = [];
      const types = ['scoring', 'setech'];
      
      for (const s of students) {
        // Save comprehensive setech
        const compKey = `${s.id}_setech___SUBJECT_COMPREHENSIVE__`;
        if (contents[compKey]) {
          promises.push(
            recordsApi.saveStudentContent(s.id, {
              content_type: 'setech',
              domain: '__SUBJECT_COMPREHENSIVE__',
              content: JSON.stringify(contents[compKey])
            })
          );
        }
        
        // Save other domains
        const subj = subjects.find(sub => sub.year === selectedClass.year && sub.subject === selectedClass.subject);
        const allDomains = [...(subj?.fixedDomains||[]), ...(subj?.customDomains||[])];
        for (const d of allDomains) {
          for (const type of types) {
            const key = `${s.id}_${type}_${d.name}`;
            if (contents[key]) {
              promises.push(
                recordsApi.saveStudentContent(s.id, {
                  content_type: type,
                  domain: d.name,
                  content: JSON.stringify(contents[key])
                })
              );
            }
          }
        }
      }
      await Promise.all(promises);
      alert('저장되었습니다.');
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchGenerate = async (type: 'scoring' | 'setech', explicitDomain?: string) => {
    if (!selectedClass) return;

    const subj = subjects.find(s =>
      s.year === selectedClass.year && s.semester === selectedClass.semester &&
      s.grade === selectedClass.grade && s.subject === selectedClass.subject
    );

    let domainsToProcess: string[];
    if (explicitDomain) {
      domainsToProcess = [explicitDomain];
    } else if (domainFilter === 'all') {
      domainsToProcess = (subj?.fixedDomains || []).map((d: any) => d.name);
    } else {
      domainsToProcess = [domainFilter];
    }
    if (domainsToProcess.length === 0) return;
    const targetStudents = selectedStudents.length > 0 ? selectedStudents : students;
    if (targetStudents.length === 0) return;

    const domainLabel = domainsToProcess.length > 1
      ? `전체 ${domainsToProcess.length}개 영역`
      : (domainsToProcess[0] === '__SUBJECT_COMPREHENSIVE__' ? '종합 세특' : domainsToProcess[0]);
    const typeLabel = type === 'setech'
      ? (explicitDomain === '__SUBJECT_COMPREHENSIVE__' ? '세특' : '활동')
      : '채점';
    const targetLabel = selectedStudents.length > 0 ? `선택한 ${targetStudents.length}명` : `${targetStudents.length}명 전체`;
    if (!confirm(`${targetLabel} "${domainLabel}" ${typeLabel} 일괄 생성하시겠습니까?`)) return;

    setBatchGenerating(true);
    const controller = new AbortController();
    batchAbortRef.current = controller;

    try {
      for (const targetDomain of domainsToProcess) {
        if (controller.signal.aborted) break;
        setBatchProgress({ completed: 0, total: targetStudents.length, message: `[${targetDomain}] 준비 중...` });
        try {
          const response = await fetch('/api/ai/generate-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              classId: selectedClass.id,
              domain: targetDomain,
              contentType: type,
              studentIds: targetStudents.map(student => student.id),
            }),
          });
          const reader = response.body?.getReader();
          if (!reader) continue;
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'progress' || event.type === 'error') {
                  applyGeneratedContent(event.studentId, event.contentType || type, event.domain || targetDomain, event.content || null);
                  setBatchProgress({
                    completed: event.completed, total: event.total,
                    message: event.type === 'error' ? `오류: ${event.name}` : `[${targetDomain}] ${event.name} 완료`,
                  });
                } else if (event.type === 'done') {
                  setBatchProgress({ completed: event.completed, total: event.completed, message: `[${targetDomain}] 완료!` });
                } else if (event.type === 'fatal') {
                  setBatchProgress({
                    completed: event.completed || 0,
                    total: event.total || targetStudents.length,
                    message: `오류: ${event.error || '일괄 생성 실패'}`,
                  });
                }
              } catch { /* ignore */ }
            }
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') {
            setBatchProgress(prev => prev ? { ...prev, message: '중단되었습니다.' } : prev);
            break;
          }
          console.error(`Batch generate error for ${targetDomain}:`, e);
        }
      }

      if (!controller.signal.aborted) {
        await loadDomainData(selectedClass);
        setTimeout(() => setBatchProgress(null), 3000);
      }
    } finally {
      batchAbortRef.current = null;
      setBatchGenerating(false);
    }
  };

  const handleBulkZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClass || domainFilter === 'all' || !e.target.files?.length) return;
    const file = e.target.files[0];
    
    setUploadingZip(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('domain', domainFilter);

    try {
      const res = await fetch(`/api/artifacts/bulk-upload/${selectedClass.id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      
      alert(data.message);
      await loadDomainData(selectedClass);
      setArtifactRefreshKey(k => k + 1);
    } catch (err: any) {
      alert(`오류: ${err.message}`);
    } finally {
      setUploadingZip(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (type: 'setech' | 'scoring') => {
    if (!selectedClass) return;
    try {
      const r = await fetch(`/api/records/export/${selectedClass.id}?type=${type}`);
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Content-Disposition 헤더에서 원본 파일명 추출
      const disposition = r.headers.get('Content-Disposition') || '';
      const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
      const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : plainMatch
          ? plainMatch[1]
          : `${type === 'setech' ? '세특' : '채점'}_${selectedClass.year}_${selectedClass.subject}_${selectedClass.room}.xlsx`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('내보내기 실패'); }
  };

  const isScoringDomain = evalItems.length > 0;

  // ── Table column layout ────────────────────────────────────────────────────
  const tableLayout = useMemo(() => {
    if (!selectedClass) return { visibleDomains: [] as any[], domainCols: new Map<string, any[]>(), compSetechColIdx: -1 };
    const subj = subjects.find(s =>
      s.year === selectedClass.year && s.semester === selectedClass.semester &&
      s.grade === selectedClass.grade && s.subject === selectedClass.subject
    );
    const fixedDomains: any[] = subj?.fixedDomains || [];
    const customDomains: any[] = subj?.customDomains || [];
    const allDomains = [...fixedDomains, ...customDomains];
    const visibleDomains = domainFilter === 'all' ? allDomains : allDomains.filter((d: any) => d.name === domainFilter);

    let fi = 0;
    const domainCols = new Map<string, Array<{ id: string; label: string; type: string; fi: number }>>();
    for (const d of visibleDomains) {
      const isFixed = !!fixedDomains.find((fd: any) => fd.name === d.name);
      const evalList = (evalItemsMap[d.name] || []) as EvalItem[];
      const cols: Array<{ id: string; label: string; type: string; fi: number }> = [];
      if (showScoring && isFixed) {
        cols.push({ id: 'artifact', label: '산출물', type: 'artifact', fi: -1 });
        evalList.filter(e => e.item_type === 'llm').forEach(e =>
          cols.push({ id: e.name, label: `${e.name} (${e.excel_col})`, type: 'llm', fi: fi++ })
        );
        if (evalList.some(e => e.item_type === 'formula'))
          cols.push({ id: 'total', label: '합계', type: 'total', fi: -1 });
      }
      if (showSetech) {
        if (!cols.find(c => c.id === 'artifact'))
          cols.push({ id: 'artifact', label: '산출물', type: 'artifact', fi: -1 });
        cols.push({ id: 'setech', label: '활동', type: 'setech', fi: fi++ });
      }
      domainCols.set(d.name, cols);
    }
    return { visibleDomains, domainCols, compSetechColIdx: showSetech ? fi : -1 };
  }, [selectedClass, subjects, domainFilter, evalItemsMap, showScoring, showSetech]);

  // ── Frozen column widths & sticky left offsets ─────────────────────────────
  const cw = {
    chk:  colWidths['_chk']  ?? 40,
    cls:  colWidths['_cls']  ?? 48,
    num:  colWidths['_num']  ?? 48,
    name: colWidths['_name'] ?? 80,
  };
  const sl = {
    chk:  0,
    cls:  cw.chk,
    num:  cw.chk + cw.cls,
    name: cw.chk + cw.cls + cw.num,
  };
  const separatorShadow = '2px 0 5px rgba(0,0,0,0.08)';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 shrink-0 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">기록 관리</h2>
          <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${uploadingScoring ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
            {uploadingScoring ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadingScoring ? '처리 중...' : '채점 파일 업로드'}
            <input ref={scoringFileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleScoringUpload} disabled={uploadingScoring} />
          </label>
          <label className={`flex items-center justify-center gap-1.5 w-full py-2 text-xs rounded-md cursor-pointer border ${uploadingSetech ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}>
            {uploadingSetech ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadingSetech ? '처리 중...' : '세특 파일 업로드'}
            <input ref={setechFileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleSetechUpload} disabled={uploadingSetech} />
          </label>
          {uploadMsg && (
            <div className={`flex items-start gap-1.5 text-xs rounded p-2 border ${
              uploadMsg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
              uploadMsg.type === 'warn'  ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                                           'bg-green-50 border-green-200 text-green-700'
            }`}>
              {uploadMsg.type === 'error' ? <AlertCircle size={12} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}
              <p className="whitespace-pre-wrap leading-snug">{uploadMsg.text}</p>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto py-2">
          {tree.map((node, idx) => (
            <TreeNodeView
              key={idx} node={node} depth={0}
              selectedClassId={selectedClass?.id || null}
              selectedDomain={selectedDomain}
              onSelectDomain={handleSelectDomain}
              onSelectClass={handleSelectClass}
              onDeleteClass={handleDeleteClass}
            />
          ))}
          {tree.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">수업이 없습니다</p>
          )}
        </div>
      </div>

      {!selectedClass ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">왼쪽에서 영역을 선택하세요</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 툴바 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-100 p-1 rounded gap-1 border border-gray-200">
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    !selectedClass?.scoring_filename ? 'opacity-40 cursor-not-allowed text-gray-400' :
                    showScoring ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  disabled={!selectedClass?.scoring_filename}
                  onClick={() => {
                    if (showScoring && !showSetech) { setShowScoring(false); setShowSetech(true); }
                    else { setShowScoring(!showScoring); }
                  }}
                >
                  채점
                </button>
                <button
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    !selectedClass?.setech_filename ? 'opacity-40 cursor-not-allowed text-gray-400' :
                    showSetech ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  disabled={!selectedClass?.setech_filename}
                  onClick={() => {
                    if (showSetech && !showScoring) { setShowSetech(false); setShowScoring(true); }
                    else { setShowSetech(!showSetech); }
                  }}
                >
                  세특
                </button>
              </div>

              <select
                className="input text-xs py-1.5 px-2 ml-2 bg-gray-50 font-medium text-gray-700"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
              >
                <option value="all">전체 영역 보기</option>
                {subjects.find(s => s.subject === selectedClass.subject)?.fixedDomains.map((d: any) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
                {subjects.find(s => s.subject === selectedClass.subject)?.customDomains.map((d: any) => (
                  <option key={d.name} value={d.name}>{d.name} (세특)</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {domainFilter !== 'all' && (
                <label className={`flex items-center gap-1 cursor-pointer text-xs py-1.5 px-3 rounded text-white font-medium ${uploadingZip ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                  {uploadingZip ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  업로드
                  <input type="file" accept=".zip" className="hidden" onChange={handleBulkZipUpload} disabled={uploadingZip} ref={fileInputRef} />
                </label>
              )}

              {showScoring && (
                <button className="btn-secondary text-xs py-1.5 ml-2" onClick={() => handleBatchGenerate('scoring')} disabled={batchGenerating}>
                  <Bot size={12} /> 채점
                </button>
              )}

              {showSetech && (
                <button className="btn-secondary text-xs py-1.5 ml-2" onClick={() => handleBatchGenerate('setech')} disabled={batchGenerating}>
                  <Bot size={12} /> 활동
                </button>
              )}

              {showSetech && (
                <button className="btn-secondary text-xs py-1.5 ml-2" onClick={() => handleBatchGenerate('setech', '__SUBJECT_COMPREHENSIVE__')} disabled={batchGenerating}>
                  <Bot size={12} /> 세특
                </button>
              )}

              <button className="btn-primary text-xs py-1.5 ml-2" onClick={handleSaveAll} disabled={saving}>
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} 저장
              </button>

              {showScoring !== showSetech && (
                <button className="btn-success text-xs py-1.5 ml-2" onClick={() => handleExport(showScoring ? 'scoring' : 'setech')}>
                  <Download size={12} /> 다운로드
                </button>
              )}
            </div>
          </div>

          {batchProgress && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3 text-sm shrink-0">
              <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-blue-700">{batchProgress.message}</span>
                  <span className="text-gray-500">{batchProgress.completed}/{batchProgress.total}</span>
                </div>
                <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${(batchProgress.completed / Math.max(batchProgress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
              <button
                className="btn-secondary text-xs py-1.5 shrink-0"
                onClick={handleStopBatch}
                disabled={!batchGenerating}
                title="중단"
              >
                <Square size={12} /> 중단
              </button>
            </div>
          )}

          {/* 테이블 뷰 */}
          <div className="flex-1 overflow-auto bg-white">
            {students.length === 0 ? (
              <div className="py-20 text-center text-gray-400">학생 명단이 없습니다.</div>
            ) : (
              <table
                ref={tableRef}
                className="text-sm text-left border-collapse"
                style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}
              >
                {/* ── HEADER ── */}
                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                  <tr>
                    {/* Frozen: checkbox */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center select-none"
                        style={{ left: sl.chk, width: cw.chk, minWidth: cw.chk }}>
                      <div className="flex justify-center items-center py-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                          checked={allStudentsSelected} onChange={toggleAllStudents} title="전체 선택/해제" />
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                           onMouseDown={e => handleResizeStart(e, '_chk', 40)} />
                    </th>
                    {/* Frozen: 반 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                        style={{ left: sl.cls, width: cw.cls, minWidth: cw.cls }}>
                      반
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                           onMouseDown={e => handleResizeStart(e, '_cls', 48)} />
                    </th>
                    {/* Frozen: 번호 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                        style={{ left: sl.num, width: cw.num, minWidth: cw.num }}>
                      번호
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                           onMouseDown={e => handleResizeStart(e, '_num', 48)} />
                    </th>
                    {/* Frozen: 이름 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                        style={{ left: sl.name, width: cw.name, minWidth: cw.name, boxShadow: separatorShadow }}>
                      이름
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                           onMouseDown={e => handleResizeStart(e, '_name', 80)} />
                    </th>

                    {/* Domain group headers */}
                    {tableLayout.visibleDomains.map((d: any) => {
                      const cols = tableLayout.domainCols.get(d.name) || [];
                      if (!cols.length) return null;
                      return (
                        <th key={d.name} colSpan={cols.length}
                            className="px-2 py-1.5 font-semibold text-gray-700 text-center border-b border-r bg-gray-100/50 select-none">
                          {d.name}
                        </th>
                      );
                    })}

                    {/* Comp setech header */}
                    {showSetech && (
                      <th rowSpan={2} className="relative px-4 py-3 font-semibold text-gray-800 border-b bg-blue-50/50 select-none"
                          style={{ width: colWidths['_comp'] ?? 320, minWidth: colWidths['_comp'] ?? 320 }}>
                        종합 세특 (과목 공통)
                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                             onMouseDown={e => handleResizeStart(e, '_comp', 320)} />
                      </th>
                    )}
                  </tr>
                  <tr>
                    {tableLayout.visibleDomains.map((d: any) => {
                      const cols = tableLayout.domainCols.get(d.name) || [];
                      return cols.map((c: any) => {
                        const wk = `${d.name}||${c.id}`;
                        const defW = c.type === 'setech' ? 200 : c.type === 'artifact' ? 56 : c.type === 'total' ? 64 : 80;
                        const w = colWidths[wk] ?? defW;
                        return (
                          <th key={`${d.name}_${c.id}`}
                              className="relative px-2 py-1.5 font-medium text-gray-600 border-b border-r text-center select-none"
                              style={{ width: w, minWidth: w }}>
                            {c.label}
                            <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                                 onMouseDown={e => handleResizeStart(e, wk, defW)} />
                          </th>
                        );
                      });
                    })}
                  </tr>
                </thead>

                {/* ── BODY ── */}
                <tbody className="divide-y divide-gray-100">
                  {students.map((s, rowIdx) => {
                    const compSetechData = contents[`${s.id}_setech___SUBJECT_COMPREHENSIVE__`] || {};
                    const classNum = Math.floor((s.student_num % 10000) / 100);
                    const stuNum = s.student_num % 100;

                    return (
                      <tr key={s.id} className="hover:bg-blue-50/10 transition-colors">
                        {/* Frozen: checkbox */}
                        <td className="sticky z-10 bg-white border-r text-center"
                            style={{ left: sl.chk, width: cw.chk, minWidth: cw.chk }}>
                          <div className="flex justify-center py-2">
                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                              checked={selectedStudentIds.has(s.id)} onChange={() => toggleStudentSelection(s.id)} />
                          </div>
                        </td>
                        {/* Frozen: 반 */}
                        <td className="sticky z-10 bg-white border-r text-center text-gray-500 font-mono px-1 py-2"
                            style={{ left: sl.cls, width: cw.cls, minWidth: cw.cls }}>
                          {classNum}
                        </td>
                        {/* Frozen: 번호 */}
                        <td className="sticky z-10 bg-white border-r text-center text-gray-500 font-mono px-1 py-2"
                            style={{ left: sl.num, width: cw.num, minWidth: cw.num }}>
                          {stuNum}
                        </td>
                        {/* Frozen: 이름 */}
                        <td className="sticky z-10 bg-white border-r font-medium text-gray-800 text-center px-1 py-2"
                            style={{ left: sl.name, width: cw.name, minWidth: cw.name, boxShadow: separatorShadow }}>
                          {s.name}
                        </td>

                        {/* Domain cells */}
                        {tableLayout.visibleDomains.map((d: any) => {
                          const cols = tableLayout.domainCols.get(d.name) || [];
                          const scoreData = contents[`${s.id}_scoring_${d.name}`] || {};
                          const setechData = contents[`${s.id}_setech_${d.name}`] || {};

                          return cols.map((c: any) => {
                            const wk = `${d.name}||${c.id}`;
                            const defW = c.type === 'setech' ? 200 : c.type === 'artifact' ? 56 : c.type === 'total' ? 64 : 80;
                            const w = colWidths[wk] ?? defW;

                            if (c.type === 'artifact') {
                              return (
                                <td key={`${d.name}_artifact`} className="border-r align-middle text-center p-1"
                                    style={{ width: w, minWidth: w }}>
                                  <ArtifactViewer key={`${s.id}_${d.name}_${artifactRefreshKey}`} studentId={s.id} domain={d.name} />
                                </td>
                              );
                            }
                            if (c.type === 'llm') {
                              return (
                                <td key={`${d.name}_${c.id}`} className="border-r align-top p-1"
                                    style={{ width: w, minWidth: w }}>
                                  <input type="text" className="input w-full text-sm text-center"
                                    value={scoreData[c.id] || ''}
                                    onChange={ev => updateContent(s.id, 'scoring', c.id, ev.target.value, d.name)}
                                    data-row={rowIdx} data-col={c.fi}
                                    onKeyDown={e => handleKeyNav(e, rowIdx, c.fi)}
                                  />
                                </td>
                              );
                            }
                            if (c.type === 'total') {
                              return (
                                <td key={`${d.name}_total`} className="border-r text-center font-bold text-blue-600 bg-blue-50/30 align-middle p-2"
                                    style={{ width: w, minWidth: w }}>
                                  {scoreData.total || 0}
                                </td>
                              );
                            }
                            if (c.type === 'setech') {
                              return (
                                <td key={`${d.name}_setech`} className="border-r align-top p-1"
                                    style={{ width: w, minWidth: w }}>
                                  <textarea className="textarea w-full text-sm resize-y" style={{ minHeight: 80 }}
                                    value={setechData.text || ''}
                                    onChange={ev => updateContent(s.id, 'setech', 'text', ev.target.value, d.name)}
                                    data-row={rowIdx} data-col={c.fi}
                                    onKeyDown={e => handleKeyNav(e, rowIdx, c.fi)}
                                  />
                                </td>
                              );
                            }
                            return null;
                          });
                        })}

                        {/* Comp setech */}
                        {showSetech && (
                          <td className="align-top p-1"
                              style={{ width: colWidths['_comp'] ?? 320, minWidth: colWidths['_comp'] ?? 320 }}>
                            <textarea className="textarea w-full text-sm resize-y bg-blue-50/20 border-blue-100" style={{ minHeight: 80 }}
                              value={compSetechData.text || ''}
                              onChange={ev => updateContent(s.id, 'setech', 'text', ev.target.value, '__SUBJECT_COMPREHENSIVE__')}
                              data-row={rowIdx} data-col={tableLayout.compSetechColIdx}
                              onKeyDown={e => handleKeyNav(e, rowIdx, tableLayout.compSetechColIdx)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
