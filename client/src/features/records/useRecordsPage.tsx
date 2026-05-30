import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { recordsApi, criteriaApi, classesApi, aiApi } from '../../lib/api';
import { useAiBatchStore } from '../../stores/aiBatchStore';
import { useRecordsUnsavedStore } from '../../stores/recordsUnsavedStore';
import { Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { RECORDS_GUIDE_KEY, RECORDS_LAST_CLASS_KEY, RECORDS_PAGE_TEXT, RECORDS_VIEW_PREFS_PREFIX, SUBJECT_COMPREHENSIVE_DOMAIN } from './constants';
import { RecordsCollapsedTree } from './RecordsCollapsedTree';
import { ClassItem, ContentItem, EvalItem, RecordsTreeNode, ScoringContent, SpellcheckResult, Student } from './types';
import { useRecordsHeader } from './useRecordsHeader';
import { useRecordsTree } from './useRecordsTree';
import { useRecordsUpload } from './useRecordsUpload';

const ArtifactViewer = lazy(() => import('../../components/ArtifactViewer'));

const FROZEN_DEFAULT_WIDTHS = {
  chk: 32,
  cls: 32,
  num: 40,
  name: 64,
};

function getDomainColumnDefaultWidth(type: string) {
  if (type === 'comments' || type === 'comments_item') return 200;
  if (type === 'artifact') return 56;
  if (type === 'total') return 64;
  return 80;
}

function hasScoringCriteria(items: EvalItem[] | undefined) {
  return !!items?.some(item => item.item_type !== 'formula');
}

function normalizeRecordCriteriaTitles(items: any[]) {
  const recordItems = items.filter(item => item.type === '항목');
  const sourceItems = recordItems.length > 0 ? recordItems : [{ title: '기록' }];
  return sourceItems.map((item, idx) => ({
    title: String(item.title || '').trim() || (sourceItems.length === 1 ? '기록' : `기록 ${idx + 1}`),
  }));
}

function normalizeStoredValue(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function stableContentStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableContentStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableContentStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? '');
}

interface RecordsViewPrefs {
  showScoring?: boolean;
  showComments?: boolean;
  showComprehensive?: boolean;
  domainFilter?: string;
}

function recordsViewPrefsKey(classItem: ClassItem) {
  return [
    RECORDS_VIEW_PREFS_PREFIX,
    classItem.year,
    classItem.semester,
    classItem.grade,
    classItem.subject,
  ].join(':');
}

function readRecordsViewPrefs(classItem: ClassItem): RecordsViewPrefs | null {
  try {
    const raw = localStorage.getItem(recordsViewPrefsKey(classItem));
    return raw ? JSON.parse(raw) as RecordsViewPrefs : null;
  } catch {
    return null;
  }
}

function writeRecordsViewPrefs(classItem: ClassItem, prefs: RecordsViewPrefs) {
  localStorage.setItem(recordsViewPrefsKey(classItem), JSON.stringify(prefs));
}

export function useRecordsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');

  const [students, setStudents] = useState<Student[]>([]);
  const [evalItems, setEvalItems] = useState<EvalItem[]>([]);

  const [contents, setContents] = useState<Record<string, any>>({});
  const [savedContents, setSavedContents] = useState<Record<string, any>>({});
  const [evalItemsMap, setEvalItemsMap] = useState<Record<string, EvalItem[]>>({});
  const [commentsItemsMap, setCommentsItemsMap] = useState<Record<string, Array<{ title: string }>>>({});

  const [saving, setSaving] = useState(false);
  const [uploadingZip, setUploadingZip] = useState(false);
  const [uploadingFullRecords, setUploadingFullRecords] = useState(false);
  const [artifactRefreshKey, setArtifactRefreshKey] = useState(0);
  const [spellcheckingIds, setSpellcheckingIds] = useState<Set<number>>(new Set());
  const [spellcheckResults, setSpellcheckResults] = useState<Record<number, SpellcheckResult>>({});
  const [spellcheckProgress, setSpellcheckProgress] = useState<{ completed: number; total: number } | null>(null);
  const [spellcheckStopping, setSpellcheckStopping] = useState(false);
  const [showScoring, setShowScoring] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [showComprehensive, setShowComprehensive] = useState(true);
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const [showGuide, setShowGuide] = useState(() => localStorage.getItem(RECORDS_GUIDE_KEY) !== '1');
  const recordsTree = useRecordsTree(classes);
  const spellcheckAbortRef = useRef<AbortController | null>(null);
  const recordsRestoredRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fullRecordsInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const aiBatchJob = useAiBatchStore(state => state.currentJob);
  const aiBatchUpdates = useAiBatchStore(state => state.updates);
  const startAiBatch = useAiBatchStore(state => state.startBatch);
  const isAiCellLocked = useAiBatchStore(state => state.isCellLocked);
  const setHasUnsavedRecords = useRecordsUnsavedStore(state => state.setHasUnsavedChanges);
  const appliedUpdateCountRef = useRef(0);
  const restoringViewPrefsRef = useRef(false);
  const batchGenerating = aiBatchJob?.status === 'running' || aiBatchJob?.status === 'stopping';
  const isDirty = useMemo(
    () => stableContentStringify(contents) !== stableContentStringify(savedContents),
    [contents, savedContents]
  );

  useEffect(() => {
    setHasUnsavedRecords(isDirty);
    return () => setHasUnsavedRecords(false);
  }, [isDirty, setHasUnsavedRecords]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Column resize ──────────────────────────────────────────────────────────
  const handleResizeStart = (e: React.MouseEvent, key: string, defW: number) => {
    e.preventDefault();
    const sx = e.clientX;
    const sw = colWidths[key] ?? defW;
    const minWidth = key.startsWith('_') ? 24 : 30;
    const onMove = (mv: MouseEvent) =>
      setColWidths(p => ({ ...p, [key]: Math.max(minWidth, sw + mv.clientX - sx) }));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const handleKeyNav = (e: React.KeyboardEvent, ri: number, ci: number) => {
    if (e.key !== 'Tab' && e.key !== 'Enter') return;

    const cells = Array.from(
      tableRef.current?.querySelectorAll<HTMLElement>('[data-row][data-col]:not(:disabled)') ?? []
    ).sort((a, b) => {
      const ar = Number(a.dataset.row ?? 0);
      const br = Number(b.dataset.row ?? 0);
      if (ar !== br) return ar - br;
      return Number(a.dataset.col ?? 0) - Number(b.dataset.col ?? 0);
    });
    if (!cells.length) return;

    let target: HTMLElement | undefined;
    if (e.key === 'Tab') {
      const currentIndex = cells.findIndex(cell => Number(cell.dataset.row) === ri && Number(cell.dataset.col) === ci);
      if (currentIndex < 0) return;
      target = cells[currentIndex + (e.shiftKey ? -1 : 1)];
    } else {
      const direction = e.shiftKey ? -1 : 1;
      const sameColumnCells = cells.filter(cell => Number(cell.dataset.col) === ci);
      target = direction > 0
        ? sameColumnCells.find(cell => Number(cell.dataset.row) > ri)
        : sameColumnCells.reverse().find(cell => Number(cell.dataset.row) < ri);
    }

    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  const loadData = useCallback(async () => {
    const [cr, sr] = await Promise.all([classesApi.getAll(), criteriaApi.getSubjects()]);
    setClasses(cr.data);
    setSubjects(sr.data);
    return { classes: cr.data as ClassItem[], subjects: sr.data };
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const parseContent = (c: string) => {
    try {
      if (c.trim().startsWith('{')) return JSON.parse(c);
      return { text: c };
    } catch {
      return { text: c };
    }
  };

  const countTextBytes = (text: string) => new TextEncoder().encode(text).length;

  const renderTaggedSpellcheck = (taggedText: string) => {
    const nodes: React.ReactNode[] = [];
    const regex = /\[CHANGE\]([\s\S]*?)\[\/CHANGE\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(taggedText)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(taggedText.slice(lastIndex, match.index));
      }
      nodes.push(
        <span key={`${match.index}-${nodes.length}`} className="text-red-600 font-medium">
          {match[1]}
        </span>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < taggedText.length) nodes.push(taggedText.slice(lastIndex));
    return nodes;
  };

  const loadDomainData = useCallback(async (c: ClassItem) => {
    // Load students
    const str = await fetch(`/api/classes/${c.id}/students`);
    const sData = await str.json();
    sData.sort((a: Student, b: Student) => a.student_num - b.student_num);
    setStudents(sData);
    setSelectedStudentIds(new Set());

    const subj = subjects.find(s => s.year === c.year && s.semester === c.semester && s.grade === c.grade && s.subject === c.subject);
    if (!subj) return { evalItemsMap: {}, commentsItemsMap: {} };

    // Load eval items for all fixed domains
    const eMap: Record<string, EvalItem[]> = {};
    for (const fd of subj.fixedDomains) {
      const er = await criteriaApi.getEval(c.year, c.semester, c.grade, c.subject, fd.name);
      eMap[fd.name] = er.data;
    }
    setEvalItemsMap(eMap);

    // Load comments activity items for all domains
    const siMap: Record<string, Array<{ title: string }>> = {};
    const allDoms = [...subj.fixedDomains, ...subj.customDomains];
    await Promise.all(allDoms.map(async (d: any) => {
      try {
        const sr = await criteriaApi.getComments(c.year, c.semester, c.grade, c.subject, d.name);
        siMap[d.name] = normalizeRecordCriteriaTitles(sr.data as any[]);
      } catch { siMap[d.name] = []; }
    }));
    setCommentsItemsMap(siMap);

    // Load all content
    const cr = await fetch(`/api/records/classes/${c.id}/content`);
    const cData = await cr.json() as ContentItem[];
    const map: Record<string, any> = {};
    for (const item of cData) {
      map[`${item.student_id}_${item.content_type}_${item.domain}`] = parseContent(item.content);
    }
    setContents(map);
    setSavedContents(map);
    return { evalItemsMap: eMap, commentsItemsMap: siMap };
  }, [subjects]);

  const handleSelectClass = useCallback(async (c: ClassItem) => {
    if (isDirty && !confirm('저장되지 않은 변경 사항이 있습니다. 이동하시겠습니까?')) return;
    restoringViewPrefsRef.current = true;
    setSelectedClass(c);
    setSelectedDomain('');
    setDomainFilter('all');
    setShowScoring(false);
    setShowComments(false);
    setShowComprehensive(true);
    localStorage.setItem(RECORDS_LAST_CLASS_KEY, String(c.id));
    const loaded = await loadDomainData(c);
    const subj = subjects.find(s => s.year === c.year && s.semester === c.semester && s.grade === c.grade && s.subject === c.subject);
    const fixedDomains = subj?.fixedDomains || [];
    const allDomains = [...fixedDomains, ...(subj?.customDomains || [])];
    const defaultShowScoring = fixedDomains.some((d: any) => hasScoringCriteria(loaded.evalItemsMap[d.name]));
    const defaultShowComments = allDomains.some((d: any) => (loaded.commentsItemsMap[d.name] || []).length > 0);
    const savedPrefs = readRecordsViewPrefs(c);
    const restoredShowScoring = savedPrefs?.showScoring ?? defaultShowScoring;
    const restoredShowComments = savedPrefs?.showComments ?? defaultShowComments;
    const restoredShowComprehensive = savedPrefs?.showComprehensive ?? true;
    const allowedDomains = [
      ...fixedDomains,
      ...(restoredShowComments ? (subj?.customDomains || []) : []),
    ].map((d: any) => d.name);
    const restoredDomain = savedPrefs?.domainFilter && (savedPrefs.domainFilter === 'all' || allowedDomains.includes(savedPrefs.domainFilter))
      ? savedPrefs.domainFilter
      : 'all';
    const finalShowScoring = defaultShowScoring ? restoredShowScoring : false;
    const finalShowComments = defaultShowComments ? restoredShowComments : false;
    const finalShowComprehensive = !finalShowScoring && !finalShowComments && !restoredShowComprehensive
      ? true
      : restoredShowComprehensive;
    setDomainFilter(restoredDomain);
    setShowScoring(finalShowScoring);
    setShowComments(finalShowComments);
    setShowComprehensive(finalShowComprehensive);
    window.setTimeout(() => {
      restoringViewPrefsRef.current = false;
      writeRecordsViewPrefs(c, {
        showScoring: finalShowScoring,
        showComments: finalShowComments,
        showComprehensive: finalShowComprehensive,
        domainFilter: restoredDomain,
      });
    }, 0);
  }, [isDirty, loadDomainData, subjects]);

  // 마지막 선택 강의실 복원
  useEffect(() => {
    if (recordsRestoredRef.current || classes.length === 0 || subjects.length === 0) return;
    recordsRestoredRef.current = true;
    const savedId = localStorage.getItem(RECORDS_LAST_CLASS_KEY);
    if (!savedId) return;
    const cls = classes.find(c => c.id === Number(savedId));
    if (cls) handleSelectClass(cls);
  }, [classes, subjects, handleSelectClass]);

  const hideGuide = () => {
    localStorage.setItem(RECORDS_GUIDE_KEY, '1');
    setShowGuide(false);
  };

  const recordsUpload = useRecordsUpload({
    selectedClass,
    setClasses,
    setSelectedClass,
    setStudents,
    setContents,
    setSavedContents,
    onSelectClass: handleSelectClass,
  });

  const handleDeleteClass = useCallback(async (c: ClassItem) => {
    const label = `${c.year}학년도 ${c.semester}학기 ${c.grade}학년 ${c.subject} ${c.room}`;
    if (!confirm(`"${label}" 강의실을 삭제하시겠습니까?\n채점 파일과 세특 파일도 함께 삭제됩니다.`)) return;
    try {
      await classesApi.delete(c.id);
      if (selectedClass?.id === c.id) {
        setSelectedClass(null);
        setStudents([]);
        setContents({});
        setSavedContents({});
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || '삭제 중 오류가 발생했습니다.');
    }
  }, [selectedClass, loadData]);

  const handleDeleteScoring = useCallback(async (c: ClassItem) => {
    const label = `${c.year}학년도 ${c.semester}학기 ${c.grade}학년 ${c.subject} ${c.room}`;
    if (!confirm(`"${label}" 채점 파일을 삭제하시겠습니까?\n수업 데이터와 세특 파일은 유지됩니다.`)) return;
    try {
      await classesApi.deleteScoring(c.id);
      if (selectedClass?.id === c.id) {
        setSelectedClass(prev => prev ? { ...prev, scoring_filename: '' } : prev);
        setShowScoring(false);
        setShowComments(!!selectedClass.comments_filename);
        setShowComprehensive(!!selectedClass.comments_filename);
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || '채점 파일 삭제 중 오류가 발생했습니다.');
    }
  }, [selectedClass, loadData]);

  const handleDeleteComments = useCallback(async (c: ClassItem) => {
    const label = `${c.year}학년도 ${c.semester}학기 ${c.grade}학년 ${c.subject} ${c.room}`;
    if (!confirm(`"${label}" 세특 파일을 삭제하시겠습니까?\n학생 개인번호도 초기화됩니다.`)) return;
    try {
      await classesApi.deleteComments(c.id);
      if (selectedClass?.id === c.id) {
        setSelectedClass(prev => prev ? { ...prev, comments_filename: '' } : prev);
        setShowComments(false);
        setShowComprehensive(false);
        setShowScoring(!!selectedClass.scoring_filename);
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || '세특 파일 삭제 중 오류가 발생했습니다.');
    }
  }, [selectedClass, loadData]);

  const handleSelectDomain = useCallback(async (c: ClassItem, d: string) => {
    // Legacy support if needed, but tree no longer calls this.
  }, []);

  const updateContent = (studentId: number, type: 'scoring' | 'comments', field: string, value: string, explicitDomain?: string) => {
    setContents(prev => {
      const targetDomain = explicitDomain || selectedDomain;
      const key = `${studentId}_${type}_${targetDomain}`;
      const obj = prev[key] || {};

      const newObj = { ...obj, [field]: value };
      if (type === 'scoring' && field !== 'total' && newObj.__reasons) {
        const nextReasons = { ...(newObj.__reasons as Record<string, string>) };
        delete nextReasons[field];
        newObj.__reasons = nextReasons;
      }

      // Auto-calc total if evaluating scoring
      if (type === 'scoring' && explicitDomain && evalItemsMap[explicitDomain]) {
        let total = 0;
        let base = 0;
        evalItemsMap[explicitDomain].forEach(item => {
          if (item.item_type === 'formula') base = Number(item.score) || 0;
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

  const applyGeneratedContent = (studentId: number, type: 'scoring' | 'comments', domain: string, content: string | null) => {
    if (!content) return;
    setContents(prev => ({
      ...prev,
      [`${studentId}_${type}_${domain}`]: parseContent(content),
    }));
  };

  const isContentFieldDirty = (key: string, field: string) => {
    return normalizeStoredValue(contents[key]?.[field]) !== normalizeStoredValue(savedContents[key]?.[field]);
  };

  const isScoringReasonDirty = (key: string, field: string) => {
    return normalizeStoredValue((contents[key] as ScoringContent | undefined)?.__reasons?.[field])
      !== normalizeStoredValue((savedContents[key] as ScoringContent | undefined)?.__reasons?.[field]);
  };

  const dirtyControlClass = (dirty: boolean) =>
    dirty ? 'bg-amber-50 border-amber-300 focus:border-amber-500 focus:ring-amber-400' : '';

  useEffect(() => {
    if (aiBatchUpdates.length < appliedUpdateCountRef.current) {
      appliedUpdateCountRef.current = 0;
    }
    if (!selectedClass) return;
    const pendingUpdates = aiBatchUpdates.slice(appliedUpdateCountRef.current);
    if (!pendingUpdates.length) return;

    setContents(prev => {
      let next = prev;
      for (const update of pendingUpdates) {
        if (!students.some(student => student.id === update.studentId)) continue;
        next = {
          ...next,
          [`${update.studentId}_${update.contentType}_${update.domain}`]: parseContent(update.content),
        };
      }
      return next;
    });
    appliedUpdateCountRef.current = aiBatchUpdates.length;
  }, [aiBatchUpdates, selectedClass, students]);

  const runSpellcheckComprehensive = async (studentId: number, text: string, signal?: AbortSignal) => {
    const trimmed = text.trim();
    if (!trimmed) {
      alert('맞춤법 검사할 세특 내용이 없습니다.');
      return;
    }

    setSpellcheckingIds(prev => new Set(prev).add(studentId));

    try {
      const res = await aiApi.spellcheck({ text }, signal);
      setSpellcheckResults(prev => ({
        ...prev,
        [studentId]: {
          taggedText: res.data.taggedText || res.data.correctedText || text,
          correctedText: res.data.correctedText || text,
          correctionCount: Number(res.data.correctionCount || 0),
        },
      }));
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      const message = err?.response?.data?.error || '맞춤법 검사 중 오류가 발생했습니다.';
      alert(message);
    } finally {
      setSpellcheckingIds(prev => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  const handleBatchSpellcheck = async () => {
    const targetStudents = selectedStudents.length > 0 ? selectedStudents : students;
    if (!targetStudents.length) return;

    const controller = new AbortController();
    spellcheckAbortRef.current = controller;
    setSpellcheckStopping(false);
    setSpellcheckProgress({ completed: 0, total: targetStudents.length });
    try {
      for (let i = 0; i < targetStudents.length; i++) {
        if (controller.signal.aborted) break;
        const student = targetStudents[i];
        const key = `${student.id}_comments_${SUBJECT_COMPREHENSIVE_DOMAIN}`;
        const text = contents[key]?.text || '';
        if (text.trim()) await runSpellcheckComprehensive(student.id, text, controller.signal);
        setSpellcheckProgress({ completed: i + 1, total: targetStudents.length });
      }
    } finally {
      setSpellcheckProgress(null);
      setSpellcheckStopping(false);
      spellcheckAbortRef.current = null;
    }
  };

  const applySpellcheckResult = async (studentId: number) => {
    const result = spellcheckResults[studentId];
    if (!result) return;

    const key = `${studentId}_comments_${SUBJECT_COMPREHENSIVE_DOMAIN}`;
    const nextContent = { text: result.correctedText };
    setContents(prev => ({ ...prev, [key]: nextContent }));
  };

  const handleSaveAll = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      const promises = [];
      const savedKeys: string[] = [];
      const enabledDomainTypes = [
        ...(showScoring ? ['scoring'] : []),
        ...(showComments ? ['comments'] : []),
      ];
      const subj = subjects.find(sub =>
        sub.year === selectedClass.year &&
        sub.semester === selectedClass.semester &&
        sub.grade === selectedClass.grade &&
        sub.subject === selectedClass.subject
      );
      const domainPool = [
        ...(subj?.fixedDomains || []),
        ...(showComments ? (subj?.customDomains || []) : []),
      ];
      const domainsToSave = domainFilter === 'all'
        ? domainPool
        : domainPool.filter((d: any) => d.name === domainFilter);

      for (const s of students) {
        // Save comprehensive comments
        const compKey = `${s.id}_comments_${SUBJECT_COMPREHENSIVE_DOMAIN}`;
        if (showComprehensive && contents[compKey]) {
          savedKeys.push(compKey);
          promises.push(
            recordsApi.saveStudentContent(s.id, {
              content_type: 'comments',
              domain: SUBJECT_COMPREHENSIVE_DOMAIN,
              content: JSON.stringify(contents[compKey])
            })
          );
        }

        // Save other domains
        for (const d of domainsToSave) {
          for (const type of enabledDomainTypes) {
            const key = `${s.id}_${type}_${d.name}`;
            if (contents[key]) {
              savedKeys.push(key);
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
      setSavedContents(prev => {
        const next = { ...prev };
        for (const key of savedKeys) next[key] = contents[key];
        return next;
      });
      alert('저장되었습니다.');
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContent = async () => {
    if (!selectedClass) return;

    const targetStudents = selectedStudents.length > 0 ? selectedStudents : students;
    if (targetStudents.length === 0) return;

    const enabledDomainTypes = [
      ...(showScoring ? ['scoring'] : []),
      ...(showComments ? ['comments'] : []),
    ];
    if (enabledDomainTypes.length === 0 && !showComprehensive) return;

    const subj = subjects.find(sub =>
      sub.year === selectedClass.year &&
      sub.semester === selectedClass.semester &&
      sub.grade === selectedClass.grade &&
      sub.subject === selectedClass.subject
    );
    const domainPool = [
      ...(subj?.fixedDomains || []),
      ...(showComments ? (subj?.customDomains || []) : []),
    ];
    const domainsToDelete = domainFilter === 'all'
      ? domainPool.map((d: any) => d.name)
      : domainPool.filter((d: any) => d.name === domainFilter).map((d: any) => d.name);

    const domainLabel = domainFilter === 'all' ? '전체 영역' : domainFilter;
    const typeLabels = [
      ...(showScoring ? ['채점'] : []),
      ...(showComments ? ['기록'] : []),
      ...(showComprehensive ? ['세특'] : []),
    ];
    const typeLabel = typeLabels.join(', ');
    const targetLabel = selectedStudents.length > 0 ? `선택한 ${targetStudents.length}명` : `${targetStudents.length}명 전체`;

    if (!confirm(`${targetLabel}의 "${domainLabel}" ${typeLabel} 기록 데이터를 정말 삭제하시겠습니까?\n(학생 명단은 유지되며 생성된 기록 내용만 삭제됩니다)`)) return;

    setDeleting(true);
    try {
      const studentIds = selectedStudents.length > 0 ? selectedStudents.map(s => s.id) : undefined;
      const requests = [];
      if (enabledDomainTypes.length > 0) {
        for (const domain of domainsToDelete) {
          requests.push(recordsApi.deleteStudentContent({
            classId: selectedClass.id,
            studentIds,
            domain,
            contentTypes: enabledDomainTypes,
          }));
        }
      }
      if (showComprehensive) {
        requests.push(recordsApi.deleteStudentContent({
          classId: selectedClass.id,
          studentIds,
          domain: SUBJECT_COMPREHENSIVE_DOMAIN,
          contentTypes: ['comments'],
        }));
      }
      await Promise.all(requests);

      await loadDomainData(selectedClass);
      alert('삭제되었습니다.');
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchGenerate = async (type: 'scoring' | 'comments', explicitDomain?: string) => {
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
      : (domainsToProcess[0] === SUBJECT_COMPREHENSIVE_DOMAIN ? '세특' : domainsToProcess[0]);
    const typeLabel = type === 'comments'
      ? (explicitDomain === SUBJECT_COMPREHENSIVE_DOMAIN ? '세특' : '기록')
      : '채점';
    const targetLabel = selectedStudents.length > 0 ? `선택한 ${targetStudents.length}명` : `${targetStudents.length}명 전체`;
    if (!confirm(`${targetLabel} "${domainLabel}" ${typeLabel} 일괄 생성하시겠습니까?`)) return;

    void startAiBatch({
      classId: selectedClass.id,
      classLabel: `${selectedClass.year}학년도 ${selectedClass.semester}학기 ${selectedClass.grade}학년 ${selectedClass.subject} ${selectedClass.room}`,
      domains: domainsToProcess,
      contentType: type,
      studentIds: targetStudents.map(student => student.id),
    });
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

  const handleExport = async (type: 'comments' | 'scoring') => {
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
          : `${type === 'comments' ? '세특' : '채점'}_${selectedClass.year}_${selectedClass.subject}_${selectedClass.room}.xlsx`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('내보내기 실패'); }
  };

  const getDownloadFilename = (disposition: string, fallback: string) => {
    const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    return utf8Match ? decodeURIComponent(utf8Match[1]) : plainMatch ? plainMatch[1] : fallback;
  };

  const handleExportFullRecords = async () => {
    if (!selectedClass) return;
    try {
      const r = await recordsApi.exportFull(selectedClass.id);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = getDownloadFilename(
        r.headers['content-disposition'] || '',
        `전체기록_${selectedClass.year}_${selectedClass.subject}_${selectedClass.room}.xlsx`
      );
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('전체 기록 다운로드 실패');
    }
  };

  const handleImportFullRecords = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const confirmMessage = selectedClass
      ? '업로드한 엑셀 내용으로 현재 강의실의 저장된 AI 채점/활동/세특 내용을 덮어씁니다. 계속하시겠습니까?'
      : '엑셀 파일의 기본정보에 있는 강의실로 전체 기록을 업로드합니다. 강의실이 없으면 새로 만듭니다. 계속하시겠습니까?';
    if (!confirm(confirmMessage)) {
      e.target.value = '';
      return;
    }
    setUploadingFullRecords(true);
    try {
      const r = selectedClass
        ? await recordsApi.importFull(selectedClass.id, file)
        : await recordsApi.importFullFile(file);
      const refreshed = await loadData();
      const importedClassId = Number(r.data.classId || selectedClass?.id);
      const targetClass = refreshed.classes.find(c => c.id === importedClassId);
      if (targetClass) await handleSelectClass(targetClass);
      alert(`전체 기록 업로드 완료: ${r.data.saved}개 항목 저장`);
    } catch (err: any) {
      alert(`전체 기록 업로드 실패: ${err?.response?.data?.error || err.message || String(err)}`);
    } finally {
      setUploadingFullRecords(false);
      if (fullRecordsInputRef.current) fullRecordsInputRef.current.value = '';
    }
  };

  const isScoringDomain = evalItems.length > 0;

  // ── Table column layout ────────────────────────────────────────────────────
  const tableLayout = useMemo(() => {
    if (!selectedClass) return { visibleDomains: [] as any[], domainCols: new Map<string, any[]>(), compCommentsColIdx: -1 };
    const subj = subjects.find(s =>
      s.year === selectedClass.year && s.semester === selectedClass.semester &&
      s.grade === selectedClass.grade && s.subject === selectedClass.subject
    );
    const fixedDomains: any[] = subj?.fixedDomains || [];
    const customDomains: any[] = subj?.customDomains || [];
    const allDomains = [...fixedDomains, ...(showComments ? customDomains : [])];
    const visibleDomains = domainFilter === 'all' ? allDomains : allDomains.filter((d: any) => d.name === domainFilter);

    let fi = 0;
    const domainCols = new Map<string, Array<{ id: string; label: string; type: string; fi: number; itemTitle?: string }>>();
    for (const d of visibleDomains) {
      const isFixed = !!fixedDomains.find((fd: any) => fd.name === d.name);
      const evalList = (evalItemsMap[d.name] || []) as EvalItem[];
      const cols: Array<{ id: string; label: string; type: string; fi: number; itemTitle?: string }> = [];
      if (showScoring && isFixed) {
        cols.push({ id: 'artifact', label: '산출물', type: 'artifact', fi: -1 });
        evalList.filter(e => e.item_type === 'llm').forEach(e =>
          cols.push({ id: e.name, label: `${e.name} (${e.score})`, type: 'llm', fi: fi++ })
        );
        if (evalList.some(e => e.item_type === 'formula'))
          cols.push({ id: 'total', label: '합계', type: 'total', fi: -1 });
      }
      if (showComments) {
        if (!cols.find(c => c.id === 'artifact'))
          cols.push({ id: 'artifact', label: '산출물', type: 'artifact', fi: -1 });
        const sitems = commentsItemsMap[d.name] || [];
        if (sitems.length > 0) {
          sitems.forEach((item, i) =>
            cols.push({ id: `comments_${i}`, label: item.title, type: 'comments_item', fi: fi++, itemTitle: item.title })
          );
        }
      }
      domainCols.set(d.name, cols);
    }
    return { visibleDomains, domainCols, compCommentsColIdx: showComprehensive ? fi : -1 };
  }, [selectedClass, subjects, domainFilter, evalItemsMap, commentsItemsMap, showScoring, showComments, showComprehensive]);

  // ── Frozen column widths & sticky left offsets ─────────────────────────────
  const cw = {
    chk: colWidths['_chk'] ?? FROZEN_DEFAULT_WIDTHS.chk,
    cls: colWidths['_cls'] ?? FROZEN_DEFAULT_WIDTHS.cls,
    num: colWidths['_num'] ?? FROZEN_DEFAULT_WIDTHS.num,
    name: colWidths['_name'] ?? FROZEN_DEFAULT_WIDTHS.name,
  };
  const compWidth = colWidths['_comp'] ?? 320;
  const compCountWidth = colWidths['_comp_count'] ?? 74;
  const compSpellWidth = colWidths['_comp_spell'] ?? 320;
  const tableColumnWidths = [
    cw.chk,
    cw.cls,
    cw.num,
    cw.name,
    ...tableLayout.visibleDomains.flatMap((d: any) => {
      const cols = tableLayout.domainCols.get(d.name) || [];
      return cols.map((c: any) => {
        const wk = `${d.name}||${c.id}`;
        return colWidths[wk] ?? getDomainColumnDefaultWidth(c.type);
      });
    }),
    ...(showComprehensive ? [compWidth, compCountWidth, compSpellWidth] : []),
  ];
  const tableTotalWidth = tableColumnWidths.reduce((sum, width) => sum + width, 0);
  const sl = {
    chk: 0,
    cls: cw.chk,
    num: cw.chk + cw.cls,
    name: cw.chk + cw.cls + cw.num,
  };
  const separatorShadow = '2px 0 5px rgba(0,0,0,0.08)';
  const selectedSubject = selectedClass
    ? subjects.find(s =>
      s.year === selectedClass.year &&
      s.semester === selectedClass.semester &&
      s.grade === selectedClass.grade &&
      s.subject === selectedClass.subject
    )
    : undefined;

  const domainsInFilter = useMemo(() => {
    if (!selectedSubject) return [] as any[];
    const allDomains = [
      ...(selectedSubject.fixedDomains || []),
      ...(selectedSubject.customDomains || []),
    ];
    return domainFilter === 'all'
      ? allDomains
      : allDomains.filter((d: any) => d.name === domainFilter);
  }, [selectedSubject, domainFilter]);

  const canShowScoring = useMemo(() => {
    if (!selectedSubject) return false;
    const fixedDomains = selectedSubject.fixedDomains || [];
    const targetDomains = domainFilter === 'all'
      ? fixedDomains
      : fixedDomains.filter((d: any) => d.name === domainFilter);
    return targetDomains.some((d: any) => hasScoringCriteria(evalItemsMap[d.name]));
  }, [selectedSubject, domainFilter, evalItemsMap]);

  const canShowComments = useMemo(() => {
    return domainsInFilter.some((d: any) => (commentsItemsMap[d.name] || []).length > 0);
  }, [domainsInFilter, commentsItemsMap]);

  useEffect(() => {
    if (!selectedClass) return;
    if (!canShowScoring && showScoring) setShowScoring(false);
    if (!canShowComments && showComments) setShowComments(false);
    if (!showScoring && !showComments && !showComprehensive) setShowComprehensive(true);
  }, [selectedClass, canShowScoring, canShowComments, showScoring, showComments, showComprehensive]);

  useEffect(() => {
    if (!selectedSubject || domainFilter === 'all') return;
    const allowedDomains = [
      ...(selectedSubject.fixedDomains || []),
      ...(showComments ? (selectedSubject.customDomains || []) : []),
    ].map((d: any) => d.name);
    if (!allowedDomains.includes(domainFilter)) setDomainFilter('all');
  }, [selectedSubject, showComments, domainFilter]);

  useEffect(() => {
    if (!selectedClass) return;
    if (restoringViewPrefsRef.current) return;
    writeRecordsViewPrefs(selectedClass, {
      showScoring,
      showComments,
      showComprehensive,
      domainFilter,
    });
  }, [selectedClass, showScoring, showComments, showComprehensive, domainFilter]);

  const recordsHeader = useRecordsHeader({
    selectedClass,
    selectedSubject,
    showScoring,
    showComments,
    showComprehensive,
    canShowScoring,
    canShowComments,
    setShowScoring,
    setShowComments,
    setShowComprehensive,
    domainFilter,
    setDomainFilter,
    uploadingZip,
    fileInputRef,
    handleBulkZipUpload,
    handleBatchGenerate,
    batchGenerating,
    handleBatchSpellcheck,
    spellcheckProgress,
    spellcheckingCount: spellcheckingIds.size,
    selectedStudentCount: selectedStudentIds.size,
    handleExport,
    saving,
    handleSaveAll,
    deleting,
    handleDeleteContent,
    uploadingFullRecords,
    fullRecordsInputRef,
    handleImportFullRecords,
    handleExportFullRecords,
  });

  return {
    sidebar: {
        title: RECORDS_PAGE_TEXT.sidebarTitle,
        collapsed: recordsTree.collapsed,
        titleAction: (
          <button
            type="button"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 ${recordsTree.collapsed ? 'mx-auto' : 'ml-auto'}`}
            onClick={recordsTree.toggleCollapsed}
            title={recordsTree.collapsed ? RECORDS_PAGE_TEXT.expandTree : RECORDS_PAGE_TEXT.collapseTree}
          >
            {recordsTree.collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        ),
        upload: {
          label: RECORDS_PAGE_TEXT.uploadLabel,
          loading: recordsUpload.uploadingFiles,
          hideLabel: recordsTree.collapsed,
          input: (
            <input
              ref={recordsUpload.classFilesRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              multiple
              onChange={recordsUpload.handleClassFilesUpload}
              disabled={recordsUpload.uploadingFiles}
            />
          ),
        },
        notices: recordsTree.collapsed ? [] : [
          {
            type: 'guide' as const,
            visible: showGuide,
            sections: RECORDS_PAGE_TEXT.guideSections.map(section => ({
              ...section,
              lines: [...section.lines],
            })),
            onDismiss: hideGuide,
          },
          { type: 'message' as const, visible: !!recordsUpload.uploadMsg, tone: recordsUpload.uploadMsg?.type || 'success', text: recordsUpload.uploadMsg?.text },
        ],
        tree: recordsTree.collapsed ? (
          <RecordsCollapsedTree
            classes={classes}
            selectedClassId={selectedClass?.id}
            getNodeOpen={recordsTree.getNodeOpen}
            onToggleOpen={recordsTree.toggleNodeOpen}
            onSelectClass={handleSelectClass}
          />
        ) : (
          {
            nodes: recordsTree.tree,
            empty: <p className="text-xs text-gray-400 text-center py-8">{RECORDS_PAGE_TEXT.emptyTree}</p>,
            node: {
              selected: (item: RecordsTreeNode) => item.kind === 'room' && selectedClass?.id === item.classItem?.id,
              clickable: (item: RecordsTreeNode) => item.kind === 'room' && !!item.classItem,
              onSelect: (item: RecordsTreeNode) => item.classItem && handleSelectClass(item.classItem),
              openStates: recordsTree.openStates,
              onToggleOpen: recordsTree.toggleNodeOpen,
              actions: (item: RecordsTreeNode) => item.kind === 'room' && item.classItem ? [
                {
                  title: '채점 파일 삭제',
                  icon: 'trash' as const,
                  variant: 'blue' as const,
                  visible: item.classItem.scoring_filename ? 'always' as const : 'hidden' as const,
                  onClick: (node: RecordsTreeNode) => handleDeleteScoring(node.classItem!),
                },
                {
                  title: '세특 파일 삭제',
                  icon: 'trash' as const,
                  variant: 'purple' as const,
                  visible: item.classItem.comments_filename ? 'always' as const : 'hidden' as const,
                  onClick: (node: RecordsTreeNode) => handleDeleteComments(node.classItem!),
                },
                {
                  title: '전체 삭제',
                  icon: 'trash' as const,
                  variant: 'red' as const,
                  visible: 'always' as const,
                  onClick: (node: RecordsTreeNode) => handleDeleteClass(node.classItem!),
                },
              ] : [],
            },
          }
        ),
      },
    header: {
        leading: recordsHeader.leading,
        actions: recordsHeader.actions,
        hideTitle: true,
      },
    contentProps: {
      selected: !!selectedClass,
      spellcheckProgress,
      spellcheckStopping,
      onStopSpellcheck: () => {
          spellcheckAbortRef.current?.abort();
          setSpellcheckStopping(true);
        },
      children: selectedClass && (
          <>
          {/* 테이블 뷰 */}
          <div className="flex-1 overflow-auto scrollbar-stable bg-white pb-32">
            {students.length === 0 ? (
              <div className="py-20 text-center text-gray-400">학생 명단이 없습니다.</div>
            ) : (
              <table
                ref={tableRef}
                className="text-sm text-left border-collapse"
                style={{ tableLayout: 'fixed', width: tableTotalWidth, minWidth: tableTotalWidth }}
              >
                <colgroup>
                  {tableColumnWidths.map((width, index) => (
                    <col key={index} style={{ width, minWidth: width }} />
                  ))}
                </colgroup>
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
                        onMouseDown={e => handleResizeStart(e, '_chk', FROZEN_DEFAULT_WIDTHS.chk)} />
                    </th>
                    {/* Frozen: 반 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                      style={{ left: sl.cls, width: cw.cls, minWidth: cw.cls }}>
                      반
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                        onMouseDown={e => handleResizeStart(e, '_cls', FROZEN_DEFAULT_WIDTHS.cls)} />
                    </th>
                    {/* Frozen: 번호 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                      style={{ left: sl.num, width: cw.num, minWidth: cw.num }}>
                      번호
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                        onMouseDown={e => handleResizeStart(e, '_num', FROZEN_DEFAULT_WIDTHS.num)} />
                    </th>
                    {/* Frozen: 이름 */}
                    <th rowSpan={2} className="relative sticky z-30 bg-gray-100 border-b border-r text-center font-semibold text-gray-600 select-none"
                      style={{ left: sl.name, width: cw.name, minWidth: cw.name, boxShadow: separatorShadow }}>
                      이름
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                        onMouseDown={e => handleResizeStart(e, '_name', FROZEN_DEFAULT_WIDTHS.name)} />
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

                    {/* Comp comments header */}
                    {showComprehensive && (
                      <>
                        <th rowSpan={2} className="relative px-4 py-3 font-semibold text-gray-800 border-b border-r bg-blue-50/50 select-none"
                          style={{ width: compWidth, minWidth: compWidth }}>
                          과목별세부능력및특기사항
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                            onMouseDown={e => handleResizeStart(e, '_comp', 320)} />
                        </th>
                        <th rowSpan={2} className="relative px-2 py-3 font-semibold text-gray-700 border-b border-r bg-blue-50/50 select-none"
                          style={{ width: compCountWidth, minWidth: compCountWidth }}>
                          글자수
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                            onMouseDown={e => handleResizeStart(e, '_comp_count', 74)} />
                        </th>
                        <th rowSpan={2} className="relative px-3 py-3 font-semibold text-gray-700 border-b bg-blue-50/50 select-none"
                          style={{ width: compSpellWidth, minWidth: compSpellWidth }}>
                          맞춤법 검사 결과
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-transparent z-10"
                            onMouseDown={e => handleResizeStart(e, '_comp_spell', 320)} />
                        </th>
                      </>
                    )}
                  </tr>
                  <tr>
                    {tableLayout.visibleDomains.map((d: any) => {
                      const cols = tableLayout.domainCols.get(d.name) || [];
                      return cols.map((c: any) => {
                        const wk = `${d.name}||${c.id}`;
                        const defW = getDomainColumnDefaultWidth(c.type);
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
                    const compCommentsData = contents[`${s.id}_comments_${SUBJECT_COMPREHENSIVE_DOMAIN}`] || {};
                    const compCommentsText = compCommentsData.text || '';
                    const compCommentsBytes = countTextBytes(compCommentsText);
                    const isCompCommentsOver = compCommentsBytes > 1500;
                    const isSpellchecking = spellcheckingIds.has(s.id);
                    const spellcheckResult = spellcheckResults[s.id];
                    const classNum = Math.floor((s.student_num % 10000) / 100);
                    const stuNum = s.student_num % 100;

                    return (
                      <tr key={s.id} className="records-table-row">
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
                          const commentsData = contents[`${s.id}_comments_${d.name}`] || {};

                          return cols.map((c: any) => {
                            const wk = `${d.name}||${c.id}`;
                            const defW = getDomainColumnDefaultWidth(c.type);
                            const w = colWidths[wk] ?? defW;

                            if (c.type === 'artifact') {
                              return (
                                <td key={`${d.name}_artifact`} className="border-r align-middle text-center p-1"
                                  style={{ width: w, minWidth: w }}>
                                  <Suspense fallback={<Loader2 size={12} className="mx-auto animate-spin text-gray-400" />}>
                                    <ArtifactViewer key={`${s.id}_${d.name}_${artifactRefreshKey}`} studentId={s.id} domain={d.name} />
                                  </Suspense>
                                </td>
                              );
                            }
                            if (c.type === 'llm') {
                              const locked = selectedClass
                                ? isAiCellLocked(selectedClass.id, s.id, 'scoring', d.name)
                                : false;
                              const contentKey = `${s.id}_scoring_${d.name}`;
                              const dirty = isContentFieldDirty(contentKey, c.id) || isScoringReasonDirty(contentKey, c.id);
                              const reason = (scoreData as ScoringContent).__reasons?.[c.id] || '';
                              return (
                                <td key={`${d.name}_${c.id}`} className="border-r align-top p-1"
                                  style={{ width: w, minWidth: w }}>
                                  <div className="group relative">
                                    <input type="text" className={`input w-full text-sm text-center disabled:bg-blue-50 disabled:text-gray-500 disabled:cursor-not-allowed ${dirtyControlClass(dirty)}`}
                                      value={scoreData[c.id] ?? ''}
                                      onChange={ev => updateContent(s.id, 'scoring', c.id, ev.target.value, d.name)}
                                      disabled={locked}
                                      data-row={rowIdx} data-col={c.fi}
                                      onKeyDown={e => handleKeyNav(e, rowIdx, c.fi)}
                                      title={locked ? 'AI 채점 진행 중이라 수정할 수 없습니다.' : undefined}
                                    />
                                    {reason && !locked && (
                                      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-950 shadow-lg ring-1 ring-amber-100 group-hover:block group-focus-within:block">
                                        <div className="mb-1 text-[11px] font-semibold text-amber-700">AI 판단 이유</div>
                                        <div className="whitespace-pre-wrap">{reason}</div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            if (c.type === 'total') {
                              const contentKey = `${s.id}_scoring_${d.name}`;
                              const dirty = isContentFieldDirty(contentKey, 'total');
                              return (
                                <td key={`${d.name}_total`} className={`border-r text-center font-bold text-blue-600 align-middle p-2 ${dirty ? 'bg-amber-50' : 'bg-blue-50/30'}`}
                                  style={{ width: w, minWidth: w }}>
                                  {scoreData.total || 0}
                                </td>
                              );
                            }
                            if (c.type === 'comments') {
                              const locked = selectedClass
                                ? isAiCellLocked(selectedClass.id, s.id, 'comments', d.name)
                                : false;
                              const contentKey = `${s.id}_comments_${d.name}`;
                              const dirty = isContentFieldDirty(contentKey, 'text');
                              return (
                                <td key={`${d.name}_comments`} className="border-r align-top p-1"
                                  style={{ width: w, minWidth: w }}>
                                  <textarea className={`textarea w-full text-sm resize-y disabled:bg-blue-50 disabled:text-gray-500 disabled:cursor-not-allowed ${dirtyControlClass(dirty)}`} style={{ minHeight: 80 }}
                                    value={commentsData.text || ''}
                                    onChange={ev => updateContent(s.id, 'comments', 'text', ev.target.value, d.name)}
                                    disabled={locked}
                                    data-row={rowIdx} data-col={c.fi}
                                    onKeyDown={e => handleKeyNav(e, rowIdx, c.fi)}
                                    title={locked ? 'AI 기록 생성 진행 중이라 수정할 수 없습니다.' : undefined}
                                  />
                                </td>
                              );
                            }
                            if (c.type === 'comments_item') {
                              const locked = selectedClass
                                ? isAiCellLocked(selectedClass.id, s.id, 'comments', d.name)
                                : false;
                              const itemValue = commentsData[c.itemTitle!]
                                ?? (c.id === 'comments_0' ? commentsData.text : '')
                                ?? '';
                              const contentKey = `${s.id}_comments_${d.name}`;
                              const dirty = isContentFieldDirty(contentKey, c.itemTitle!);
                              return (
                                <td key={`${d.name}_${c.id}`} className="border-r align-top p-1"
                                  style={{ width: w, minWidth: w }}>
                                  <textarea className={`textarea w-full text-sm resize-y disabled:bg-blue-50 disabled:text-gray-500 disabled:cursor-not-allowed ${dirtyControlClass(dirty)}`} style={{ minHeight: 80 }}
                                    value={itemValue}
                                    onChange={ev => updateContent(s.id, 'comments', c.itemTitle!, ev.target.value, d.name)}
                                    disabled={locked}
                                    data-row={rowIdx} data-col={c.fi}
                                    onKeyDown={e => handleKeyNav(e, rowIdx, c.fi)}
                                    title={locked ? 'AI 기록 생성 진행 중이라 수정할 수 없습니다.' : undefined}
                                  />
                                </td>
                              );
                            }
                            return null;
                          });
                        })}

                        {/* Comp comments */}
                        {showComprehensive && (
                          <>
                            <td className="align-top p-1 border-r"
                              style={{ width: compWidth, minWidth: compWidth }}>
                              <textarea className={`textarea w-full text-sm resize-y bg-blue-50/20 border-blue-100 disabled:bg-blue-50 disabled:text-gray-500 disabled:cursor-not-allowed ${dirtyControlClass(isContentFieldDirty(`${s.id}_comments_${SUBJECT_COMPREHENSIVE_DOMAIN}`, 'text'))}`} style={{ minHeight: 80 }}
                                value={compCommentsText}
                                onChange={ev => updateContent(s.id, 'comments', 'text', ev.target.value, SUBJECT_COMPREHENSIVE_DOMAIN)}
                                disabled={selectedClass ? isAiCellLocked(selectedClass.id, s.id, 'comments', SUBJECT_COMPREHENSIVE_DOMAIN) : false}
                                data-row={rowIdx} data-col={tableLayout.compCommentsColIdx}
                                onKeyDown={e => handleKeyNav(e, rowIdx, tableLayout.compCommentsColIdx)}
                                title={selectedClass && isAiCellLocked(selectedClass.id, s.id, 'comments', SUBJECT_COMPREHENSIVE_DOMAIN) ? 'AI 세특 생성 진행 중이라 수정할 수 없습니다.' : undefined}
                              />
                            </td>
                            <td className="align-top p-1 border-r text-center"
                              style={{ width: compCountWidth, minWidth: compCountWidth }}>
                              <div className={`whitespace-pre-line text-xs font-semibold ${isCompCommentsOver ? 'text-red-600' : 'text-gray-600'}`}>
                                {isCompCommentsOver ? '초과' : '적정'}
                                {'\n'}({compCommentsBytes} byte)
                              </div>
                              <button
                                type="button"
                                className="mt-2 inline-flex h-6 w-6 items-center justify-center rounded border border-blue-200 bg-white text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => applySpellcheckResult(s.id)}
                                disabled={!spellcheckResult}
                                title="맞춤법 검사 결과를 종합세특에 반영"
                              >
                                &lt;
                              </button>
                            </td>
                            <td className="align-top p-2"
                              style={{ width: compSpellWidth, minWidth: compSpellWidth }}>
                              {isSpellchecking ? (
                                <div className="flex items-center gap-1.5 text-xs text-green-700">
                                  <Loader2 size={12} className="animate-spin" />
                                  검사 중...
                                </div>
                              ) : spellcheckResult ? (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium text-gray-500">
                                    수정 {spellcheckResult.correctionCount}건
                                  </div>
                                  <div className="whitespace-pre-wrap rounded border border-gray-200 bg-white p-2 text-sm leading-relaxed text-gray-800">
                                    {renderTaggedSpellcheck(spellcheckResult.taggedText)}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400">검사 전</div>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          </>
        ),
    },
  };
}
