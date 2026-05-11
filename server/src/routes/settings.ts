import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { queryAll, execute } from '../services/db';
import { UPLOADS_DIR } from '../services/storage';
import { callLLM, getLLMSettings, fetchOmlxModels } from '../services/llm';

const UPLOADS_ROOT = UPLOADS_DIR;

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const settings = await getLLMSettings();
  res.json(settings);
});

router.put('/', async (req: Request, res: Response) => {
  const { provider, apiKeys, model, baseUrl, maxConcurrency, loggingEnabled } = req.body;
  const concurrency = maxConcurrency != null ? Math.max(1, parseInt(String(maxConcurrency), 10) || 1) : undefined;
  
  const pairs: [string, string][] = [
    ['llm_provider', provider],
    ['llm_model', model],
    ['llm_base_url', baseUrl],
  ];

  if (concurrency != null) {
    pairs.push(['llm_max_concurrency', String(concurrency)]);
    pairs.push(['llm_sequential_mode', String(concurrency <= 1)]);
  }
  
  if (loggingEnabled != null) {
    pairs.push(['llm_logging_enabled', String(loggingEnabled)]);
  }

  if (apiKeys && typeof apiKeys === 'object') {
    for (const [p, key] of Object.entries(apiKeys)) {
      if (typeof key === 'string') {
        pairs.push([`llm_api_key_${p}`, key]);
      }
    }
  }

  const validPairs = pairs.filter((p): p is [string, string] => p[1] !== undefined);

  for (const [key, value] of validPairs) {
    await execute('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', [key, value]);
  }
  res.json({ ok: true });
});

// omlx 서버에서 로드된 모델 목록 조회
router.get('/omlx-models', async (req: Request, res: Response) => {
  const baseUrl = (req.query.baseUrl as string) || 'http://localhost:8000/v1';
  const apiKey = (req.query.apiKey as string) || '';
  try {
    const models = await fetchOmlxModels(baseUrl, apiKey);
    res.json({ models });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ── 전체 데이터 초기화 ─────────────────────────────────────────────────────
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    // 1. 업로드 파일 전체 삭제 (uploads/ 하위 모든 파일, 디렉토리 구조는 유지)
    const deleteDirContents = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          deleteDirContents(full);
          try { fs.rmdirSync(full); } catch { /* ignore non-empty */ }
        } else {
          fs.unlinkSync(full);
        }
      }
    };
    deleteDirContents(UPLOADS_ROOT);

    // 2. 데이터 테이블 초기화 (settings 제외)
    // ON DELETE CASCADE 덕분에 classes 삭제 시 assessment_domains, class_students,
    // artifacts, generated_content 자동 삭제
    // criteria_sets 삭제 시 setech_criteria, eval_domains 자동 삭제
    await execute('DELETE FROM classes');
    await execute('DELETE FROM subject_domains');
    await execute('DELETE FROM achievement_standards');
    await execute('DELETE FROM domain_setech');
    await execute('DELETE FROM domain_eval');
    await execute('DELETE FROM custom_domains');
    await execute('DELETE FROM criteria_sets');

    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.post('/test', async (_req: Request, res: Response) => {
  try {
    const result = await callLLM('안녕하세요! 테스트 메시지입니다. 한 문장으로 응답해주세요.');
    res.json({ ok: true, response: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
