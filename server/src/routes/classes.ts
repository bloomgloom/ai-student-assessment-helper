import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne, execute, transaction } from '../services/db';
import { parseClassFilename, parseScoringExcel, parseSetechFilename, parseSetechExcel } from '../services/excel';
import { decodeUploadFilename } from '../services/filename';

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scoring');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const name = decodeUploadFilename(file.originalname);
    cb(null, `${Date.now()}_${name}`);
  },
});
const upload = multer({ storage });

const router = Router();

// ── 수업 목록 조회 (트리 구성용) ─────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const classes = await queryAll<{
    id: number; year: number; semester: number; grade: number;
    subject: string; room: string; filename: string; created_at: string;
  }>('SELECT * FROM classes ORDER BY year ASC, semester, grade, subject, room');
  res.json(classes);
});

// ── 수업 상세 (영역 포함) ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  const cls = await queryOne<{
    id: number; year: number; semester: number; grade: number;
    subject: string; room: string; filename: string;
  }>('SELECT * FROM classes WHERE id=?', [req.params.id]);
  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });

  const domains = await queryAll(
    'SELECT * FROM assessment_domains WHERE class_id=? ORDER BY sort_order',
    [req.params.id]
  );
  res.json({ ...cls, domains });
});

// ── 수업의 학생 목록 ───────────────────────────────────────────────────────
router.get('/:id/students', async (req: Request, res: Response) => {
  const students = await queryAll(
    'SELECT * FROM class_students WHERE class_id=? ORDER BY student_num',
    [req.params.id]
  );
  res.json(students);
});

// ── 수업의 수행평가 영역 목록 ─────────────────────────────────────────────
router.get('/:id/domains', async (req: Request, res: Response) => {
  const domains = await queryAll(
    'SELECT * FROM assessment_domains WHERE class_id=? ORDER BY sort_order',
    [req.params.id]
  );
  res.json(domains);
});

// ── 채점 파일 업로드 → 수업 생성 ─────────────────────────────────────────
router.post('/upload', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'scoringFile', maxCount: 1 },
  { name: 'setechFile', maxCount: 1 },
]), async (req: Request, res: Response) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const scoringFile = files?.scoringFile?.[0] || files?.file?.[0];
  const setechFile = files?.setechFile?.[0];
  if (!scoringFile) return res.status(400).json({ error: '채점 파일이 없습니다.' });

  const originalName = decodeUploadFilename(scoringFile.originalname);
  const setechOriginalName = setechFile ? decodeUploadFilename(setechFile.originalname) : '';

  // 1. 파일명 파싱 (parseClassFilename 내부에서도 NFC 정규화하므로 이중 보호)
  let classInfo = parseClassFilename(originalName);
  const setechInfo = setechOriginalName ? parseSetechFilename(setechOriginalName) : null;
  if (setechOriginalName && !setechInfo) {
    return res.status(400).json({
      error: '세특 파일명에서 수업 정보를 파싱할 수 없습니다.',
      hint: '파일명 형식: "2026_1학기_2학년_1_정보_과목세특_20251022132700.xlsx"',
    });
  }
  if (!classInfo) {
    // 파일명에서 파싱 실패 시 수동 입력값 사용 가능
    const { year, semester, grade, subject, room } = req.body as {
      year?: string; semester?: string; grade?: string; subject?: string; room?: string;
    };
    if (!year || !semester || !subject) {
      fs.unlinkSync(scoringFile.path);
      return res.status(400).json({
        error: '파일명에서 수업 정보를 파싱할 수 없습니다.',
        hint: '파일명 형식: "수행평가 파일일괄등록 - 2026학년도 1학기 2 정보(3)_전체영역_1강의실.xlsx"',
      });
    }
    classInfo = {
      year: parseInt(year, 10),
      semester: parseInt(semester, 10),
      grade: parseInt(grade ?? '0', 10),
      subject,
      room: room ?? '',
    };
  }

  if (setechInfo) {
    const sameClass = classInfo.year === setechInfo.year
      && classInfo.semester === setechInfo.semester
      && classInfo.grade === setechInfo.grade
      && classInfo.subject === setechInfo.subject
      && String(classInfo.room).replace(/강의실$/, '') === String(setechInfo.room).replace(/강의실$/, '');
    if (!sameClass) {
      return res.status(400).json({ error: '채점 파일과 세특 파일의 학년도/학기/학년/과목/강의실 정보가 일치하지 않습니다.' });
    }
  }

  // 2. Excel 파싱
  let domains: Awaited<ReturnType<typeof parseScoringExcel>>['domains'];
  let students: Awaited<ReturnType<typeof parseScoringExcel>>['students'];
  try {
    const parsed = await parseScoringExcel(scoringFile.path);
    domains = parsed.domains;
    students = parsed.students;
  } catch (e: unknown) {
    return res.status(400).json({ error: `Excel 파싱 오류: ${e instanceof Error ? e.message : e}` });
  }

  const managedDomains = await queryAll<{ name: string; max_score: number; sort_order: number }>(
    `SELECT name, max_score, sort_order
     FROM subject_domains
     WHERE year=? AND semester=? AND grade=? AND subject=? AND eval_type='수행' AND reflected='O'
     ORDER BY sort_order`,
    [classInfo.year, classInfo.semester, classInfo.grade, classInfo.subject]
  );
  if (managedDomains.length) {
    domains = managedDomains.map((managed, index) => {
      const fromScoring = domains.find((domain) => domain.name === managed.name);
      return {
        name: managed.name,
        maxScore: Number(managed.max_score) || 0,
        excelCol: fromScoring?.excelCol || '',
        sortOrder: index,
      };
    });
  }

  if (!domains.length) {
    return res.status(400).json({ error: 'E1 이후 셀에서 수행평가 영역명을 찾을 수 없습니다.' });
  }

  // 2.5. 기존 동일 과목(학년도/학기/학년/과목)의 수행평가 영역과 일치하는지 검증
  const existingClass = await queryOne<{ id: number }>(
    'SELECT id FROM classes WHERE year=? AND semester=? AND grade=? AND subject=? LIMIT 1',
    [classInfo!.year, classInfo!.semester, classInfo!.grade, classInfo!.subject]
  );
  if (existingClass) {
    const existingDomains = await queryAll<{ name: string; max_score: number }>(
      'SELECT name, max_score FROM assessment_domains WHERE class_id=? ORDER BY sort_order',
      [existingClass.id]
    );
    
    const isSame = existingDomains.length === domains.length && 
                   existingDomains.every((ed, i) => ed.name === domains[i].name && ed.max_score === domains[i].maxScore);
    
    if (!isSame) {
      return res.status(400).json({
        error: '동일한 과목의 기존 강의실과 수행평가 영역이 다릅니다.',
        hint: '모든 강의실은 동일한 수행평가 영역(개수, 이름, 만점)을 가져야 합니다.'
      });
    }
  }

  // 3. DB 저장 (트랜잭션)
  try {
    const classId = await transaction(async () => {
      const r = await execute(
        `INSERT INTO classes(year, semester, grade, subject, room, filename, scoring_filename, scoring_filepath, setech_filename, setech_filepath)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [
          classInfo!.year, classInfo!.semester, classInfo!.grade, classInfo!.subject, classInfo!.room,
          originalName, originalName, scoringFile.path, setechOriginalName, setechFile?.path || '',
        ]
      );
      const classId = Number(r.lastInsertRowid);

      for (const d of domains) {
        await execute(
          'INSERT INTO assessment_domains(class_id, name, max_score, excel_col, sort_order) VALUES(?,?,?,?,?)',
          [classId, d.name, d.maxScore, d.excelCol, d.sortOrder]
        );
      }
      for (const s of students) {
        // student_num = grade * 10000 + classNum * 100 + num (예: 20301 = 2학년 3반 1번)
        const fullStudentNum = classInfo!.grade * 10000 + s.studentNum;
        await execute(
          'INSERT INTO class_students(class_id, student_num, name, excel_row) VALUES(?,?,?,?)',
          [classId, fullStudentNum, s.name, s.excelRow]
        );
      }
      return classId;
    });

    res.json({
      id: classId,
      ...classInfo,
      domainsCount: domains.length,
      studentsCount: students.length,
    });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ── 채점 파일 단독 업로드 (수업 생성/갱신) ───────────────────────────────
router.post('/upload/scoring', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '채점 파일이 없습니다.' });

  const originalName = decodeUploadFilename(file.originalname);
  const classInfo = parseClassFilename(originalName);
  if (!classInfo) {
    return res.status(400).json({
      error: '파일명에서 수업 정보를 파싱할 수 없습니다.',
      hint: '파일명 형식: "수행평가 파일일괄등록 - 2026학년도 1학기 2 정보(3)_전체영역_1강의실.xlsx"',
    });
  }

  let parsedDomains: Awaited<ReturnType<typeof parseScoringExcel>>['domains'];
  let parsedStudents: Awaited<ReturnType<typeof parseScoringExcel>>['students'];
  try {
    const p = await parseScoringExcel(file.path);
    parsedDomains = p.domains;
    parsedStudents = p.students;
  } catch (e) {
    return res.status(400).json({ error: `Excel 파싱 오류: ${e instanceof Error ? e.message : e}` });
  }

  // 영역 관리에서 수행 반영 영역 조회
  const managedDomains = await queryAll<{ name: string; max_score: number; sort_order: number }>(
    `SELECT name, max_score, sort_order FROM subject_domains
     WHERE year=? AND semester=? AND grade=? AND subject=? AND eval_type='수행' AND reflected='O'
     ORDER BY sort_order`,
    [classInfo.year, classInfo.semester, classInfo.grade, classInfo.subject]
  );

  // 영역 일치 여부 확인 (경고용)
  let domainMismatch: string | null = null;
  let domains = parsedDomains;
  if (managedDomains.length) {
    const managedNames = managedDomains.map(d => d.name);
    const parsedNames = parsedDomains.map(d => d.name);
    const missing = managedNames.filter(n => !parsedNames.includes(n));
    const extra = parsedNames.filter(n => !managedNames.includes(n));
    if (missing.length || extra.length) {
      domainMismatch = [
        ...missing.map(n => `영역관리에만 있음: ${n}`),
        ...extra.map(n => `채점파일에만 있음: ${n}`),
      ].join('\n');
    }
    domains = managedDomains.map((m, i) => {
      const fromFile = parsedDomains.find(d => d.name === m.name);
      return { name: m.name, maxScore: Number(m.max_score) || 0, excelCol: fromFile?.excelCol || '', sortOrder: i };
    });
  }

  if (!domains.length) {
    return res.status(400).json({ error: 'E1 이후 셀에서 수행평가 영역명을 찾을 수 없습니다.' });
  }

  const existingClass = await queryOne<{ id: number; setech_filename: string }>(
    'SELECT id, setech_filename FROM classes WHERE year=? AND semester=? AND grade=? AND subject=? AND room=?',
    [classInfo.year, classInfo.semester, classInfo.grade, classInfo.subject, classInfo.room]
  );

  let studentMismatch: string[] | null = null;
  let classId: number;

  if (existingClass) {
    classId = existingClass.id;
    // 세특 파일이 이미 있으면 학생 명단 일치 여부 확인
    if (existingClass.setech_filename) {
      const existingStudents = await queryAll<{ id: number; name: string; student_num: number }>(
        'SELECT id, name, student_num FROM class_students WHERE class_id=? ORDER BY name', [classId]
      );
      const existingNames = new Set(existingStudents.map(s => s.name));
      const newNames = new Set(parsedStudents.map(s => s.name));
      const missing2 = [...existingNames].filter(n => !newNames.has(n));
      const extra2 = [...newNames].filter(n => !existingNames.has(n));
      if (missing2.length || extra2.length) {
        studentMismatch = [
          ...missing2.map(n => `세특에만 있음: ${n}`),
          ...extra2.map(n => `채점에만 있음: ${n}`),
        ];
      }
      for (const s of parsedStudents) {
        const fullNum = classInfo.grade * 10000 + s.studentNum;
        const existing = existingStudents.find(e => e.student_num === fullNum)
                      || existingStudents.find(e => e.name === s.name);
        if (existing) {
          await execute('UPDATE class_students SET excel_row=? WHERE id=?', [s.excelRow, existing.id]);
        }
      }
    }
    await execute(
      'UPDATE classes SET scoring_filename=?, scoring_filepath=?, filename=? WHERE id=?',
      [originalName, file.path, originalName, classId]
    );
    // 도메인 갱신
    await execute('DELETE FROM assessment_domains WHERE class_id=?', [classId]);
    for (const d of domains) {
      await execute('INSERT INTO assessment_domains(class_id, name, max_score, excel_col, sort_order) VALUES(?,?,?,?,?)',
        [classId, d.name, d.maxScore, d.excelCol, d.sortOrder]);
    }
    // 학생이 없으면 추가
    const existingCount = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM class_students WHERE class_id=?', [classId]);
    if (!existingCount || existingCount.cnt === 0) {
      for (const s of parsedStudents) {
        const fullNum = classInfo.grade * 10000 + s.studentNum;
        await execute('INSERT INTO class_students(class_id, student_num, name, excel_row, personal_num) VALUES(?,?,?,?,?)',
          [classId, fullNum, s.name, s.excelRow, '']);
      }
    } else if (!existingClass.setech_filename) {
      const existingStudents = await queryAll<{ id: number; name: string; student_num: number }>(
        'SELECT id, name, student_num FROM class_students WHERE class_id=? ORDER BY name', [classId]
      );
      for (const s of parsedStudents) {
        const fullNum = classInfo.grade * 10000 + s.studentNum;
        const existing = existingStudents.find(e => e.student_num === fullNum)
                      || existingStudents.find(e => e.name === s.name);
        if (existing) {
          await execute('UPDATE class_students SET excel_row=? WHERE id=?', [s.excelRow, existing.id]);
        }
      }
    }
  } else {
    const r = await transaction(async () => {
      const ins = await execute(
        `INSERT INTO classes(year, semester, grade, subject, room, filename, scoring_filename, scoring_filepath, setech_filename, setech_filepath)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [classInfo.year, classInfo.semester, classInfo.grade, classInfo.subject, classInfo.room,
          originalName, originalName, file.path, '', '']
      );
      const cid = Number(ins.lastInsertRowid);
      for (const d of domains) {
        await execute('INSERT INTO assessment_domains(class_id, name, max_score, excel_col, sort_order) VALUES(?,?,?,?,?)',
          [cid, d.name, d.maxScore, d.excelCol, d.sortOrder]);
      }
      for (const s of parsedStudents) {
        const fullNum = classInfo.grade * 10000 + s.studentNum;
        await execute('INSERT INTO class_students(class_id, student_num, name, excel_row, personal_num) VALUES(?,?,?,?,?)',
          [cid, fullNum, s.name, s.excelRow, '']);
      }
      return cid;
    });
    classId = r;
  }

  res.json({
    classId,
    ...classInfo,
    domainsCount: domains.length,
    studentsCount: parsedStudents.length,
    domainMismatch: domainMismatch || undefined,
    studentMismatch: studentMismatch || undefined,
    updated: !!existingClass,
  });
});

// ── 세특 파일 단독 업로드 (수업 생성/갱신) ───────────────────────────────
router.post('/upload/setech', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '세특 파일이 없습니다.' });

  const originalName = decodeUploadFilename(file.originalname);
  const setechInfo = parseSetechFilename(originalName);
  if (!setechInfo) {
    return res.status(400).json({
      error: '세특 파일명에서 수업 정보를 파싱할 수 없습니다.',
      hint: '파일명 형식: "2026_1학기_2학년_1_정보_과목세특_20251022132700.xlsx"',
    });
  }

  const { year, semester, grade, subject, room } = setechInfo;

  let parsedStudents: Awaited<ReturnType<typeof parseSetechExcel>>;
  try {
    parsedStudents = await parseSetechExcel(file.path);
  } catch (e) {
    return res.status(400).json({ error: `세특 파일 파싱 오류: ${e instanceof Error ? e.message : e}` });
  }

  const existingClass = await queryOne<{ id: number; scoring_filename: string }>(
    'SELECT id, scoring_filename FROM classes WHERE year=? AND semester=? AND grade=? AND subject=? AND room=?',
    [year, semester, grade, subject, room]
  );

  let studentMismatch: string[] | null = null;
  let classId: number;

  if (existingClass) {
    classId = existingClass.id;
    // 채점 파일이 이미 있으면 학생 명단 일치 여부 확인
    if (existingClass.scoring_filename) {
      const existingStudents = await queryAll<{ id: number; name: string; student_num: number }>(
        'SELECT id, name, student_num FROM class_students WHERE class_id=? ORDER BY name', [classId]
      );
      const existingNames = new Set(existingStudents.map(s => s.name));
      const newNames = new Set(parsedStudents.map(s => s.name));
      const missing2 = [...existingNames].filter(n => !newNames.has(n));
      const extra2 = [...newNames].filter(n => !existingNames.has(n));
      if (missing2.length || extra2.length) {
        studentMismatch = [
          ...missing2.map(n => `채점에만 있음: ${n}`),
          ...extra2.map(n => `세특에만 있음: ${n}`),
        ];
      }
      // 기존 학생에 personal_num 업데이트 (학번 우선, 이름 보조)
      for (const s of parsedStudents) {
        const fullNum = grade * 10000 + s.studentNum;
        const existing = existingStudents.find(e => e.student_num === fullNum)
                      || existingStudents.find(e => e.name === s.name);
        if (existing && s.personalNum) {
          await execute('UPDATE class_students SET personal_num=? WHERE id=?', [s.personalNum, existing.id]);
        }
      }
    } else {
      // 채점 파일 없이 세특만 있는 경우: 학생 명단 삽입
      const existingCount = await queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM class_students WHERE class_id=?', [classId]);
      if (!existingCount || existingCount.cnt === 0) {
        for (const s of parsedStudents) {
          const fullNum = grade * 10000 + s.studentNum;
          await execute('INSERT INTO class_students(class_id, student_num, name, excel_row, personal_num) VALUES(?,?,?,?,?)',
            [classId, fullNum, s.name, s.excelRow, s.personalNum]);
        }
      }
    }
    await execute(
      'UPDATE classes SET setech_filename=?, setech_filepath=? WHERE id=?',
      [originalName, file.path, classId]
    );
  } else {
    // 새 수업 생성: 도메인은 영역 관리에서 가져옴
    const managedDomains = await queryAll<{ name: string; max_score: number; sort_order: number }>(
      `SELECT name, max_score, sort_order FROM subject_domains
       WHERE year=? AND semester=? AND grade=? AND subject=? AND eval_type='수행' AND reflected='O'
       ORDER BY sort_order`,
      [year, semester, grade, subject]
    );

    const r = await transaction(async () => {
      const ins = await execute(
        `INSERT INTO classes(year, semester, grade, subject, room, filename, scoring_filename, scoring_filepath, setech_filename, setech_filepath)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [year, semester, grade, subject, room, originalName, '', '', originalName, file.path]
      );
      const cid = Number(ins.lastInsertRowid);
      for (const d of managedDomains) {
        await execute('INSERT INTO assessment_domains(class_id, name, max_score, excel_col, sort_order) VALUES(?,?,?,?,?)',
          [cid, d.name, Number(d.max_score) || 0, '', d.sort_order]);
      }
      for (const s of parsedStudents) {
        const fullNum = grade * 10000 + s.studentNum;
        await execute('INSERT INTO class_students(class_id, student_num, name, excel_row, personal_num) VALUES(?,?,?,?,?)',
          [cid, fullNum, s.name, s.excelRow, s.personalNum]);
      }
      return cid;
    });
    classId = r;
  }

  res.json({
    classId,
    year, semester, grade, subject, room,
    studentsCount: parsedStudents.length,
    studentMismatch: studentMismatch || undefined,
    updated: !!existingClass,
  });
});

// ── 채점 파일만 삭제 ──────────────────────────────────────────────────────
router.delete('/:id/scoring', async (req: Request, res: Response) => {
  const cls = await queryOne<{ scoring_filepath: string }>(
    'SELECT scoring_filepath FROM classes WHERE id=?', [req.params.id]
  );
  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });
  if (cls.scoring_filepath) {
    try { fs.unlinkSync(cls.scoring_filepath); } catch { /* ignore */ }
  }
  await execute(
    'UPDATE classes SET scoring_filename=?, scoring_filepath=? WHERE id=?',
    ['', '', req.params.id]
  );
  res.json({ ok: true });
});

// ── 세특 파일만 삭제 ──────────────────────────────────────────────────────
router.delete('/:id/setech', async (req: Request, res: Response) => {
  const cls = await queryOne<{ setech_filepath: string }>(
    'SELECT setech_filepath FROM classes WHERE id=?', [req.params.id]
  );
  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });
  if (cls.setech_filepath) {
    try { fs.unlinkSync(cls.setech_filepath); } catch { /* ignore */ }
  }
  await execute(
    'UPDATE classes SET setech_filename=?, setech_filepath=? WHERE id=?',
    ['', '', req.params.id]
  );
  // 개인번호도 함께 초기화 (세특에서 가져온 데이터)
  await execute('UPDATE class_students SET personal_num=? WHERE class_id=?', ['', req.params.id]);
  res.json({ ok: true });
});

// ── 수업 삭제 ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const cls = await queryOne<{
    scoring_filepath: string; setech_filepath: string;
  }>('SELECT scoring_filepath, setech_filepath FROM classes WHERE id=?', [req.params.id]);

  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });

  // 산출물(artifact) 파일 경로 수집 후 삭제
  const students = await queryAll<{ id: number }>(
    'SELECT id FROM class_students WHERE class_id=?', [req.params.id]
  );
  for (const s of students) {
    const artifacts = await queryAll<{ filepath: string }>(
      'SELECT filepath FROM artifacts WHERE student_id=?', [s.id]
    );
    for (const a of artifacts) {
      try { if (a.filepath) fs.unlinkSync(a.filepath); } catch { /* ignore */ }
    }
  }

  // 채점/세특 원본 파일 삭제
  if (cls.scoring_filepath) {
    try { fs.unlinkSync(cls.scoring_filepath); } catch { /* ignore */ }
  }
  if (cls.setech_filepath) {
    try { fs.unlinkSync(cls.setech_filepath); } catch { /* ignore */ }
  }

  // DB 삭제 (generated_content, artifacts는 ON DELETE CASCADE)
  await execute('DELETE FROM assessment_domains WHERE class_id=?', [req.params.id]);
  await execute('DELETE FROM class_students WHERE class_id=?', [req.params.id]);
  await execute('DELETE FROM classes WHERE id=?', [req.params.id]);

  res.json({ ok: true });
});

// ── 기록 세션에 수업 연동 → 세션 학생 동기화 ─────────────────────────────
// POST /api/classes/:classId/sync-session/:sessionId
router.post('/:classId/sync-session/:sessionId', async (req: Request, res: Response) => {
  const { classId, sessionId } = req.params;

  const cls = await queryOne('SELECT id FROM classes WHERE id=?', [classId]);
  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });

  const classStudents = await queryAll<{
    student_num: number; name: string; excel_row: number;
  }>('SELECT * FROM class_students WHERE class_id=? ORDER BY student_num', [classId]);

  await transaction(async () => {
    // 세션의 기존 학생 삭제
    await execute('DELETE FROM students WHERE session_id=?', [sessionId]);
    // class_id 업데이트
    await execute('UPDATE record_sessions SET class_id=? WHERE id=?', [classId, sessionId]);
    // 학생 복사 (class_students → students)
    for (const s of classStudents) {
      await execute(
        'INSERT INTO students(session_id, class_num, student_num, name, excel_row) VALUES(?,?,?,?,?)',
        [sessionId, 0, s.student_num, s.name, s.excel_row]
      );
    }
  });

  res.json({ synced: classStudents.length });
});

export default router;
