import { Router, Request, Response } from 'express';
import fs from 'fs';
import { queryAll, queryOne } from '../services/db';
import { callLLM, createLLMLogSession, getLLMSettings, type LLMImageAttachment, type LLMLogSession, type LLMSettings } from '../services/llm';
import { extractHwpxText } from '../services/hwpx';
import { imageFileToAttachment, pdfToRedactedJpegAttachments } from '../services/visionArtifacts';
import { buildNotebookExecutionEvidence, buildTabularDataEvidence } from '../services/artifactEvidence';
import { resolveStoredPath } from '../services/storage';

const router = Router();

interface ArtifactRow {
  id: number;
  filename: string;
  filepath: string;
  mime_type: string;
}

interface GenerateRequest {
  studentId: number;
  domain: string;
  contentType: 'scoring' | 'comments';
  criteriaSetId: number;
}

interface BatchGenerateRequest {
  classId?: number;
  sessionId?: number;
  domain: string;
  contentType: 'scoring' | 'comments';
  criteriaSetId?: number;
  studentIds?: number[];
}

interface ClassContext {
  year: number;
  semester: number;
  grade: number;
  subject: string;
}

interface EvalCriterion {
  name: string;
  score: string;
  item_type: 'llm' | 'formula';
  rubric: string;
}

interface CommentsCriterion {
  type: string;
  title: string;
  prompt: string;
  extensions: string;
}

function parseSpellcheckResult(textWithTags: string): { correctedText: string; correctionCount: number } {
  const correctionCount = (textWithTags.match(/\[CHANGE\]/g) || []).length;
  const correctedText = textWithTags
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, ''))
    .replace(/\[CHANGE\]([\s\S]*?)\[\/CHANGE\]/g, '$1')
    .trim();
  return { correctedText, correctionCount };
}

function requestAbortSignal(req: Request, res: Response): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.on('aborted', abort);
  res.on('close', () => {
    if (!res.writableEnded) abort();
  });
  return controller.signal;
}

router.post('/spellcheck', async (req: Request, res: Response) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: '검사할 텍스트가 없습니다.' });
  const signal = requestAbortSignal(req, res);

  const prompt = `
다음 텍스트의 맞춤법, 띄어쓰기, 문맥 오류를 교정해줘.
원래 문장의 의미나 말투를 최대한 유지하면서, 어색한 부분만 자연스럽게 다듬어줘.

[중요]
교정하면서 수정되거나 추가된 부분은 반드시 [CHANGE]와 [/CHANGE] 태그로 감싸줘.
변경되지 않은 부분은 태그 없이 그대로 둬.
설명, 제목, 마크다운 코드블록 없이 교정된 본문만 반환해.

예시:
원본: 안냐세요 반갑습니당
교정: [CHANGE]안녕하세요[/CHANGE] [CHANGE]반갑습니다[/CHANGE]

[원본 텍스트]
${text}
`;

  try {
    const taggedText = (await callLLM(prompt, undefined, signal)).trim();
    const parsed = parseSpellcheckResult(taggedText);
    res.json({ taggedText, ...parsed });
  } catch (e) {
    if (signal.aborted) return;
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/generate-prompt', async (req: Request, res: Response) => {
  const { prompt, systemPrompt } = req.body;
  if (!prompt) return res.status(400).json({ error: '프롬프트가 없습니다.' });
  const signal = requestAbortSignal(req, res);

  try {
    const settings = await getLLMSettings();
    const fullPrompt = systemPrompt ? `[System]\n${systemPrompt}\n\n[User]\n${prompt}` : prompt;
    const result = await callLLM(fullPrompt, settings, signal);
    res.json({ result });
  } catch (e) {
    if (signal.aborted) return;
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

async function getClassContextByStudent(studentId: number): Promise<ClassContext | null> {
  return queryOne<ClassContext>(`
    SELECT c.year, c.semester, c.grade, c.subject
    FROM classes c
    JOIN class_students cs ON cs.class_id = c.id
    WHERE cs.id=?
  `, [studentId]);
}

async function getClassContextByClass(classId?: number): Promise<ClassContext | null> {
  if (classId === undefined) return null;
  return queryOne<ClassContext>(
    'SELECT year, semester, grade, subject FROM classes WHERE id=?',
    [classId]
  );
}

async function getDomainEvalCriteria(classContext: ClassContext | null, domain: string): Promise<EvalCriterion[]> {
  if (!classContext) return [];
  return queryAll<EvalCriterion>(
    `SELECT name, score, item_type, rubric
     FROM domain_eval
     WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?
     ORDER BY sort_order, id`,
    [classContext.year, classContext.semester, classContext.grade, classContext.subject, domain]
  );
}

async function getDomainCommentsCriteria(classContext: ClassContext | null, domain: string): Promise<CommentsCriterion[]> {
  if (!classContext) return [];
  return queryAll<CommentsCriterion>(
    `SELECT type, title, prompt, extensions
     FROM domain_comments
     WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?
     ORDER BY sort_order, id`,
    [classContext.year, classContext.semester, classContext.grade, classContext.subject, domain]
  );
}

function extractJsonArrayText(text: string): string {
  const stripped = text
    .trim()
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

interface ScoringResultItem {
  score?: unknown;
  reason?: unknown;
}

function parseScoringResultItems(result: string): ScoringResultItem[] {
  const parsed = JSON.parse(extractJsonArrayText(result)) as unknown;
  if (!Array.isArray(parsed)) throw new Error('JSON 배열이 아닙니다.');
  return parsed.map((item) => {
    if (Array.isArray(item)) return { score: item[0], reason: item[1] };
    if (item && typeof item === 'object') return item as ScoringResultItem;
    return { score: undefined, reason: undefined };
  });
}

function buildScoringContent(result: string, criteria: EvalCriterion[]): string {
  const llmItems = criteria.filter((item) => item.item_type === 'llm');
  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  let items: ScoringResultItem[] = [];
  const content: Record<string, string | number | Record<string, string>> = {};
  const reasons: Record<string, string> = {};

  try {
    items = parseScoringResultItems(result);
  } catch (e) {
    const preview = result.replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`채점 결과가 JSON 배열 형식으로 제시되지 않아 작성하지 않았습니다. 출력: ${preview || '(빈 응답)'}`);
  }

  if (llmItems.length > 0) {
    const invalid = items.length !== llmItems.length || items.some((item) => !numericPattern.test(String(item.score ?? '').trim()));
    if (invalid) {
      const preview = result.replace(/\s+/g, ' ').trim().slice(0, 160);
      throw new Error(`채점 결과가 항목 수(${llmItems.length})에 맞는 JSON 배열 형식으로 제시되지 않아 작성하지 않았습니다. 출력: ${preview || '(빈 응답)'}`);
    }
  }

  llmItems.forEach((item, index) => {
    const resultItem = items[index] || {};
    content[item.name] = String(resultItem.score ?? '').trim();
    reasons[item.name] = String(resultItem.reason ?? '').trim();
  });
  if (Object.values(reasons).some(Boolean)) content.__reasons = reasons;

  const base = criteria
    .filter((item) => item.item_type === 'formula')
    .reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  const scoreTotal = llmItems.reduce((sum, item) => sum + (Number(content[item.name]) || 0), 0);
  content.total = base + scoreTotal;

  return JSON.stringify(content);
}

function buildStoredContent(contentType: 'scoring' | 'comments', result: string, criteria: EvalCriterion[]): string {
  if (contentType === 'scoring') return buildScoringContent(result, criteria);
  return JSON.stringify({ text: result });
}

function buildDefaultScoringContent(criteria: EvalCriterion[]): string {
  const content: Record<string, string | number> = {};
  let base = 0;
  for (const item of criteria) {
    if (item.item_type === 'formula') {
      base += Number(item.score) || 0;
    } else {
      content[item.name] = 0;
    }
  }
  content.total = base;
  return JSON.stringify(content);
}

const FILE_REFERENCE_EXTENSIONS = [
  'csv', 'tsv', 'xlsx', 'xls', 'json', 'txt', 'md', 'ipynb', 'py', 'js', 'ts', 'html', 'css',
  'xml', 'sql', 'pkl', 'pickle', 'parquet', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'hwpx',
];
const FILE_REFERENCE_EXT_PATTERN = FILE_REFERENCE_EXTENSIONS.join('|');
const UNQUOTED_FILE_REFERENCE_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_./\\\\'"\`"-])((?:\\.{1,2}[/\\\\])?(?:[^\\s'"\`<>(){}\\[\\],;:]+[/\\\\])*[^\\s'"\`<>(){}\\[\\],;:]+\\s*\\.(${FILE_REFERENCE_EXT_PATTERN}))(?![\\p{L}\\p{N}_./\\\\'"\`"-])`,
  'giu'
);
const QUOTED_TEXT_PATTERN = /(['"`])([^'"`\r\n]{0,300})\1/g;

interface ArtifactPrivacyMapper {
  artifactName(artifact: ArtifactRow): string;
  sanitizeText(text: string): string;
}

function createArtifactPrivacyMapper(artifacts: ArtifactRow[]): ArtifactPrivacyMapper {
  const mapping = new Map<string, string>();
  let nextFileIndex = 1;

  const anonymize = (rawReference: string): string => {
    const key = rawReference.normalize('NFC');
    const existing = mapping.get(key);
    if (existing) return existing;

    const ext = key.match(/\.([A-Za-z0-9]+)\s*$/)?.[1]?.toLowerCase();
    const anonymized = `file_${String(nextFileIndex).padStart(3, '0')}${ext ? `.${ext}` : ''}`;
    nextFileIndex += 1;
    mapping.set(key, anonymized);
    return anonymized;
  };

  for (const artifact of artifacts) anonymize(artifact.filename);

  return {
    artifactName(artifact: ArtifactRow): string {
      return anonymize(artifact.filename);
    },
    sanitizeText(text: string): string {
      return text
        .replace(QUOTED_TEXT_PATTERN, (_match, quote: string, content: string) => {
          const sanitizedContent = content.replace(UNQUOTED_FILE_REFERENCE_PATTERN, (_contentMatch, reference: string) => {
            return anonymize(reference);
          });
          return `${quote}${sanitizedContent}${quote}`;
        })
        .replace(UNQUOTED_FILE_REFERENCE_PATTERN, (_match, reference: string) => {
          return anonymize(reference);
        });
    },
  };
}

interface DecodedTextBuffer {
  text: string;
  encoding: string;
}

function decodeTextBufferWithEncoding(buffer: Buffer): DecodedTextBuffer {
  const encodings = ['utf-8', 'euc-kr', 'utf-16le'];
  for (const encoding of encodings) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(buffer);
      if (!decoded.includes('\uFFFD')) return { text: decoded, encoding };
    } catch { /* try next encoding */ }
  }
  return { text: buffer.toString('utf8'), encoding: 'utf-8-fallback' };
}

function decodeTextBuffer(buffer: Buffer): string {
  return decodeTextBufferWithEncoding(buffer).text;
}

function normalizeNotebookSource(source: unknown): string {
  if (Array.isArray(source)) return source.join('');
  return typeof source === 'string' ? source : '';
}

function extractIpynbInputText(buffer: Buffer, options: { skipFirstMarkdownCell?: boolean } = {}): string {
  const notebook = JSON.parse(decodeTextBuffer(buffer)) as {
    cells?: { cell_type?: string; source?: unknown }[];
  };
  if (!Array.isArray(notebook.cells)) return '';

  const chunks: string[] = [];
  notebook.cells.forEach((cell, index) => {
    if (options.skipFirstMarkdownCell && index === 0 && cell.cell_type === 'markdown') {
      return;
    }
    const source = normalizeNotebookSource(cell.source).trim();
    if (!source) return;
    if (cell.cell_type === 'markdown') {
      chunks.push(`[Markdown Cell ${index + 1}]\n${source}`);
    } else if (cell.cell_type === 'code') {
      chunks.push(`[Code Cell ${index + 1}]\n\`\`\`python\n${source}\n\`\`\``);
    }
  });
  return chunks.join('\n\n');
}

function extractCsvInputText(buffer: Buffer): DecodedTextBuffer {
  const decoded = decodeTextBufferWithEncoding(buffer);
  return { ...decoded, text: decoded.text.trim() };
}

function stripLeadingCStyleBlockComment(code: string): string {
  return code.replace(/^(\uFEFF?\s*)\/\*[\s\S]*?\*\/[ \t]*(?:\r?\n)?/, '$1');
}

function stripLeadingPythonDocstring(code: string): string {
  return code.replace(/^(\uFEFF?\s*)("""|''')[\s\S]*?\2[ \t]*(?:\r?\n)?/, '$1');
}

function stripLeadingCodeIntroBlock(code: string, ext: string): string {
  if (ext === 'py') return stripLeadingPythonDocstring(code);

  const cStyleBlockCommentExts = new Set([
    'c', 'cpp', 'h', 'java', 'js', 'jsx', 'ts', 'tsx', 'css', 'sql',
  ]);
  if (cStyleBlockCommentExts.has(ext)) return stripLeadingCStyleBlockComment(code);

  return code;
}

async function appendArtifactContents(
  parts: string[],
  artifacts: ArtifactRow[],
  settings: Pick<LLMSettings, 'artifactStripIntroBlocks' | 'pdfRedactionTopCm'>,
  attachments: LLMImageAttachment[] = [],
): Promise<boolean> {
  let hasContent = false;
  const privacyMapper = createArtifactPrivacyMapper(artifacts);
  const codeExts: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    c: 'c', cpp: 'cpp', h: 'c', java: 'java', html: 'html', css: 'css', sql: 'sql', json: 'json',
  };

  for (const [index, artifact] of artifacts.entries()) {
    const ext = artifact.filename.split('.').pop()?.toLowerCase() || '';
    const filepath = resolveStoredPath(artifact.filepath);
    const resolvedArtifact = { ...artifact, filepath };
    const promptLabel = `산출물 ${index + 1}: ${privacyMapper.artifactName(artifact)}`;
    if (ext === 'hwpx') {
      try {
        const text = privacyMapper.sanitizeText(
          await extractHwpxText(fs.readFileSync(filepath), {
            skipFirstTableRow: settings.artifactStripIntroBlocks,
          })
        );
        if (text) {
          const note = settings.artifactStripIntroBlocks
            ? 'HWPX XML 텍스트 추출: 첫 표 행 제외'
            : 'HWPX XML 텍스트 추출';
          parts.push(`[${promptLabel}]\n[${note}]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (ext === 'ipynb') {
      try {
        const text = privacyMapper.sanitizeText(
          extractIpynbInputText(fs.readFileSync(filepath), {
            skipFirstMarkdownCell: settings.artifactStripIntroBlocks,
          })
        );
        if (text) {
          const note = settings.artifactStripIntroBlocks
            ? 'Jupyter Notebook 입력 추출: 첫 마크다운 셀 및 실행 결과 제외'
            : 'Jupyter Notebook 입력 추출: 실행 결과 제외';
          parts.push(`[${promptLabel}]\n[${note}]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
      try {
        const evidence = await buildNotebookExecutionEvidence(
          resolvedArtifact,
          artifacts.map((item) => ({ ...item, filepath: resolveStoredPath(item.filepath) })),
          privacyMapper.artifactName(artifact),
          { skipFirstMarkdownCell: settings.artifactStripIntroBlocks },
        );
        const text = privacyMapper.sanitizeText(evidence.text);
        if (text) {
          parts.push(`[${promptLabel}]\n${text}\n---`);
          hasContent = true;
        }
        attachments.push(...evidence.attachments);
      } catch { /* skip */ }
    } else if (['csv', 'tsv', 'xlsx', 'xls'].includes(ext)) {
      try {
        const text = privacyMapper.sanitizeText(await buildTabularDataEvidence(resolvedArtifact));
        if (text) {
          parts.push(`[${promptLabel}]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (codeExts[ext]) {
      try {
        const rawCode = fs.readFileSync(filepath, 'utf-8');
        const code = privacyMapper.sanitizeText(
          settings.artifactStripIntroBlocks ? stripLeadingCodeIntroBlock(rawCode, ext) : rawCode
        );
        parts.push(`[${promptLabel}]\n\`\`\`${codeExts[ext]}\n${code}\n\`\`\`\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (artifact.mime_type === 'text/plain' || ext === 'txt') {
      try {
        let text: string;
        try {
          text = fs.readFileSync(filepath, 'utf-8');
        } catch {
          text = fs.readFileSync(filepath, 'utf16le');
        }
        text = privacyMapper.sanitizeText(text);
        parts.push(`[${promptLabel}]\n${text}\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      try {
        attachments.push(imageFileToAttachment(filepath, privacyMapper.artifactName(artifact), ext));
        parts.push(`[${promptLabel}] (이미지 파일 첨부)\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (artifact.mime_type === 'application/pdf' || ext === 'pdf') {
      try {
        const topHeightCm = settings.artifactStripIntroBlocks ? settings.pdfRedactionTopCm : 0;
        const pdfAttachments = await pdfToRedactedJpegAttachments(
          filepath,
          privacyMapper.artifactName(artifact),
          topHeightCm,
        );
        attachments.push(...pdfAttachments);
        parts.push(`[${promptLabel}] (원본 PDF를 LLM 입력용 이미지 ${pdfAttachments.length}쪽으로 변환해 첨부${topHeightCm > 0 ? `, 첫 페이지 상단 ${topHeightCm}cm 제거` : ''})\n---`);
        if (pdfAttachments.length > 0) hasContent = true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        parts.push(`[${promptLabel}] (PDF 이미지 변환 실패: ${message})\n---`);
      }
    }
  }

  return hasContent;
}

router.post('/generate', async (req: Request, res: Response) => {
  const { studentId, domain, contentType, criteriaSetId } = req.body as GenerateRequest;

  const student = await queryOne<{ name: string; student_num: number }>(
    'SELECT * FROM class_students WHERE id=?', [studentId]
  );
  if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

  const criteriaSet = await queryOne<{ mode: string }>(
    'SELECT * FROM criteria_sets WHERE id=?', [criteriaSetId]
  );
  if (!criteriaSet) return res.status(404).json({ error: '기준을 찾을 수 없습니다.' });

  const artifacts = await queryAll<ArtifactRow>(
    'SELECT * FROM artifacts WHERE student_id=? AND domain=?', [studentId, domain]
  );

  const parts: string[] = [];
  const classContext = await getClassContextByStudent(studentId);
  let evalCriteria: EvalCriterion[] = [];

  // 기준에 따른 지시사항 구성
  if (criteriaSet.mode === '세특') {
    const globalCommon = await queryOne<{ prompt: string }>(
      "SELECT prompt FROM comments_criteria WHERE set_id=? AND type='공통' LIMIT 1",
      [criteriaSetId]
    );
    if (globalCommon) parts.push(`[전체 공통 지시사항]\n${globalCommon.prompt}\n---`);

    const criteria = await queryOne<{ prompt: string }>(
      'SELECT prompt FROM comments_criteria WHERE set_id=? AND title=? LIMIT 1',
      [criteriaSetId, domain]
    );
    if (criteria) {
      parts.push(`[기록 작성 지시사항]\n${criteria.prompt}\n---`);
    } else {
      const domainCriteria = await getDomainCommentsCriteria(classContext, domain);
      domainCriteria.forEach((item) => {
        parts.push(`[${item.title || item.type}]\n${item.prompt}\n---`);
      });
      if (!domainCriteria.length) {
        parts.push(`[기록 작성 지시사항]\n${domain} 영역에 대해 학생의 역량을 기록해주세요.\n---`);
      }
    }
  } else {
    const evalDomain = await queryOne<{ id: number; common_prompt: string }>(
      'SELECT * FROM eval_domains WHERE set_id=? AND name=?', [criteriaSetId, domain]
    );
    if (evalDomain?.common_prompt) {
      parts.push(`[${domain} 영역 공통 지시사항]\n${evalDomain.common_prompt}\n---`);
    }
    if (evalDomain) {
      const items = await queryAll<{ name: string; excel_col: string; rubric: string }>(
        "SELECT * FROM eval_items WHERE domain_id=? AND item_type='llm'", [evalDomain.id]
      );
      if (items.length) {
        parts.push(`[채점 기준]\n반환값은 JSON 배열 텍스트만 작성하세요. 파일을 만들지 마세요. 마크다운 코드블록, 제목, 설명 문장을 붙이지 마세요. 배열의 각 원소는 {"score": 숫자, "reason": "짧은 이유"} 형식입니다. 평가 항목 순서와 배열 순서는 반드시 같아야 합니다.`);
        for (const item of items) {
          parts.push(`- ${item.name} (${item.excel_col}열): ${item.rubric}`);
        }
        parts.push('---');
      }
    }
    evalCriteria = await getDomainEvalCriteria(classContext, domain);
    if (!evalDomain && evalCriteria.length) {
      parts.push(`[채점 기준]\n반환값은 JSON 배열 텍스트만 작성하세요. 파일을 만들지 마세요. 마크다운 코드블록, 제목, 설명 문장을 붙이지 마세요. 배열의 각 원소는 {"score": 숫자, "reason": "짧은 이유"} 형식입니다. 평가 항목 순서와 배열 순서는 반드시 같아야 합니다.`);
      for (const item of evalCriteria.filter((i) => i.item_type === 'llm')) {
        parts.push(`- ${item.name} (${item.score}): ${item.rubric}`);
      }
      parts.push('---');
    }
  }

  const settings = await getLLMSettings();
  const attachments: LLMImageAttachment[] = [];
  const hasContent = await appendArtifactContents(parts, artifacts, settings, attachments);

  if (!hasContent && artifacts.length === 0) {
    if (contentType !== 'scoring') {
      return res.status(400).json({
        error: `${domain} 영역에 업로드된 산출물이 없습니다. 먼저 파일을 업로드해주세요.`,
      });
    }
  }

  parts.push(
    criteriaSet.mode === '세특'
      ? '위 지시사항과 학생의 활동 내용을 종합하여 학생의 역량이 잘 드러나도록 기록을 작성해주세요.'
      : '최종적으로 위 채점 기준에 따라 JSON 배열 텍스트만 반환해주세요. 파일을 만들지 마세요. 마크다운 코드블록, 제목, 설명 문장을 붙이지 마세요. 예시: [{"score":3,"reason":"핵심 요구 사항을 대부분 충족함"},{"score":0,"reason":"필수 구현이 확인되지 않음"}]'
  );

  try {
    const noArtifactScoring = contentType === 'scoring' && !hasContent;
    const result = noArtifactScoring ? '산출물 없음: 기본점수 적용' : await callLLM(parts.join('\n\n'), settings, undefined, undefined, attachments);
    const storedContent = noArtifactScoring
      ? buildDefaultScoringContent(evalCriteria)
      : buildStoredContent(contentType, result, evalCriteria);

    res.json({ ok: true, result, content: storedContent });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// 일괄 생성 (SSE)
router.post('/generate-batch', async (req: Request, res: Response) => {
  const { classId, sessionId, domain, contentType, criteriaSetId, studentIds } = req.body as BatchGenerateRequest;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.on('error', (e) => console.error('SSE response error:', e));

  const sendEvent = (data: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let students: { id: number; name: string }[] = [];
  let completed = 0;
  let settings: Awaited<ReturnType<typeof getLLMSettings>> | null = null;
  let logSession: LLMLogSession | null = null;
  let classContext: ClassContext | null = null;
  let cancelled = false;
  const abortController = new AbortController();

  res.on('close', () => {
    cancelled = true;
    abortController.abort();
  });

  const processStudent = async (student: { id: number; name: string }, index: number) => {
    if (cancelled) return;

    try {
      let result: string | null = null;
      let storedContent: string | null = null;
      let error: string | null = null;
      let evalCriteria: EvalCriterion[] = [];

      // generate 로직 인라인
      const artifacts = await queryAll<ArtifactRow>(
        'SELECT * FROM artifacts WHERE student_id=? AND domain=?', [student.id, domain]
      );

      const criteriaSet = criteriaSetId
        ? await queryOne<{ mode: string }>('SELECT * FROM criteria_sets WHERE id=?', [criteriaSetId])
        : { mode: contentType === 'comments' ? '세특' : '평가' };
      if (!criteriaSet) { error = '기준 없음'; } else {
        const parts: string[] = [];

        if (criteriaSet.mode === '세특') {
          if (domain === '__SUBJECT_COMPREHENSIVE__') {
            // 종합 세특: 공통기준 + 종합세특기준 + 학생별 영역별 요약
            const comprehensiveCriteria = await getDomainCommentsCriteria(classContext, '__SUBJECT_COMPREHENSIVE__');
            const commonCriterion = comprehensiveCriteria.find((c) => c.type === '공통');
            const comprehensiveCriterion = comprehensiveCriteria.find((c) => c.type === '종합');

            if (commonCriterion?.prompt) parts.push(`[공통 기준]\n${commonCriterion.prompt}\n---`);
            if (comprehensiveCriterion?.prompt) parts.push(`[종합 세특 기준]\n${comprehensiveCriterion.prompt}\n---`);

            // 영역별 요약 수집
            const domainSummaries = await queryAll<{ domain: string; content: string }>(
              `SELECT domain, content FROM generated_content WHERE student_id=? AND content_type='comments' AND domain != '__SUBJECT_COMPREHENSIVE__' ORDER BY rowid`,
              [student.id]
            );
            if (domainSummaries.length) {
              parts.push('[학생별 영역별 수행 요약]');
              for (const ds of domainSummaries) {
                let text = ds.content;
                try { const parsed = JSON.parse(ds.content); text = parsed.text || ds.content; } catch { /* use raw */ }
                parts.push(`[${ds.domain}]\n${text}\n---`);
              }
            }

            if (!commonCriterion && !comprehensiveCriterion && !domainSummaries.length) {
              parts.push(`[기록 작성 지시사항]\n학생의 전체 교과 활동을 종합하여 세특을 작성해주세요.\n---`);
            }
          } else {
            // 영역 세특: 공통기준 + 성취 기준 + 채점기준/획득점수 + 산출물
            // 1) 공통기준
            const subjectCriteria = await getDomainCommentsCriteria(classContext, '__SUBJECT_COMPREHENSIVE__');
            const commonCriterion = subjectCriteria.find((c) => c.type === '공통');
            if (commonCriterion?.prompt) parts.push(`[공통 기준]\n${commonCriterion.prompt}\n---`);

            // 2) 성취 기준
            const domainAllCriteria = await getDomainCommentsCriteria(classContext, domain);
            const standardRefs = domainAllCriteria.filter((c) => c.type === '성취기준');
            if (standardRefs.length) {
              const stdParts: string[] = [];
              for (const ref of standardRefs) {
                try {
                  const ext = JSON.parse(ref.extensions || '{}');
                  if (ext.content) stdParts.push(`[${ext.code}] ${ext.content}`);
                } catch { /* skip */ }
              }
              if (stdParts.length) parts.push(`[성취 기준]\n${stdParts.join('\n')}\n---`);
            }

            // 3) 채점기준 및 획득점수
            evalCriteria = await getDomainEvalCriteria(classContext, domain);
            if (evalCriteria.length) {
              const scoring = await queryOne<{ content: string }>(
                `SELECT content FROM generated_content WHERE student_id=? AND content_type='scoring' AND domain=?`,
                [student.id, domain]
              );
              let scoringData: Record<string, unknown> = {};
              if (scoring) { try { scoringData = JSON.parse(scoring.content); } catch { /* skip */ } }

              const llmItems = evalCriteria.filter((i) => i.item_type === 'llm');
              if (llmItems.length) {
                const scoringParts = llmItems.map((item) => {
                  const score = scoringData[item.name] ?? '미채점';
                  return `- ${item.name}: 배점 ${item.score}점, 획득 ${score}점\n  루브릭: ${item.rubric}`;
                });
                parts.push(`[채점 기준 및 획득 점수]\n${scoringParts.join('\n')}\n---`);
              }
            }

            // 4) 일반 세특 기준 항목
            const regularCriteria = domainAllCriteria.filter((c) => c.type !== '성취기준' && c.type !== '공통' && c.type !== '종합');
            for (const item of regularCriteria) {
              if (item.prompt) parts.push(`[${item.title || item.type}]\n${item.prompt}\n---`);
            }

            if (!standardRefs.length && !evalCriteria.length && !regularCriteria.length && !commonCriterion) {
              parts.push(`[기록 작성 지시사항]\n${domain} 영역에 대해 학생의 역량을 기록해주세요.\n---`);
            }
          }
        } else {
          if (criteriaSetId) {
            const evalDomain = await queryOne<{ id: number; common_prompt: string }>(
              'SELECT * FROM eval_domains WHERE set_id=? AND name=?', [criteriaSetId, domain]
            );
            if (evalDomain?.common_prompt) parts.push(`[영역 공통 지시사항]\n${evalDomain.common_prompt}\n---`);
            if (evalDomain) {
              const items = await queryAll<{ name: string; excel_col: string; rubric: string }>(
                "SELECT * FROM eval_items WHERE domain_id=? AND item_type='llm'", [evalDomain.id]
              );
              if (items.length) {
                parts.push('[채점 기준]');
                for (const item of items) parts.push(`- ${item.name}: ${item.rubric}`);
                parts.push('---');
              }
            }
          }
          evalCriteria = await getDomainEvalCriteria(classContext, domain);
          if (evalCriteria.length) {
            parts.push('[채점 기준]');
            for (const item of evalCriteria.filter((i) => i.item_type === 'llm')) {
              parts.push(`- ${item.name} (${item.score}): ${item.rubric}`);
            }
            parts.push('반환값은 JSON 배열 텍스트만 작성하세요. 파일을 만들지 마세요. 마크다운 코드블록, 제목, 설명 문장을 붙이지 마세요. 배열의 각 원소는 {"score": 숫자, "reason": "짧은 이유"} 형식입니다. 평가 항목 순서와 배열 순서는 반드시 같아야 합니다.');
            parts.push('---');
          }
        }

        if (!settings) throw new Error('LLM 설정이 로드되지 않았습니다.');
        const attachments: LLMImageAttachment[] = [];
        const hasContent = await appendArtifactContents(parts, artifacts, settings, attachments);

        if (hasContent || artifacts.length > 0) {
          parts.push(criteriaSet.mode === '세특'
            ? '위 내용을 종합하여 학생의 역량이 잘 드러나도록 기록을 작성해주세요.'
            : '채점 기준에 따라 JSON 배열 텍스트만 반환해주세요. 파일을 만들지 마세요. 마크다운 코드블록, 제목, 설명 문장을 붙이지 마세요. 예시: [{"score":3,"reason":"핵심 요구 사항을 대부분 충족함"},{"score":0,"reason":"필수 구현이 확인되지 않음"}]'
          );
          try {
            if (cancelled) return;
            result = await callLLM(parts.join('\n\n'), settings, abortController.signal, {
              session: logSession || undefined,
              label: `학생 ${index + 1}/${students.length}`,
            }, attachments);
            if (cancelled) return;
            storedContent = buildStoredContent(contentType, result, evalCriteria);
          } catch (e: unknown) {
            error = e instanceof Error ? e.message : String(e);
          }
        } else if (contentType === 'scoring') {
          storedContent = buildDefaultScoringContent(evalCriteria);
        } else {
          error = '산출물 없음';
        }
      }

      if (cancelled) return;
      completed++;
      sendEvent({
        type: error ? 'error' : 'progress',
        studentId: student.id,
        name: student.name,
        contentType,
        domain,
        content: storedContent,
        error,
        llmResult: error && result ? result : undefined,
        completed,
        total: students.length,
      });
    } catch (e: unknown) {
      if (cancelled) return;
      completed++;
      sendEvent({
        type: 'error',
        studentId: student.id,
        name: student.name,
        error: e instanceof Error ? e.message : String(e),
        completed,
        total: students.length,
      });
    }
  };

  try {
    if (studentIds?.length) {
      students = await queryAll<{ id: number; name: string }>(
        `SELECT * FROM class_students WHERE id IN (${studentIds.map(() => '?').join(',')}) ${classId !== undefined ? 'AND class_id=?' : ''} ORDER BY student_num`,
        classId !== undefined ? [...studentIds, classId] : studentIds
      );
    } else if (classId !== undefined) {
      students = await queryAll<{ id: number; name: string }>(
        'SELECT * FROM class_students WHERE class_id=? ORDER BY student_num',
        [classId]
      );
    } else if (sessionId !== undefined) {
      students = await queryAll<{ id: number; name: string }>(
        'SELECT * FROM class_students WHERE class_id=? ORDER BY student_num',
        [sessionId]
      );
    }

    classContext = await getClassContextByClass(classId ?? sessionId);
    sendEvent({ type: 'start', total: students.length });

    settings = await getLLMSettings();
    if (settings.loggingEnabled) {
      logSession = await createLLMLogSession('batch-generate', {
        content_type: contentType,
        domain,
        target_count: students.length,
        provider: settings.provider,
        model: settings.model || '(default)',
      });
    }
    const MAX_CONCURRENCY = Math.max(1, settings.maxConcurrency || 1);

    for (let i = 0; i < students.length; i += MAX_CONCURRENCY) {
      if (cancelled) break;
      await Promise.all(students.slice(i, i + MAX_CONCURRENCY).map((student, offset) => processStudent(student, i + offset)));
    }

    if (!cancelled) sendEvent({ type: 'done', completed });
  } catch (e: unknown) {
    console.error('generate-batch failed:', e);
    sendEvent({ type: 'fatal', error: e instanceof Error ? e.message : String(e), completed: 0, total: 0 });
  } finally {
    res.end();
  }
});

export default router;
