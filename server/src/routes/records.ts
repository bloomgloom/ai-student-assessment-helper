import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { queryAll, queryOne, execute, transaction } from '../services/db';
import { parseStudentExcel, exportToExcel, writeScoringToExcel, writeSetechToExcel } from '../services/excel';
import { decodeUploadFilename } from '../services/filename';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `excel_${Date.now()}_${decodeUploadFilename(file.originalname)}`),
});
const upload = multer({ storage });

const router = Router();

router.get('/students/:studentId/content', async (req: Request, res: Response) => {
  const content = await queryAll(
    'SELECT * FROM generated_content WHERE student_id=?',
    [req.params.studentId]
  );
  res.json(content);
});

router.get('/classes/:classId/content', async (req: Request, res: Response) => {
  const { domain } = req.query;
  let sql = `
    SELECT gc.* 
    FROM generated_content gc
    JOIN class_students cs ON gc.student_id = cs.id
    WHERE cs.class_id = ?
  `;
  const args: any[] = [req.params.classId];
  if (domain) {
    sql += ' AND gc.domain = ?';
    args.push(domain);
  }
  const content = await queryAll(sql, args);
  res.json(content);
});

router.put('/students/:studentId/content', async (req: Request, res: Response) => {
  const { content_type, domain, content } = req.body as { content_type: string; domain: string; content: string };
  await execute(`
    INSERT INTO generated_content(student_id, content_type, domain, content, updated_at)
    VALUES(?,?,?,?,datetime('now'))
    ON CONFLICT(student_id, content_type, domain)
    DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
  `, [req.params.studentId, content_type, domain, content]);
  res.json({ ok: true });
});

router.get('/export/:classId', async (req: Request, res: Response) => {
  const classId = req.params.classId;
  const type = (req.query.type as string) || 'setech';

  const cls = await queryOne<{
    year: number; semester: number; grade: number; subject: string; room: string;
    scoring_filename: string; scoring_filepath: string;
    setech_filename: string; setech_filepath: string; filename: string;
  }>('SELECT * FROM classes WHERE id=?', [classId]);
  if (!cls) return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });

  const students = await queryAll<{
    id: number; student_num: number; name: string; excel_row: number; personal_num: string;
  }>('SELECT * FROM class_students WHERE class_id=? ORDER BY student_num', [classId]);
  if (!students.length) return res.status(400).json({ error: '학생 데이터가 없습니다.' });

  try {
    let buffer: Buffer;
    let downloadName: string;

    if (type === 'scoring') {
      // ── 채점 파일에 영역별 합계 점수 기록 ─────────────────────────────
      if (!cls.scoring_filepath || !fs.existsSync(cls.scoring_filepath)) {
        return res.status(400).json({ error: '채점 원본 파일이 없습니다. 파일을 먼저 업로드해주세요.' });
      }

      const domains = await queryAll<{ name: string; excel_col: string }>(
        'SELECT name, excel_col FROM assessment_domains WHERE class_id=? ORDER BY sort_order',
        [classId]
      );

      const entries: { excelRow: number; excelCol: string; score: number | null }[] = [];
      for (const s of students) {
        for (const d of domains) {
          if (!d.excel_col) continue;
          const row = await queryOne<{ content: string }>(
            `SELECT content FROM generated_content WHERE student_id=? AND content_type='scoring' AND domain=?`,
            [s.id, d.name]
          );
          let score: number | null = null;
          if (row?.content) {
            try {
              const parsed = JSON.parse(row.content);
              score = parsed.total != null ? Number(parsed.total) : null;
            } catch { /* ignore */ }
          }
          entries.push({ excelRow: s.excel_row, excelCol: d.excel_col, score });
        }
      }

      buffer = await writeScoringToExcel(cls.scoring_filepath, entries);
      downloadName = cls.scoring_filename || cls.filename;

    } else {
      // ── 세특 파일에 종합 세특 기록 ────────────────────────────────────
      if (!cls.setech_filepath || !fs.existsSync(cls.setech_filepath)) {
        return res.status(400).json({ error: '세특 원본 파일이 없습니다. 파일을 먼저 업로드해주세요.' });
      }

      const entries: { personalNum: string; setechText: string }[] = [];
      for (const s of students) {
        if (!s.personal_num) continue;
        const row = await queryOne<{ content: string }>(
          `SELECT content FROM generated_content WHERE student_id=? AND content_type='setech' AND domain='__SUBJECT_COMPREHENSIVE__'`,
          [s.id]
        );
        let text = '';
        if (row?.content) {
          try {
            const parsed = JSON.parse(row.content);
            text = parsed.text || '';
          } catch { text = row.content; }
        }
        if (text) entries.push({ personalNum: s.personal_num, setechText: text });
      }

      buffer = await writeSetechToExcel(cls.setech_filepath, entries);
      downloadName = cls.setech_filename;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.send(buffer);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
