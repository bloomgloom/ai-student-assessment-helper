import { Router, Request, Response } from 'express';
import fs from 'fs';
import { queryAll, queryOne, execute } from '../services/db';
import { callLLM, createLLMLogSession, getLLMSettings, type LLMLogSession } from '../services/llm';
import { extractHwpxText } from '../services/hwpx';

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

function buildScoringContent(result: string, criteria: EvalCriterion[]): string {
  const llmItems = criteria.filter((item) => item.item_type === 'llm');
  const values = result.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
  const numericPattern = /^-?\d+(?:\.\d+)?$/;
  const content: Record<string, string | number> = {};

  if (llmItems.length > 0) {
    const invalid = values.length !== llmItems.length || values.some((value) => !numericPattern.test(value));
    if (invalid) {
      const preview = result.replace(/\s+/g, ' ').trim().slice(0, 160);
      throw new Error(`채점 결과가 항목 수(${llmItems.length})에 맞는 숫자로 제시되지 않아 작성하지 않았습니다. 출력: ${preview || '(빈 응답)'}`);
    }
  }

  llmItems.forEach((item, index) => {
    content[item.name] = values[index] ?? '';
  });

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

function buildArtifactPromptLabel(index: number, ext: string): string {
  const normalizedExt = ext ? `.${ext}` : '';
  return `산출물 ${index + 1}${normalizedExt}`;
}

function decodeTextBuffer(buffer: Buffer): string {
  const encodings = ['utf-8', 'euc-kr', 'utf-16le'];
  for (const encoding of encodings) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(buffer);
      if (!decoded.includes('\uFFFD')) return decoded;
    } catch { /* try next encoding */ }
  }
  return buffer.toString('utf8');
}

function normalizeNotebookSource(source: unknown): string {
  if (Array.isArray(source)) return source.join('');
  return typeof source === 'string' ? source : '';
}

function extractIpynbInputText(buffer: Buffer): string {
  const notebook = JSON.parse(decodeTextBuffer(buffer)) as {
    cells?: { cell_type?: string; source?: unknown }[];
  };
  if (!Array.isArray(notebook.cells)) return '';

  const chunks: string[] = [];
  notebook.cells.forEach((cell, index) => {
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

function extractCsvInputText(buffer: Buffer): string {
  return decodeTextBuffer(buffer).trim();
}

async function appendArtifactContents(parts: string[], artifacts: ArtifactRow[]): Promise<boolean> {
  let hasContent = false;
  const codeExts: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    c: 'c', cpp: 'cpp', h: 'c', java: 'java', html: 'html', css: 'css', sql: 'sql', json: 'json',
  };

  for (const [index, artifact] of artifacts.entries()) {
    const ext = artifact.filename.split('.').pop()?.toLowerCase() || '';
    const promptLabel = buildArtifactPromptLabel(index, ext);
    if (ext === 'hwpx') {
      try {
        const text = await extractHwpxText(fs.readFileSync(artifact.filepath), { skipFirstTableRow: true });
        if (text) {
          parts.push(`[${promptLabel}]\n[HWPX XML 텍스트 추출: 개인정보 표 첫 행 제외]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (ext === 'ipynb') {
      try {
        const text = extractIpynbInputText(fs.readFileSync(artifact.filepath));
        if (text) {
          parts.push(`[${promptLabel}]\n[Jupyter Notebook 입력 추출: 파일명 및 실행 결과 제외]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (ext === 'csv') {
      try {
        const text = extractCsvInputText(fs.readFileSync(artifact.filepath));
        if (text) {
          parts.push(`[${promptLabel}]\n[CSV 데이터: 파일명 제외]\n\`\`\`csv\n${text}\n\`\`\`\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (codeExts[ext]) {
      try {
        const code = fs.readFileSync(artifact.filepath, 'utf-8');
        parts.push(`[${promptLabel}]\n\`\`\`${codeExts[ext]}\n${code}\n\`\`\`\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (artifact.mime_type === 'text/plain' || ext === 'txt') {
      try {
        let text: string;
        try {
          text = fs.readFileSync(artifact.filepath, 'utf-8');
        } catch {
          text = fs.readFileSync(artifact.filepath, 'utf16le');
        }
        parts.push(`[${promptLabel}]\n${text}\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (artifact.mime_type === 'application/pdf') {
      parts.push(`[${promptLabel}] (PDF 파일 첨부 - 텍스트 파일로 변환 후 업로드 권장)\n---`);
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
        parts.push(`[채점 기준]\n각 항목의 점수를 어떠한 부연 설명 없이 콤마(,)로만 구분하여 반환하세요.`);
        for (const item of items) {
          parts.push(`- ${item.name} (${item.excel_col}열): ${item.rubric}`);
        }
        parts.push('---');
      }
    }
    evalCriteria = await getDomainEvalCriteria(classContext, domain);
    if (!evalDomain && evalCriteria.length) {
      parts.push(`[채점 기준]\n각 항목의 점수를 어떠한 부연 설명 없이 콤마(,)로만 구분하여 반환하세요.`);
      for (const item of evalCriteria.filter((i) => i.item_type === 'llm')) {
        parts.push(`- ${item.name} (${item.score}): ${item.rubric}`);
      }
      parts.push('---');
    }
  }

  const hasContent = await appendArtifactContents(parts, artifacts);

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
      : '최종적으로 위 채점 기준에 따라 각 항목의 점수만 콤마(,)로 구분하여 한 줄로 반환해주세요. (어떠한 추가 설명, 제목, 이유도 작성하지 마세요. 오직 숫자와 콤마만 출력해야 합니다. 예시: 3,0,3,0,3,3,0,3,3,3)'
  );

  try {
    const settings = await getLLMSettings();
    const noArtifactScoring = contentType === 'scoring' && !hasContent;
    const result = noArtifactScoring ? '산출물 없음: 기본점수 적용' : await callLLM(parts.join('\n\n'), settings);
    const storedContent = noArtifactScoring
      ? buildDefaultScoringContent(evalCriteria)
      : buildStoredContent(contentType, result, evalCriteria);

    await execute(`
      INSERT INTO generated_content(student_id, content_type, domain, content, updated_at)
      VALUES(?,?,?,?,datetime('now'))
      ON CONFLICT(student_id, content_type, domain)
      DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
    `, [studentId, contentType, domain, storedContent]);

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
            parts.push('각 항목의 점수를 위 순서대로 콤마(,)로 구분하여 한 줄로 반환해주세요. 절대로 부연 설명을 포함하지 마세요.');
            parts.push('---');
          }
        }

        const hasContent = await appendArtifactContents(parts, artifacts);

        if (hasContent || artifacts.length > 0) {
          parts.push(criteriaSet.mode === '세특'
            ? '위 내용을 종합하여 학생의 역량이 잘 드러나도록 기록을 작성해주세요.'
            : '채점 기준에 따라 각 항목의 점수를 콤마로 구분하여 반환해주세요. (어떠한 추가 설명, 제목, 이유도 작성하지 마세요. 오직 숫자와 콤마만 출력해야 합니다. 예시: 3,0,3,0,3,3,0,3,3,3)'
          );
          try {
            if (!settings) throw new Error('LLM 설정이 로드되지 않았습니다.');
            if (cancelled) return;
            result = await callLLM(parts.join('\n\n'), settings, abortController.signal, {
              session: logSession || undefined,
              label: `학생 ${index + 1}/${students.length}`,
            });
            if (cancelled) return;
            storedContent = buildStoredContent(contentType, result, evalCriteria);
            await execute(`
              INSERT INTO generated_content(student_id, content_type, domain, content, updated_at)
              VALUES(?,?,?,?,datetime('now'))
              ON CONFLICT(student_id, content_type, domain)
              DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
            `, [student.id, contentType, domain, storedContent]);
          } catch (e: unknown) {
            error = e instanceof Error ? e.message : String(e);
          }
        } else if (contentType === 'scoring') {
          storedContent = buildDefaultScoringContent(evalCriteria);
          await execute(`
            INSERT INTO generated_content(student_id, content_type, domain, content, updated_at)
            VALUES(?,?,?,?,datetime('now'))
            ON CONFLICT(student_id, content_type, domain)
            DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
          `, [student.id, contentType, domain, storedContent]);
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
