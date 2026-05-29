import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { queryAll, execute } from '../services/db';
import { getStorageSettings, saveStorageSettings, UPLOADS_DIR } from '../services/storage';
import { callLLM, getLLMSettings, fetchOpenAICompatibleModels } from '../services/llm';

const UPLOADS_ROOT = UPLOADS_DIR;
const execFileAsync = promisify(execFile);

const router = Router();

async function browseDirectory(): Promise<string> {
  const platform = os.platform();
  if (platform === 'darwin') {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "데이터 저장 경로를 선택하세요")',
    ]);
    return stdout.trim();
  }
  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$dialog.Description = "데이터 저장 경로를 선택하세요"',
      'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script]);
    return stdout.trim();
  }
  try {
    const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=데이터 저장 경로를 선택하세요']);
    return stdout.trim();
  } catch {
    const { stdout } = await execFileAsync('kdialog', ['--getexistingdirectory', process.cwd()]);
    return stdout.trim();
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const settings = await getLLMSettings();
  res.json({ ...settings, storage: getStorageSettings() });
});

router.put('/', async (req: Request, res: Response) => {
  const { provider, apiKeys, model, baseUrl, maxConcurrency, loggingEnabled, storageRoot, providerSettings } = req.body;
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

  if (provider && typeof provider === 'string') {
    if (model !== undefined) pairs.push([`llm_model_${provider}`, String(model)]);
    if (baseUrl !== undefined) pairs.push([`llm_base_url_${provider}`, String(baseUrl)]);
    if (concurrency != null) pairs.push([`llm_max_concurrency_${provider}`, String(concurrency)]);
  }

  if (providerSettings && typeof providerSettings === 'object') {
    for (const [p, value] of Object.entries(providerSettings)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as { model?: unknown; baseUrl?: unknown; maxConcurrency?: unknown };
      if (item.model !== undefined) pairs.push([`llm_model_${p}`, String(item.model)]);
      if (item.baseUrl !== undefined) pairs.push([`llm_base_url_${p}`, String(item.baseUrl)]);
      if (item.maxConcurrency !== undefined) {
        const providerConcurrency = Math.max(1, parseInt(String(item.maxConcurrency), 10) || 1);
        pairs.push([`llm_max_concurrency_${p}`, String(providerConcurrency)]);
      }
    }
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

  let storage = getStorageSettings();
  if (typeof storageRoot === 'string' && !storage.envLocked) {
    storage = saveStorageSettings(storageRoot);
  }

  res.json({ ok: true, storage });
});

router.get('/compatible-models', async (req: Request, res: Response) => {
  const baseUrl = (req.query.baseUrl as string) || 'http://localhost:8000/v1';
  const apiKey = (req.query.apiKey as string) || '';
  try {
    const models = await fetchOpenAICompatibleModels(baseUrl, apiKey);
    res.json({ models });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.post('/storage/browse', async (_req: Request, res: Response) => {
  try {
    const selectedPath = await browseDirectory();
    if (!selectedPath) return res.json({ cancelled: true });
    res.json({ path: selectedPath });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('사용자가 취소') || msg.includes('User canceled') || msg.includes('cancelled') || msg.includes('canceled') || msg.includes('-128')) {
      return res.json({ cancelled: true });
    }
    res.status(500).json({ error: `폴더 선택 창을 열 수 없습니다. 경로를 직접 입력하세요. (${msg})` });
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
    // criteria_sets 삭제 시 comments_criteria, eval_domains 자동 삭제
    await execute('DELETE FROM classes');
    await execute('DELETE FROM subject_domains');
    await execute('DELETE FROM achievement_standards');
    await execute('DELETE FROM domain_comments');
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
