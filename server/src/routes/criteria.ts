import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
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

function safeDownloadName(name: string): string {
  return encodeURIComponent(name).replace(/['()]/g, escape);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  return String(value).trim();
}

function headerMap(row: ExcelJS.Row): Record<string, number> {
  const map: Record<string, number> = {};
  row.eachCell((cell, col) => { map[cellText(cell.value)] = col; });
  return map;
}

function findUploadedCriteriaFile(originalName: string): string | null {
  const normalized = originalName.normalize('NFC');
  const files = fs.readdirSync(UPLOAD_DIR)
    .filter((file) => file.normalize('NFC').endsWith(`_${normalized}`))
    .sort()
    .reverse();
  const found = files.find((file) => fs.existsSync(path.join(UPLOAD_DIR, file)));
  return found ? path.join(UPLOAD_DIR, found) : null;
}

async function getStandardsSource(year: number, semester: number, grade: number, subject: string) {
  return queryOne<{ source_filename: string }>(
    `SELECT source_filename FROM achievement_standards
     WHERE year=? AND semester=? AND grade=? AND subject=?
     ORDER BY id DESC LIMIT 1`,
    [year, semester, grade, subject]
  );
}

async function getDomainsSource(year: number, semester: number, grade: number, subject: string) {
  return queryOne<{ source_filename: string }>(
    `SELECT source_filename FROM subject_domains
     WHERE year=? AND semester=? AND grade=? AND subject=?
     ORDER BY id DESC LIMIT 1`,
    [year, semester, grade, subject]
  );
}

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

router.get('/standards/source-file', async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const semester = Number(req.query.semester);
  const grade = Number(req.query.grade);
  const subject = String(req.query.subject || '');
  const source = await getStandardsSource(year, semester, grade, subject);
  if (!source?.source_filename) return res.status(404).json({ error: '원본 파일 정보가 없습니다.' });
  const filepath = findUploadedCriteriaFile(source.source_filename);
  if (!filepath) return res.status(404).json({ error: '원본 파일을 찾을 수 없습니다.' });
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeDownloadName(source.source_filename)}`);
  res.sendFile(filepath);
});

router.delete('/standards/source-file', async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const semester = Number(req.query.semester);
  const grade = Number(req.query.grade);
  const subject = String(req.query.subject || '');
  const source = await getStandardsSource(year, semester, grade, subject);
  if (source?.source_filename) {
    const filepath = findUploadedCriteriaFile(source.source_filename);
    if (filepath) try { fs.unlinkSync(filepath); } catch {}
  }
  await execute(
    'DELETE FROM achievement_standards WHERE year=? AND semester=? AND grade=? AND subject=?',
    [year, semester, grade, subject]
  );
  res.json({ ok: true });
});

router.get('/domains/source-file', async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const semester = Number(req.query.semester);
  const grade = Number(req.query.grade);
  const subject = String(req.query.subject || '');
  const source = await getDomainsSource(year, semester, grade, subject);
  if (!source?.source_filename) return res.status(404).json({ error: '원본 파일 정보가 없습니다.' });
  const filepath = findUploadedCriteriaFile(source.source_filename);
  if (!filepath) return res.status(404).json({ error: '원본 파일을 찾을 수 없습니다.' });
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeDownloadName(source.source_filename)}`);
  res.sendFile(filepath);
});

router.delete('/domains/source-file', async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const semester = Number(req.query.semester);
  const grade = Number(req.query.grade);
  const subject = String(req.query.subject || '');
  const source = await getDomainsSource(year, semester, grade, subject);
  if (source?.source_filename) {
    const filepath = findUploadedCriteriaFile(source.source_filename);
    if (filepath) try { fs.unlinkSync(filepath); } catch {}
  }
  await transaction(async () => {
    await execute(
      'DELETE FROM subject_domains WHERE year=? AND semester=? AND grade=? AND subject=?',
      [year, semester, grade, subject]
    );
    await execute(
      'DELETE FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=?',
      [year, semester, grade, subject]
    );
  });
  res.json({ ok: true });
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
    items: { name: string; score: string; item_type: string; rubric: string; sort_order: number }[];
  };

  await transaction(async () => {
    await execute(
      'DELETE FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?',
      [year, semester, grade, subject, domainName]
    );
    for (const item of items) {
      await execute(
        'INSERT INTO domain_eval(year, semester, grade, subject, domain_name, name, score, item_type, rubric, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [year, semester, grade, subject, domainName, item.name, item.score, item.item_type, item.rubric, item.sort_order]
      );
    }
  });
  res.json({ ok: true });
});

router.get('/domain-config/export', async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  const semester = Number(req.query.semester);
  const grade = Number(req.query.grade);
  const subject = String(req.query.subject || '');
  const domainName = String(req.query.domainName || '__SUBJECT_COMPREHENSIVE__');

  const wb = new ExcelJS.Workbook();
  const meta = wb.addWorksheet('기본정보');
  meta.addRows([
    ['학년도', year],
    ['학기', semester],
    ['학년', grade],
    ['과목', subject],
    ['영역', domainName],
  ]);
  meta.getColumn(1).width = 14;
  meta.getColumn(2).width = 40;

  const setechItems = await queryAll<{ type: string; title: string; prompt: string; extensions: string; sort_order: number }>(
    'SELECT type, title, prompt, extensions, sort_order FROM domain_setech WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=? ORDER BY sort_order, id',
    [year, semester, grade, subject, domainName]
  );
  const evalItems = await queryAll<{ name: string; score: string; item_type: string; rubric: string; sort_order: number }>(
    'SELECT name, score, item_type, rubric, sort_order FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=? ORDER BY sort_order, id',
    [year, semester, grade, subject, domainName]
  );

  const standards = wb.addWorksheet('성취평가기준');
  standards.addRow(['sort_order', 'domain_name_ref', 'code', 'content']);
  setechItems.filter(item => item.type === '성취기준').forEach((item, index) => {
    let ref = { domain_name_ref: '', code: item.title, content: '' };
    try { const p = JSON.parse(item.extensions || '{}'); ref = { domain_name_ref: p.domain_name_ref || '', code: p.code || item.title, content: p.content || '' }; } catch { /* use fallback */ }
    standards.addRow([item.sort_order ?? index, ref.domain_name_ref, ref.code, ref.content]);
  });

  const evalSheet = wb.addWorksheet('채점기준');
  evalSheet.addRow(['sort_order', 'item_type', 'name', 'score', 'rubric']);
  evalItems.forEach((item, index) => evalSheet.addRow([item.sort_order ?? index, item.item_type, item.name, item.score, item.rubric]));

  const setechSheet = wb.addWorksheet('세특기준');
  setechSheet.addRow(['sort_order', 'type', 'title', 'prompt', 'extensions']);
  setechItems.filter(item => item.type !== '성취기준').forEach((item, index) => {
    setechSheet.addRow([item.sort_order ?? index, item.type, item.title, item.prompt, item.extensions]);
  });

  for (const sheet of wb.worksheets) {
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach(col => {
      const vals = (col.values as (unknown)[]).filter(v => v !== undefined && v !== null);
      const maxLen = vals.length > 0
        ? Math.max(...vals.map(v => String(v).length + 4))
        : 14;
      col.width = Math.max(14, Math.min(60, maxLen));
      col.alignment = { vertical: 'top', wrapText: true };
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const safeDomain = domainName === '__SUBJECT_COMPREHENSIVE__' ? '종합세특' : domainName;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeDownloadName(`${year}_${semester}_${grade}_${subject}_${safeDomain}_기준.xlsx`)}`);
  res.send(buffer);
});

router.post('/domain-config/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const year = Number(req.body.year);
  const semester = Number(req.body.semester);
  const grade = Number(req.body.grade);
  const subject = String(req.body.subject || '');
  const domainName = String(req.body.domainName || '__SUBJECT_COMPREHENSIVE__');

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);

    const standardRows: { domain_name_ref: string; code: string; content: string; sort_order: number }[] = [];
    const standards = wb.getWorksheet('성취평가기준');
    if (standards) {
      const h = headerMap(standards.getRow(1));
      standards.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const code = cellText(row.getCell(h.code).value);
        if (!code) return;
        standardRows.push({
          sort_order: Number(cellText(row.getCell(h.sort_order).value)) || standardRows.length,
          domain_name_ref: cellText(row.getCell(h.domain_name_ref).value),
          code,
          content: cellText(row.getCell(h.content).value),
        });
      });
    }

    const evalRows: { name: string; score: string; item_type: string; rubric: string; sort_order: number }[] = [];
    const evalSheet = wb.getWorksheet('채점기준');
    if (evalSheet) {
      const h = headerMap(evalSheet.getRow(1));
      evalSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const name = cellText(row.getCell(h.name).value);
        const itemType = cellText(row.getCell(h.item_type).value) || 'llm';
        if (!name && itemType !== 'formula') return;
        evalRows.push({
          sort_order: Number(cellText(row.getCell(h.sort_order).value)) || evalRows.length,
          item_type: itemType,
          name: name || '합계',
          score: cellText(row.getCell(h.score ?? h.excel_col).value),
          rubric: cellText(row.getCell(h.rubric).value),
        });
      });
    }

    const setechRows: { type: string; title: string; prompt: string; extensions: string; sort_order: number }[] = [];
    const setechSheet = wb.getWorksheet('세특기준');
    if (setechSheet) {
      const h = headerMap(setechSheet.getRow(1));
      setechSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const type = cellText(row.getCell(h.type).value) || '항목';
        const title = cellText(row.getCell(h.title).value);
        const prompt = cellText(row.getCell(h.prompt).value);
        if (!title && !prompt) return;
        setechRows.push({
          sort_order: Number(cellText(row.getCell(h.sort_order).value)) || setechRows.length,
          type,
          title,
          prompt,
          extensions: cellText(row.getCell(h.extensions).value),
        });
      });
    }

    await transaction(async () => {
      await execute('DELETE FROM domain_setech WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?', [year, semester, grade, subject, domainName]);
      await execute('DELETE FROM domain_eval WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?', [year, semester, grade, subject, domainName]);

      for (const [index, row] of standardRows.entries()) {
        const extensions = JSON.stringify({
          domain_name_ref: row.domain_name_ref,
          code: row.code,
          content: row.content,
        });
        await execute(
          'INSERT INTO domain_setech(year, semester, grade, subject, domain_name, type, title, prompt, extensions, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [year, semester, grade, subject, domainName, '성취기준', row.code, '', extensions, row.sort_order ?? index]
        );
      }
      for (const [index, row] of setechRows.entries()) {
        await execute(
          'INSERT INTO domain_setech(year, semester, grade, subject, domain_name, type, title, prompt, extensions, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [year, semester, grade, subject, domainName, row.type, row.title, row.prompt, row.extensions, row.sort_order ?? standardRows.length + index]
        );
      }
      for (const [index, row] of evalRows.entries()) {
        await execute(
          'INSERT INTO domain_eval(year, semester, grade, subject, domain_name, name, score, item_type, rubric, sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [year, semester, grade, subject, domainName, row.name, row.score, row.item_type === 'formula' ? 'formula' : 'llm', row.rubric, row.sort_order ?? index]
        );
      }
    });

    res.json({ ok: true, standards: standardRows.length, setech: setechRows.length, eval: evalRows.length });
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch { /* ignore */ }
  }
});

export default router;
