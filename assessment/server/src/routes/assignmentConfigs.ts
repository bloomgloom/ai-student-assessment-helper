import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { assignmentExecute, assignmentQueryAll, assignmentQueryOne, assignmentTransaction } from '../services/assignmentDb';
import { queryAll, queryOne } from '../services/db';
import { UPLOADS_DIR, ensureDir, resolveStoredPath, toStoredPath } from '../services/storage';
import { decodeUploadFilename } from '../services/filename';

const router = Router();
const RESOURCE_DIR = path.join(UPLOADS_DIR, 'assignment-resources');
ensureDir(RESOURCE_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RESOURCE_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${decodeUploadFilename(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ipynb': 'application/x-ipynb+json; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
};

function previewContentType(filename: string, mimeType = '') {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  return PREVIEW_CONTENT_TYPES[path.extname(filename).toLowerCase()] || mimeType || 'application/octet-stream';
}

function code(): string {
  return crypto.randomBytes(8).toString('hex');
}

function scope(req: Request) {
  return {
    year: Number(req.query.year ?? req.body?.year),
    semester: Number(req.query.semester ?? req.body?.semester),
    grade: Number(req.query.grade ?? req.body?.grade),
    subject: String(req.query.subject ?? req.body?.subject ?? ''),
    domainName: String(req.query.domainName ?? req.body?.domainName ?? ''),
  };
}

function assertScope(s: ReturnType<typeof scope>, res: Response): boolean {
  if (!s.year || !s.semester || !s.grade || !s.subject || !s.domainName) {
    res.status(400).json({ error: '학년도, 학기, 학년, 과목, 영역이 필요합니다.' });
    return false;
  }
  return true;
}

function normalizeAllowedExtensions(value: string): string {
  try {
    const parsed = JSON.parse(value || '[]');
    if (Array.isArray(parsed)) {
      return JSON.stringify(
        parsed
          .map(item => ({
            extension: String(item.extension || item.ext || '').trim().replace(/^\./, '').toLowerCase(),
            max_file_size_mb: Math.max(1, Number(item.max_file_size_mb || item.maxFileSizeMb || 50)),
            max_files: Math.max(1, Number(item.max_files || item.maxFiles || 1)),
          }))
          .filter(item => item.extension)
          .filter((item, index, arr) => arr.findIndex(other => other.extension === item.extension) === index)
      );
    }
  } catch {
    // Legacy newline/comma separated extension list.
  }
  return String(value || '')
    .split(/[\s,]+/)
    .map(item => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .join('\n');
}

async function ensureConfig(s: ReturnType<typeof scope>) {
  const existing = await assignmentQueryOne<{ id: number }>(
    `SELECT id FROM assignment_configs
     WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?`,
    [s.year, s.semester, s.grade, s.subject, s.domainName]
  );
  if (existing) return existing.id;

  const title = `${s.subject} ${s.domainName}`;
  const r = await assignmentExecute(
    `INSERT INTO assignment_configs(year, semester, grade, subject, domain_name, title, share_code, viewer_code)
     VALUES(?,?,?,?,?,?,?,?)`,
    [s.year, s.semester, s.grade, s.subject, s.domainName, title, code(), code()]
  );
  return Number(r.lastInsertRowid);
}

export async function syncAssignmentSnapshotsForAssessmentClass(classId: number | string): Promise<void> {
  const cls = await queryOne<{ id: number; year: number; semester: number; grade: number; subject: string; room: string; scoring_filename: string }>(
    'SELECT id, year, semester, grade, subject, room, scoring_filename FROM classes WHERE id=?',
    [classId]
  );
  if (!cls?.scoring_filename) return;

  const domains = await queryAll<{ name: string }>(
    'SELECT name FROM assessment_domains WHERE class_id=? ORDER BY sort_order, id',
    [classId]
  );
  const students = await queryAll<{ id: number; student_num: number; name: string }>(
    'SELECT id, student_num, name FROM class_students WHERE class_id=? ORDER BY student_num, name',
    [classId]
  );

  for (const domain of domains) {
    const configId = await ensureConfig({
      year: cls.year,
      semester: cls.semester,
      grade: cls.grade,
      subject: cls.subject,
      domainName: domain.name,
    });
    let assignmentClass = await assignmentQueryOne<{ id: number }>(
      'SELECT id FROM assignment_classes WHERE config_id=? AND assessment_class_id=?',
      [configId, cls.id]
    );
    if (!assignmentClass) {
      const r = await assignmentExecute(
        'INSERT INTO assignment_classes(config_id, assessment_class_id, room) VALUES(?,?,?)',
        [configId, cls.id, cls.room]
      );
      assignmentClass = { id: Number(r.lastInsertRowid) };
    } else {
      await assignmentExecute('UPDATE assignment_classes SET room=? WHERE id=?', [cls.room, assignmentClass.id]);
      await assignmentExecute('DELETE FROM assignment_students WHERE assignment_class_id=?', [assignmentClass.id]);
    }

    for (const student of students) {
      const classNum = Math.floor((Number(student.student_num) % 10000) / 100);
      const seatNum = Number(student.student_num) % 100;
      await assignmentExecute(
        `INSERT INTO assignment_students(assignment_class_id, assessment_student_id, student_num, class_num, seat_num, name)
         VALUES(?,?,?,?,?,?)`,
        [assignmentClass.id, student.id, student.student_num, classNum, seatNum, student.name]
      );
    }
  }
}

export async function deleteAssignmentSnapshotForAssessmentClass(classId: number | string): Promise<void> {
  const rows = await assignmentQueryAll<{ id: number }>(
    'SELECT id FROM assignment_classes WHERE assessment_class_id=?',
    [classId]
  );
  for (const row of rows) {
    await assignmentExecute('DELETE FROM assignment_classes WHERE id=?', [row.id]);
  }
}

router.get('/config', async (req: Request, res: Response) => {
  const s = scope(req);
  if (!assertScope(s, res)) return;
  const configId = await ensureConfig(s);

  const config = await assignmentQueryOne('SELECT * FROM assignment_configs WHERE id=?', [configId]);
  const resources = await assignmentQueryAll(
    'SELECT id, filename, filepath, mime_type, size, uploaded_at FROM assignment_resources WHERE config_id=? ORDER BY uploaded_at DESC, id DESC',
    [configId]
  );
  res.json({ config, resources, classes: [] });
});

router.put('/config', async (req: Request, res: Response) => {
  const s = scope(req);
  if (!assertScope(s, res)) return;
  const configId = await ensureConfig(s);
  const title = `${s.subject} ${s.domainName}`;
  const guideMd = String(req.body?.guide_md ?? '');
  const allowedExtensions = normalizeAllowedExtensions(String(req.body?.allowed_extensions ?? ''));
  const maxFileSizeMb = Math.max(1, Number(req.body?.max_file_size_mb || 50));
  const maxFiles = Math.max(1, Number(req.body?.max_files || 1));
  await assignmentExecute(
    `UPDATE assignment_configs
     SET title=?, guide_md=?, allowed_extensions=?, max_file_size_mb=?, max_files=?, updated_at=datetime('now', 'localtime')
     WHERE id=?`,
    [title, guideMd, allowedExtensions, maxFileSizeMb, maxFiles, configId]
  );
  res.json({ ok: true, id: configId });
});

router.post('/guide-md', upload.single('file'), async (req: Request, res: Response) => {
  const s = scope(req);
  if (!assertScope(s, res)) return;
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  try {
    const guideMd = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
    const configId = await ensureConfig(s);
    await assignmentExecute(
      `UPDATE assignment_configs SET guide_md=?, updated_at=datetime('now', 'localtime') WHERE id=?`,
      [guideMd, configId]
    );
    res.json({ guide_md: guideMd });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post('/resources', upload.array('files', 20), async (req: Request, res: Response) => {
  const s = scope(req);
  if (!assertScope(s, res)) return;
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: '파일이 없습니다.' });
  const configId = await ensureConfig(s);
  await assignmentTransaction(async () => {
    for (const file of files) {
      await assignmentExecute(
        'INSERT INTO assignment_resources(config_id, filename, filepath, mime_type, size) VALUES(?,?,?,?,?)',
        [configId, decodeUploadFilename(file.originalname), toStoredPath(file.path), file.mimetype || '', file.size || 0]
      );
    }
  });
  res.json({ uploaded: files.length });
});

router.get('/resources/:id/file', async (req: Request, res: Response) => {
  const resource = await assignmentQueryOne<{ filename: string; filepath: string; mime_type: string }>(
    'SELECT filename, filepath, mime_type FROM assignment_resources WHERE id=?',
    [req.params.id]
  );
  const filepath = resource ? resolveStoredPath(resource.filepath) : '';
  if (!resource || !fs.existsSync(filepath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  res.setHeader('Content-Type', previewContentType(resource.filename, resource.mime_type));
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(resource.filename)}`);
  res.sendFile(path.resolve(filepath));
});

router.delete('/resources/:id', async (req: Request, res: Response) => {
  const resource = await assignmentQueryOne<{ filepath: string }>(
    'SELECT filepath FROM assignment_resources WHERE id=?',
    [req.params.id]
  );
  if (!resource) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  try { if (resource.filepath) fs.unlinkSync(resolveStoredPath(resource.filepath)); } catch {}
  await assignmentExecute('DELETE FROM assignment_resources WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.get('/submissions', async (req: Request, res: Response) => {
  const s = scope(req);
  if (!assertScope(s, res)) return;
  const room = req.query.room ? String(req.query.room) : '';
  const rows = await assignmentQueryAll(
    `SELECT sub.*, ac.room, cfg.title, cfg.domain_name
     FROM assignment_submissions sub
     JOIN assignment_runs run ON run.id=sub.run_id
     JOIN assignment_classes ac ON ac.id=run.assignment_class_id
     JOIN assignment_configs cfg ON cfg.id=run.config_id
     WHERE cfg.year=? AND cfg.semester=? AND cfg.grade=? AND cfg.subject=? AND cfg.domain_name=?
       AND (?='' OR ac.room=?)
     ORDER BY sub.submitted_at DESC, sub.id DESC`,
    [s.year, s.semester, s.grade, s.subject, s.domainName, room, room]
  );
  res.json(rows);
});

router.get('/submissions/:id/file', async (req: Request, res: Response) => {
  const submission = await assignmentQueryOne<{ original_filename: string; filepath: string; mime_type: string }>(
    'SELECT original_filename, filepath, mime_type FROM assignment_submissions WHERE id=?',
    [req.params.id]
  );
  const filepath = submission ? resolveStoredPath(submission.filepath) : '';
  if (!submission || !fs.existsSync(filepath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  res.setHeader('Content-Type', submission.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(submission.original_filename)}`);
  res.sendFile(path.resolve(filepath));
});

export default router;
