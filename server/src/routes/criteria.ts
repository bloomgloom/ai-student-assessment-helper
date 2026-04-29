import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne, execute, transaction } from '../services/db';
import { decodeUploadFilename } from '../services/filename';
import { parseAreaManagementExcel, parseAchievementStandardsExcel } from '../services/excel';

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '../../uploads/criteria');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${decodeUploadFilename(file.originalname)}`),
  }),
});

// --- 레거시 기준 세트 (RecordsPage 호환용) ---
router.get('/sets', async (_req: Request, res: Response) => {
  const sets = await queryAll('SELECT * FROM criteria_sets ORDER BY id DESC');
  res.json(sets);
});

// --- 과목 목록 및 고정 영역 조회 ---
router.get('/subjects', async (_req: Request, res: Response) => {
  const subjects = await queryAll<{
    year: number; semester: number; grade: number; subject: string; class_id: number;
  }>(`
    SELECT year, semester, grade, subject, MIN(class_id) as class_id
    FROM (
      SELECT year, semester, grade, subject, 0 as class_id FROM subject_domains
      UNION ALL
      SELECT year, semester, grade, subject, 0 as class_id FROM custom_domains
    )
    GROUP BY year, semester, grade, subject
    ORDER BY year DESC, semester, grade, subject
  `);

  const result = [];
  for (const sub of subjects) {
    let fixedDomains = await queryAll<{ name: string; max_score: number; sort_order: number }>(
      `SELECT name, max_score, sort_order
       FROM subject_domains
       WHERE year=? AND semester=? AND grade=? AND subject=? AND eval_type='수행' AND reflected='O'
       ORDER BY sort_order`,
      [sub.year, sub.semester, sub.grade, sub.subject]
    );

    const customDomains = await queryAll<{ id: number; name: string }>(
      'SELECT id, name FROM custom_domains WHERE year=? AND semester=? AND grade=? AND subject=? ORDER BY id',
      [sub.year, sub.semester, sub.grade, sub.subject]
    );

    result.push({
      ...sub,
      fixedDomains,
      customDomains
    });
  }
  res.json(result);
});

router.get('/subject-domains', async (req: Request, res: Response) => {
  const { year, semester, grade, subject } = req.query;
  const rows = await queryAll(
    `SELECT * FROM subject_domains
     WHERE year=? AND semester=? AND grade=? AND subject=?
     ORDER BY sort_order`,
    [Number(year), Number(semester), Number(grade), String(subject)]
  );
  res.json(rows);
});

router.get('/domain-subjects', async (_req: Request, res: Response) => {
  const subjects = await queryAll(`
    SELECT year, semester, grade, subject, MAX(credit) as credit, COUNT(*) as domain_count
    FROM subject_domains
    GROUP BY year, semester, grade, subject
    ORDER BY year DESC, semester, grade, subject
  `);
  res.json(subjects);
});

router.get('/standard-subjects', async (_req: Request, res: Response) => {
  const subjects = await queryAll(`
    SELECT year, semester, grade, subject, domain_name, MAX(credit) as credit, COUNT(*) as standards_count
    FROM achievement_standards
    GROUP BY year, semester, grade, subject, domain_name
    ORDER BY year DESC, semester, grade, subject, domain_name
  `);
  res.json(subjects);
});

router.get('/domains', async (req: Request, res: Response) => {
  const { year, semester, grade, subject } = req.query;
  const rows = await queryAll(
    `SELECT * FROM subject_domains
     WHERE year=? AND semester=? AND grade=? AND subject=?
     ORDER BY sort_order, id`,
    [Number(year), Number(semester), Number(grade), String(subject)]
  );
  res.json(rows);
});

router.post('/domains/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const originalName = decodeUploadFilename(req.file.originalname);
  try {
    const parsed = await parseAreaManagementExcel(req.file.path);
    await transaction(async () => {
      await execute(
        'DELETE FROM subject_domains WHERE year=? AND semester=? AND grade=? AND subject=?',
        [parsed.info.year, parsed.info.semester, parsed.info.grade, parsed.info.subject]
      );
      for (const row of parsed.rows) {
        await execute(
          `INSERT INTO subject_domains(year, semester, grade, subject, credit, eval_type, name, reflected, ratio, max_score, sort_order, source_filename)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            parsed.info.year, parsed.info.semester, parsed.info.grade, parsed.info.subject, parsed.info.credit,
            row.evalType, row.name, row.reflected, row.ratio, row.maxScore, row.sortOrder, originalName,
          ]
        );
      }
    });
    res.json({
      ...parsed.info,
      credit: parsed.info.credit,
      totalCount: parsed.rows.length,
      reflectedPerformanceCount: parsed.rows.filter((row) => row.evalType === '수행' && row.reflected === 'O').length,
    });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/standards', async (req: Request, res: Response) => {
  const { year, semester, grade, subject } = req.query;
  const rows = await queryAll(
    `SELECT * FROM achievement_standards
     WHERE year=? AND semester=? AND grade=? AND subject=?
     ORDER BY domain_name, sort_order, id`,
    [Number(year), Number(semester), Number(grade), String(subject)]
  );
  res.json(rows);
});

router.post('/standards/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const originalName = decodeUploadFilename(req.file.originalname);
  try {
    const parsed = await parseAchievementStandardsExcel(req.file.path);
    await transaction(async () => {
      await execute(
        'DELETE FROM achievement_standards WHERE year=? AND semester=? AND grade=? AND subject=?',
        [parsed.info.year, parsed.info.semester, parsed.info.grade, parsed.info.subject]
      );
      for (const row of parsed.rows) {
        await execute(
          `INSERT INTO achievement_standards(year, semester, grade, subject, credit, domain_name, code, content, level, description, sort_order, source_filename)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            parsed.info.year, parsed.info.semester, parsed.info.grade, parsed.info.subject, parsed.info.credit,
            row.domainName, row.code, row.content, row.level, row.description, row.sortOrder, originalName,
          ]
        );
      }
    });
    res.json({ ...parsed.info, standardsCount: parsed.rows.length });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// --- 커스텀 수행평가 영역 (세특 전용) ---
router.post('/custom-domains', async (req: Request, res: Response) => {
  const { year, semester, grade, subject, name } = req.body;
  const r = await execute(
    'INSERT INTO custom_domains(year, semester, grade, subject, name) VALUES(?,?,?,?,?)',
    [year, semester, grade, subject, name]
  );
  res.json({ id: Number(r.lastInsertRowid) });
});

router.delete('/custom-domains/:id', async (req: Request, res: Response) => {
  await execute('DELETE FROM custom_domains WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- 세특 기준 ---
router.get('/setech', async (req: Request, res: Response) => {
  const { year, semester, grade, subject, domainName } = req.query;
  const items = await queryAll(
    'SELECT * FROM domain_setech WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=? ORDER BY sort_order, id',
    [Number(year), Number(semester), Number(grade), String(subject), String(domainName)]
  );
  res.json(items);
});

router.put('/setech/bulk', async (req: Request, res: Response) => {
  const { year, semester, grade, subject, domainName, items } = req.body as {
    year: number; semester: number; grade: number; subject: string; domainName: string;
    items: { type: string; title: string; prompt: string; extensions: string; sort_order: number }[];
  };

  await transaction(async () => {
    await execute(
      'DELETE FROM domain_setech WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?', 
      [year, semester, grade, subject, domainName]
    );
    for (const item of items) {
      await execute(
        'INSERT INTO domain_setech(year, semester, grade, subject, domain_name, type, title, prompt, extensions, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [year, semester, grade, subject, domainName, item.type, item.title, item.prompt, item.extensions, item.sort_order]
      );
    }
  });
  res.json({ ok: true });
});

// --- 평가 기준 (채점) ---
router.get('/eval', async (req: Request, res: Response) => {
  const { year, semester, grade, subject, domainName } = req.query;
  const items = await queryAll(
    'SELECT * FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=? ORDER BY sort_order, id',
    [Number(year), Number(semester), Number(grade), String(subject), String(domainName)]
  );
  res.json(items);
});

router.put('/eval/bulk', async (req: Request, res: Response) => {
  const { year, semester, grade, subject, domainName, items } = req.body as {
    year: number; semester: number; grade: number; subject: string; domainName: string;
    items: { name: string; excel_col: string; item_type: string; rubric: string; sort_order: number }[];
  };

  await transaction(async () => {
    await execute(
      'DELETE FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?', 
      [year, semester, grade, subject, domainName]
    );
    for (const item of items) {
      await execute(
        'INSERT INTO domain_eval(year, semester, grade, subject, domain_name, name, excel_col, item_type, rubric, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [year, semester, grade, subject, domainName, item.name, item.excel_col, item.item_type, item.rubric, item.sort_order]
      );
    }
  });
  res.json({ ok: true });
});

export default router;
