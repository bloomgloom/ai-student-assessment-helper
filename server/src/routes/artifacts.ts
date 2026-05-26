import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as unzipper from 'unzipper';
import * as cheerio from 'cheerio';
import { execute, queryOne, queryAll } from '../services/db';
import { UPLOADS_DIR, ensureDir } from '../services/storage';
import { decodeUploadFilename } from '../services/filename';

const router = Router();

const UPLOAD_DIR = path.join(UPLOADS_DIR, 'artifacts');
const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');
[UPLOAD_DIR, TEMP_DIR].forEach(ensureDir);

const upload = multer({ dest: TEMP_DIR, limits: { fileSize: 200 * 1024 * 1024 } });

// 텍스트 파일 확장자 → charset=utf-8 포함 Content-Type
const TEXT_CONTENT_TYPES: Record<string, string> = {
  '.py':   'text/x-python; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.jsx':  'text/javascript; charset=utf-8',
  '.ts':   'text/typescript; charset=utf-8',
  '.tsx':  'text/typescript; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.c':    'text/x-c; charset=utf-8',
  '.cpp':  'text/x-c++; charset=utf-8',
  '.h':    'text/x-c; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.sql':  'text/x-sql; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ipynb': 'application/x-ipynb+json; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.hwpx': 'application/vnd.hancom.hwpx',
};

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getArtifactExt(filename: string): string {
  return path.extname(filename.normalize('NFC')).toLowerCase();
}

/**
 * 파일명에서 "5자리 학번 + 이름" 패턴을 찾아
 * 주어진 학생 목록과 학번·이름 모두 일치하는 학생을 반환한다.
 * - 파일명 앞/중간/뒤에 다른 문자열이 있어도 허용
 * - 학번은 5자리 숫자이며, 이름보다 앞에 있어야 함
 * - 이름은 2~5자 학생명만 대상으로 함
 * - 순서는 반드시 학번 → 이름 순
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchStudentByFilename(
  decodedName: string,
  students: { id: number; student_num: number; name: string }[]
): { id: number; student_num: number; name: string } | undefined {
  const normalizedName = decodedName.normalize('NFC');
  const candidates = [...students]
    .filter(student => student.name.length >= 2 && student.name.length <= 5)
    .sort((a, b) => b.name.length - a.name.length);

  for (const student of candidates) {
    const numberPattern = new RegExp(`(?<![0-9])${student.student_num}(?![0-9])`, 'g');
    const namePattern = new RegExp(escapeRegExp(student.name), 'g');

    const numberPositions = [...normalizedName.matchAll(numberPattern)].map(match => match.index ?? -1);
    if (numberPositions.length === 0) continue;

    for (const nameMatch of normalizedName.matchAll(namePattern)) {
      const nameIndex = nameMatch.index ?? -1;
      if (numberPositions.some(numberIndex => numberIndex >= 0 && numberIndex < nameIndex)) return student;
    }
  }
  return undefined;
}

async function deleteArtifactRows(rows: { id: number; filepath: string }[]): Promise<void> {
  for (const row of rows) {
    try { if (fs.existsSync(row.filepath)) fs.unlinkSync(row.filepath); } catch {}
    await execute('DELETE FROM artifacts WHERE id=?', [row.id]);
  }
}

async function deleteArtifactsByStudentDomainExt(studentId: number | string, domain: string, ext: string): Promise<void> {
  const normalizedExt = ext.toLowerCase();
  if (!normalizedExt) return;

  const existing = await queryAll<{ id: number; filename: string; filepath: string }>(
    'SELECT id, filename, filepath FROM artifacts WHERE student_id=? AND domain=?',
    [studentId, domain]
  );
  await deleteArtifactRows(existing.filter(row => getArtifactExt(row.filename) === normalizedExt));
}

async function deleteArtifactByStudentDomainFilename(studentId: number | string, domain: string, filename: string): Promise<void> {
  const existing = await queryAll<{ id: number; filepath: string }>(
    'SELECT id, filepath FROM artifacts WHERE student_id=? AND domain=? AND filename=?',
    [studentId, domain, filename]
  );
  await deleteArtifactRows(existing);
}

async function clearArtifactsForClassDomain(classId: number | string, domain: string): Promise<void> {
  const existing = await queryAll<{ id: number; filepath: string }>(
    `SELECT a.id, a.filepath
     FROM artifacts a
     JOIN class_students cs ON cs.id = a.student_id
     WHERE cs.class_id=? AND a.domain=?`,
    [classId, domain]
  );
  await deleteArtifactRows(existing);
}

// HWPX → HTML 변환
async function hwpxToHtml(buffer: Buffer): Promise<string> {
  const dir = await unzipper.Open.buffer(buffer);

  let xmlEntry = dir.files.find(f => f.path === 'Contents/section0.xml');
  if (!xmlEntry) xmlEntry = dir.files.find(f => f.path.toLowerCase().endsWith('section0.xml'));
  if (!xmlEntry) throw new Error('HWPX: section0.xml을 찾을 수 없습니다.');

  const xmlContent = (await xmlEntry.buffer()).toString('utf8');
  const $ = cheerio.load(xmlContent, { xmlMode: true });

  // 첫 번째 표의 첫 행 삭제
  $('hp\\:tbl').first().find('hp\\:tr').first().remove();

  // hp:run → <span style="...">text</span>
  function renderRun(run: any): string {
    const text = $(run).find('hp\\:t').map((_: number, t: any) => $(t).text()).get().join('');
    if (!text) return '';

    const charPr = $(run).find('hp\\:charPr').first();
    const styles: string[] = [];

    // Bold: <hp:bold/> 또는 <hp:bold val="1"/> 또는 속성 bold="1"
    const boldEl = charPr.find('hp\\:bold');
    if (boldEl.length && boldEl.attr('val') !== '0') styles.push('font-weight:bold');
    if (!boldEl.length && (charPr.attr('bold') === '1' || charPr.attr('bold') === 'true')) styles.push('font-weight:bold');

    // Italic
    const italicEl = charPr.find('hp\\:italic');
    if (italicEl.length && italicEl.attr('val') !== '0') styles.push('font-style:italic');
    if (!italicEl.length && (charPr.attr('italic') === '1' || charPr.attr('italic') === 'true')) styles.push('font-style:italic');

    // Underline
    const ulEl = charPr.find('hp\\:underline');
    const ulVal = ulEl.attr('val') ?? charPr.attr('underline') ?? '';
    if (ulVal && ulVal !== 'none' && ulVal !== '0' && ulVal !== 'false') styles.push('text-decoration:underline');

    // Strikeout
    const soEl = charPr.find('hp\\:strikeout');
    if (soEl.length && soEl.attr('val') !== 'none' && soEl.attr('val') !== '0') styles.push('text-decoration:line-through');

    // Font color: <hp:fontColor val="RRGGBB"/> 또는 속성
    const colorEl = charPr.find('hp\\:fontColor');
    const colorVal = (colorEl.attr('val') ?? charPr.attr('fontColor') ?? '').replace(/^#/, '');
    if (colorVal && !/^0{6}$/i.test(colorVal) && !/^f{6}$/i.test(colorVal)) {
      styles.push(`color:#${colorVal}`);
    }

    // Font size: HWP는 0.1pt 단위로 저장 (예: 100 = 10pt)
    const sizeEl = charPr.find('hp\\:fontSize');
    const sizeVal = sizeEl.attr('val') ?? charPr.attr('fontSize') ?? '';
    if (sizeVal) {
      const pt = Math.round(parseInt(sizeVal) / 10);
      if (pt > 0 && pt !== 10) styles.push(`font-size:${pt}pt`);
    }

    const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
    return `<span${styleAttr}>${escHtml(text)}</span>`;
  }

  // hp:p → <p style="...">...</p>
  function renderPara(p: any): string {
    const paraPr = $(p).find('hp\\:paraPr').first();
    const styles: string[] = [];

    // 정렬
    const jc = paraPr.find('hp\\:jc').attr('val') ?? paraPr.attr('align') ?? '';
    if (jc === 'center') styles.push('text-align:center');
    else if (jc === 'right') styles.push('text-align:right');
    else if (jc === 'justify' || jc === 'distribute') styles.push('text-align:justify');

    // 들여쓰기
    const indent = paraPr.find('hp\\:ind').attr('left') ?? '';
    if (indent) {
      const indPt = Math.round(parseInt(indent) / 100);
      if (indPt > 0) styles.push(`padding-left:${indPt}pt`);
    }

    let content = '';
    $(p).children('hp\\:run').each((_: number, run: any) => { content += renderRun(run); });
    // hp:ctrl 내부 텍스트도 수집 (탭, 특수문자 등)
    $(p).children('hp\\:ctrl').each((_: number, ctrl: any) => {
      const t = $(ctrl).find('hp\\:t').map((_: number, el: any) => $(el).text()).get().join('');
      if (t.trim()) content += escHtml(t);
    });

    if (!content.trim()) return '<p>&nbsp;</p>';
    const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
    return `<p${styleAttr}>${content}</p>\n`;
  }

  // hp:tc → <td colspan rowspan>...</td>
  function renderCell(tc: any): string {
    // colspan/rowspan: 속성 또는 자식 hp:cellSpan
    let colSpan = parseInt($(tc).attr('colSpan') ?? $(tc).attr('colspan') ?? '1') || 1;
    let rowSpan = parseInt($(tc).attr('rowSpan') ?? $(tc).attr('rowspan') ?? '1') || 1;
    const spanEl = $(tc).find('hp\\:cellSpan').first();
    if (spanEl.length) {
      colSpan = parseInt(spanEl.attr('colSpan') ?? spanEl.attr('colspan') ?? String(colSpan)) || colSpan;
      rowSpan = parseInt(spanEl.attr('rowSpan') ?? spanEl.attr('rowspan') ?? String(rowSpan)) || rowSpan;
    }

    let content = '';
    $(tc).find('hp\\:subList > hp\\:p').each((_: number, p: any) => { content += renderPara(p); });
    if (!content) {
      // subList 없는 경우 직접 p 탐색
      $(tc).children('hp\\:p').each((_: number, p: any) => { content += renderPara(p); });
    }

    const attrs = [
      colSpan > 1 ? `colspan="${colSpan}"` : '',
      rowSpan > 1 ? `rowspan="${rowSpan}"` : '',
    ].filter(Boolean).join(' ');

    return `<td${attrs ? ' ' + attrs : ''}>${content || '&nbsp;'}</td>`;
  }

  let bodyHtml = '';

  $('hp\\:body hp\\:section').children().each((_: number, elem: any) => {
    const tagName = ((elem as any).tagName || '').toLowerCase();

    if (tagName === 'hp:p') {
      bodyHtml += renderPara(elem);
    } else if (tagName === 'hp:tbl') {
      bodyHtml += '<table>\n';
      $(elem).find('> hp\\:tr, hp\\:tblBody > hp\\:tr').each((_: number, tr: any) => {
        bodyHtml += '<tr>';
        $(tr).children('hp\\:tc').each((_: number, tc: any) => { bodyHtml += renderCell(tc); });
        bodyHtml += '</tr>\n';
      });
      bodyHtml += '</table>\n';
    }
  });

  // fallback
  if (!bodyHtml.trim()) {
    const allText = $('hp\\:t').map((_: number, t: any) => $(t).text()).get().filter((s: string) => s.trim()).join('\n');
    bodyHtml = `<pre>${escHtml(allText)}</pre>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; line-height: 1.8; padding: 24px; font-size: 11pt; color: #111; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; }
td, th { border: 1px solid #888; padding: 5px 8px; vertical-align: top; }
p { margin: 0.15em 0; }
pre { white-space: pre-wrap; font-family: inherit; }
</style>
</head>
<body>
${bodyHtml || '<p>(내용 없음)</p>'}
</body>
</html>`;
}

// ── 개별 파일 업로드 ──────────────────────────────────────────────────────────
router.post('/student/:studentId', upload.array('files', 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: '파일이 없습니다.' });

  const domain = (req.body.domain as string) || '';
  const inserted: number[] = [];

  try {
    for (const file of files) {
      let origName = decodeUploadFilename(file.originalname);
      const ext = path.extname(origName).toLowerCase();

      let finalPath = file.path;
      let finalName = origName;
      let mimeType = file.mimetype;

      if (ext === '.hwpx') {
        mimeType = TEXT_CONTENT_TYPES['.hwpx'];
        await deleteArtifactByStudentDomainFilename(
          req.params.studentId,
          domain,
          origName.replace(/\.hwpx$/i, '.html')
        );
      }

      // 기존 도구와 동일하게 같은 학생/영역의 같은 확장자 파일은 새 파일로 교체한다.
      await deleteArtifactsByStudentDomainExt(req.params.studentId, domain, getArtifactExt(finalName));
      const r = await execute(
        'INSERT INTO artifacts(student_id, domain, filename, filepath, mime_type) VALUES(?,?,?,?,?)',
        [req.params.studentId, domain, finalName, finalPath, mimeType]
      );
      inserted.push(Number(r.lastInsertRowid));
    }
    res.json({ uploaded: inserted.length, ids: inserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── 도메인별 산출물 조회 ───────────────────────────────────────────────────────
router.get('/student/:studentId/domain/:domain', async (req: Request, res: Response) => {
  const artifacts = await queryAll(
    'SELECT * FROM artifacts WHERE student_id=? AND domain=? ORDER BY uploaded_at DESC',
    [req.params.studentId, req.params.domain]
  );
  res.json(artifacts);
});

// ── 일괄 ZIP 업로드 ────────────────────────────────────────────────────────────
router.post('/bulk-upload/:classId', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
  const { classId } = req.params;
  const domain = req.body.domain || '';

  try {
    const cls = await queryOne<{ year: number; semester: number; grade: number; subject: string; room: string }>(
      'SELECT * FROM classes WHERE id=?', [classId]
    );
    if (!cls) throw new Error('수업을 찾을 수 없습니다.');

    const students = await queryAll<{ id: number; student_num: number; name: string }>(
      'SELECT id, student_num, name FROM class_students WHERE class_id=?', [classId]
    );

    const baseUploadDir = path.join(
      UPLOAD_DIR, String(cls.year), String(cls.semester), String(cls.grade), cls.subject, cls.room, domain
    );
    // 강의실-영역 단위로 기존 DB 레코드와 실제 저장 파일을 모두 초기화한다.
    await clearArtifactsForClassDomain(classId, domain);
    fs.rmSync(baseUploadDir, { recursive: true, force: true });
    fs.mkdirSync(baseUploadDir, { recursive: true });

    let count = 0;
    const sampleFilenames: string[] = [];
    let fileEntryCount = 0;

    const directory = await unzipper.Open.file(req.file.path);

    for (const entry of directory.files) {
      if (entry.type === 'Directory') continue;

      const fullPath = entry.path;

      // __MACOSX, 숨김파일 필터 (경로 전체 기준)
      if (fullPath.includes('__MACOSX') || fullPath.split('/').some(p => p.startsWith('.'))) continue;

      // Windows 백슬래시 대응
      const rawFileName = fullPath.split(/[/\\]/).pop() || '';
      if (!rawFileName || rawFileName.startsWith('.')) continue;

      fileEntryCount++;
      if (sampleFilenames.length < 5) sampleFilenames.push(rawFileName);

      // 파일명 인코딩 처리 (UTF-8 우선, 깨지면 latin1→utf8)
      let decodedName = rawFileName.normalize('NFC');
      if (decodedName.includes('\uFFFD')) {
        try { decodedName = Buffer.from(rawFileName, 'latin1').toString('utf8').normalize('NFC'); } catch {}
      }

      // 파일명에서 "학번(5자리) + 이름(한글 2~4자)" 패턴을 추출해 DB와 학번·이름 모두 매칭
      const student = matchStudentByFilename(decodedName, students);
      if (!student) continue;

      // 파일 내용 읽기
      let fileBuffer: Buffer;
      try {
        fileBuffer = await entry.buffer();
      } catch (e) {
        console.error(`항목 읽기 실패, 건너뜀: ${fullPath}`, e);
        continue;
      }

      const fileExt = path.extname(decodedName).toLowerCase();

      const savePath = path.join(baseUploadDir, `${Date.now()}_${count}_${decodedName}`);
      fs.writeFileSync(savePath, fileBuffer);
      const ct = TEXT_CONTENT_TYPES[fileExt] || '';
      await execute(
        'INSERT INTO artifacts(student_id, domain, filename, filepath, mime_type) VALUES(?,?,?,?,?)',
        [student.id, domain, decodedName, savePath, ct]
      );
      count++;
    }

    fs.unlinkSync(req.file.path);

    let message = `총 ${count}개의 산출물 파일이 성공적으로 연동되었습니다.`;
    if (count === 0 && fileEntryCount > 0) {
      message += ` (ZIP에서 ${fileEntryCount}개 파일 발견, DB 학생 ${students.length}명과 매칭 없음. 파일명에 "학번(5자리)+이름(한글)" 패턴이 있어야 합니다. 파일명 예시: ${sampleFilenames.join(', ')})`;
    }

    res.json({ message, count });
  } catch (error: any) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: error.message });
  }
});

// ── 파일 서빙 ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  const artifact = await queryOne(
    'SELECT id, filename, mime_type, domain, uploaded_at FROM artifacts WHERE id=?',
    [req.params.id]
  );
  if (!artifact) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  res.json(artifact);
});

router.get('/:id/file', async (req: Request, res: Response) => {
  const artifact = await queryOne<{ filename: string; filepath: string; mime_type: string }>(
    'SELECT * FROM artifacts WHERE id=?', [req.params.id]
  );
  if (!artifact || !fs.existsSync(artifact.filepath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }

  // 텍스트/코드 파일은 charset=utf-8 강제 설정 (새창 한글 깨짐 방지)
  const ext = path.extname(artifact.filename).toLowerCase();
  const contentType = TEXT_CONTENT_TYPES[ext]
    || artifact.mime_type
    || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`);
  res.sendFile(path.resolve(artifact.filepath));
});

// ── 파일 삭제 ──────────────────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const artifact = await queryOne<{ filepath: string }>(
    'SELECT filepath FROM artifacts WHERE id=?', [req.params.id]
  );
  if (!artifact) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  try {
    if (fs.existsSync(artifact.filepath)) fs.unlinkSync(artifact.filepath);
    await execute('DELETE FROM artifacts WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
