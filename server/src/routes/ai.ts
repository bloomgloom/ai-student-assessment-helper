import { Router, Request, Response } from 'express';
import fs from 'fs';
import { queryAll, queryOne, execute } from '../services/db';
import { callLLM, getLLMSettings } from '../services/llm';
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
  contentType: 'scoring' | 'setech';
  criteriaSetId: number;
}

interface BatchGenerateRequest {
  classId?: number;
  sessionId?: number;
  domain: string;
  contentType: 'scoring' | 'setech';
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
  excel_col: string;
  item_type: 'llm' | 'formula';
  rubric: string;
}

interface SetechCriterion {
  type: string;
  title: string;
  prompt: string;
  extensions: string;
}

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
    `SELECT name, excel_col, item_type, rubric
     FROM domain_eval
     WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?
     ORDER BY sort_order, id`,
    [classContext.year, classContext.semester, classContext.grade, classContext.subject, domain]
  );
}

async function getDomainSetechCriteria(classContext: ClassContext | null, domain: string): Promise<SetechCriterion[]> {
  if (!classContext) return [];
  return queryAll<SetechCriterion>(
    `SELECT type, title, prompt, extensions
     FROM domain_setech
     WHERE year=? AND semester=? AND grade=? AND subject=? AND domain_name=?
     ORDER BY sort_order, id`,
    [classContext.year, classContext.semester, classContext.grade, classContext.subject, domain]
  );
}

function buildScoringContent(result: string, criteria: EvalCriterion[]): string {
  const llmItems = criteria.filter((item) => item.item_type === 'llm');
  const values = result.split(',').map((value) => value.trim()).filter(Boolean);
  const numericFallback = result.match(/-?\d+(?:\.\d+)?/g) || [];
  const content: Record<string, string | number> = {};

  llmItems.forEach((item, index) => {
    content[item.name] = numericFallback.length >= llmItems.length
      ? numericFallback[index] ?? ''
      : values[index] ?? numericFallback[index] ?? '';
  });

  const base = criteria
    .filter((item) => item.item_type === 'formula')
    .reduce((sum, item) => sum + (Number(item.excel_col) || 0), 0);
  const scoreTotal = llmItems.reduce((sum, item) => sum + (Number(content[item.name]) || 0), 0);
  content.total = base + scoreTotal;

  return JSON.stringify(content);
}

function buildStoredContent(contentType: 'scoring' | 'setech', result: string, criteria: EvalCriterion[]): string {
  if (contentType === 'scoring') return buildScoringContent(result, criteria);
  return JSON.stringify({ text: result });
}

async function appendArtifactContents(parts: string[], artifacts: ArtifactRow[]): Promise<boolean> {
  let hasContent = false;
  const codeExts: Record<string, string> = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    c: 'c', cpp: 'cpp', h: 'c', java: 'java', html: 'html', css: 'css', sql: 'sql', json: 'json',
  };

  for (const artifact of artifacts) {
    const ext = artifact.filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'hwpx') {
      try {
        const text = await extractHwpxText(fs.readFileSync(artifact.filepath), { skipFirstTableRow: true });
        if (text) {
          parts.push(`[${artifact.filename}]\n[HWPX XML 텍스트 추출: 개인정보 표 첫 행 제외]\n${text}\n---`);
          hasContent = true;
        }
      } catch { /* skip */ }
    } else if (codeExts[ext]) {
      try {
        const code = fs.readFileSync(artifact.filepath, 'utf-8');
        parts.push(`[${artifact.filename}]\n\`\`\`${codeExts[ext]}\n${code}\n\`\`\`\n---`);
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
        parts.push(`[${artifact.filename}]\n${text}\n---`);
        hasContent = true;
      } catch { /* skip */ }
    } else if (artifact.mime_type === 'application/pdf') {
      parts.push(`[${artifact.filename}] (PDF 파일 첨부 - 텍스트 파일로 변환 후 업로드 권장)\n---`);
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
      "SELECT prompt FROM setech_criteria WHERE set_id=? AND type='공통' LIMIT 1",
      [criteriaSetId]
    );
    if (globalCommon) parts.push(`[전체 공통 지시사항]\n${globalCommon.prompt}\n---`);

    const criteria = await queryOne<{ prompt: string }>(
      'SELECT prompt FROM setech_criteria WHERE set_id=? AND title=? LIMIT 1',
      [criteriaSetId, domain]
    );
    if (criteria) {
      parts.push(`[기록 작성 지시사항]\n${criteria.prompt}\n---`);
    } else {
      const domainCriteria = await getDomainSetechCriteria(classContext, domain);
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
        parts.push(`[채점 기준]\n각 항목의 점수를 콤마(,)로 구분하여 한 줄로 반환해주세요.`);
        for (const item of items) {
          parts.push(`- ${item.name} (${item.excel_col}열): ${item.rubric}`);
        }
        parts.push('---');
      }
    }
    evalCriteria = await getDomainEvalCriteria(classContext, domain);
    if (!evalDomain && evalCriteria.length) {
      parts.push(`[채점 기준]\n각 항목의 점수를 콤마(,)로 구분하여 한 줄로 반환해주세요.`);
      for (const item of evalCriteria.filter((i) => i.item_type === 'llm')) {
        parts.push(`- ${item.name} (${item.excel_col}): ${item.rubric}`);
      }
      parts.push('---');
    }
  }

  const hasContent = await appendArtifactContents(parts, artifacts);

  if (!hasContent && artifacts.length === 0) {
    return res.status(400).json({
      error: `${domain} 영역에 업로드된 산출물이 없습니다. 먼저 파일을 업로드해주세요.`,
    });
  }

  parts.push(
    criteriaSet.mode === '세특'
      ? '위 지시사항과 학생의 활동 내용을 종합하여 학생의 역량이 잘 드러나도록 기록을 작성해주세요.'
      : '최종적으로 위 채점 기준에 따라 각 항목의 점수만 콤마(,)로 구분하여 한 줄로 반환해주세요.'
  );

  try {
    const settings = await getLLMSettings();
    const result = await callLLM(parts.join('\n\n'), settings);
    const storedContent = buildStoredContent(contentType, result, evalCriteria);

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
  let classContext: ClassContext | null = null;
  let cancelled = false;

  res.on('close', () => {
    cancelled = true;
  });

  const processStudent = async (student: { id: number; name: string }) => {
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
        : { mode: contentType === 'setech' ? '세특' : '평가' };
      if (!criteriaSet) { error = '기준 없음'; } else {
        const parts: string[] = [];

        if (criteriaSet.mode === '세특') {
          if (domain === '__SUBJECT_COMPREHENSIVE__') {
            // 종합 세특: 공통기준 + 종합세특기준 + 학생별 영역별 요약
            const comprehensiveCriteria = await getDomainSetechCriteria(classContext, '__SUBJECT_COMPREHENSIVE__');
            const commonCriterion = comprehensiveCriteria.find((c) => c.type === '공통');
            const comprehensiveCriterion = comprehensiveCriteria.find((c) => c.type === '종합');

            if (commonCriterion?.prompt) parts.push(`[공통 기준]\n${commonCriterion.prompt}\n---`);
            if (comprehensiveCriterion?.prompt) parts.push(`[종합 세특 기준]\n${comprehensiveCriterion.prompt}\n---`);

            // 영역별 요약 수집
            const domainSummaries = await queryAll<{ domain: string; content: string }>(
              `SELECT domain, content FROM generated_content WHERE student_id=? AND content_type='setech' AND domain != '__SUBJECT_COMPREHENSIVE__' ORDER BY rowid`,
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
            // 영역 세특: 공통기준 + 성취/평가기준 + 채점기준/획득점수 + 산출물
            // 1) 공통기준
            const subjectCriteria = await getDomainSetechCriteria(classContext, '__SUBJECT_COMPREHENSIVE__');
            const commonCriterion = subjectCriteria.find((c) => c.type === '공통');
            if (commonCriterion?.prompt) parts.push(`[공통 기준]\n${commonCriterion.prompt}\n---`);

            // 2) 성취/평가기준
            const domainAllCriteria = await getDomainSetechCriteria(classContext, domain);
            const standardRefs = domainAllCriteria.filter((c) => c.type === '성취기준');
            if (standardRefs.length) {
              const stdParts: string[] = [];
              for (const ref of standardRefs) {
                try {
                  const ext = JSON.parse(ref.extensions || '{}');
                  if (ext.content) stdParts.push(`[${ext.code}] ${ext.content}`);
                } catch { /* skip */ }
              }
              if (stdParts.length) parts.push(`[성취/평가기준]\n${stdParts.join('\n')}\n---`);
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
                  return `- ${item.name}: 배점 ${item.excel_col}점, 획득 ${score}점\n  루브릭: ${item.rubric}`;
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
              parts.push(`- ${item.name} (${item.excel_col}): ${item.rubric}`);
            }
            parts.push('각 항목의 점수를 위 순서대로 콤마(,)로 구분하여 한 줄로 반환해주세요.');
            parts.push('---');
          }
        }

        const hasContent = await appendArtifactContents(parts, artifacts);

        if (hasContent || artifacts.length > 0) {
          parts.push(criteriaSet.mode === '세특'
            ? '위 내용을 종합하여 학생의 역량이 잘 드러나도록 기록을 작성해주세요.'
            : '채점 기준에 따라 각 항목의 점수를 콤마로 구분하여 반환해주세요.'
          );
          try {
            if (!settings) throw new Error('LLM 설정이 로드되지 않았습니다.');
            if (cancelled) return;
            result = await callLLM(parts.join('\n\n'), settings);
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
    const MAX_CONCURRENCY = Math.max(1, settings.maxConcurrency || 1);

    for (let i = 0; i < students.length; i += MAX_CONCURRENCY) {
      if (cancelled) break;
      await Promise.all(students.slice(i, i + MAX_CONCURRENCY).map(processStudent));
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
