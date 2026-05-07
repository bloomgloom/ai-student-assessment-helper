import fs from 'fs/promises';
import path from 'path';
import { queryAll } from './db';

export interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openai-compatible' | 'omlx';
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  // 호환용 필드: maxConcurrency <= 1이면 true
  sequentialMode: boolean;
  loggingEnabled: boolean;
}

export interface LLMLogSession {
  id: string;
  filepath: string;
  startedAt: Date;
  nextEntry: number;
}

export interface LLMLogOptions {
  session?: LLMLogSession;
  label?: string;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const rows = await queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const maxConcurrency = parseInt(map['llm_max_concurrency'] || '5', 10);
  const provider = (map['llm_provider'] as LLMSettings['provider']) || 'gemini';
  
  const apiKeys: Record<string, string> = {
    gemini: map['llm_api_key_gemini'] || map['llm_api_key'] || '', // Fallback to old key for backward compatibility
    openai: map['llm_api_key_openai'] || '',
    anthropic: map['llm_api_key_anthropic'] || '',
    omlx: map['llm_api_key_omlx'] || '',
    'openai-compatible': map['llm_api_key_openai-compatible'] || '',
  };

  return {
    provider,
    apiKey: apiKeys[provider] || '',
    apiKeys,
    model: map['llm_model'] || '',
    baseUrl: map['llm_base_url'] || '',
    maxConcurrency,
    sequentialMode: maxConcurrency <= 1,
    loggingEnabled: map['llm_logging_enabled'] !== 'false',
  };
}

// omlx 서버에서 로드된 모델 목록을 가져옵니다.
export async function fetchOmlxModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`모델 목록 조회 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((m) => m.id);
}

// omlx 순차 처리용 뮤텍스
let omlxLock: Promise<void> = Promise.resolve();
let logSequence = 0;
const logSessionQueues = new Map<string, Promise<void>>();

function getLogTimestamp(date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`,
  ].join('_');
}

function getLogDir(): string {
  return path.resolve(__dirname, '../../..', '.log');
}

export async function createLLMLogSession(label: string, metadata: Record<string, string | number | undefined> = {}): Promise<LLMLogSession> {
  const startedAt = new Date();
  const sequence = (logSequence = (logSequence + 1) % 10000);
  const filename = `${getLogTimestamp(startedAt)}_${String(sequence).padStart(4, '0')}.log`;
  const logDir = getLogDir();
  const session: LLMLogSession = {
    id: filename,
    filepath: path.join(logDir, filename),
    startedAt,
    nextEntry: 1,
  };
  const metadataLines = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${value}`);

  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(session.filepath, [
    `log_started_at: ${startedAt.toISOString()}`,
    `run: ${label}`,
    ...metadataLines,
    '',
  ].join('\n'), 'utf8');
  logSessionQueues.set(session.id, Promise.resolve());
  return session;
}

async function appendToLogSession(session: LLMLogSession, content: string): Promise<void> {
  const previous = logSessionQueues.get(session.id) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => fs.appendFile(session.filepath, content, 'utf8'));
  logSessionQueues.set(session.id, next.then(() => undefined, () => undefined));
  await next;
}

async function writeLLMLog(params: {
  startedAt: Date;
  finishedAt: Date;
  settings: LLMSettings;
  prompt: string;
  output?: string;
  error?: unknown;
  log?: LLMLogOptions;
}): Promise<void> {
  try {
    const entryNumber = params.log?.session ? params.log.session.nextEntry++ : undefined;
    const title = params.log?.session
      ? `===== LLM CALL ${entryNumber}${params.log.label ? `: ${params.log.label}` : ''} =====`
      : undefined;
    const errorText = params.error instanceof Error
      ? `${params.error.name}: ${params.error.message}`
      : params.error === undefined
        ? ''
        : String(params.error);
    const content = [
      ...(title ? [title] : []),
      `request_started_at: ${params.startedAt.toISOString()}`,
      `request_finished_at: ${params.finishedAt.toISOString()}`,
      `provider: ${params.settings.provider}`,
      `model: ${params.settings.model || '(default)'}`,
      `base_url: ${params.settings.baseUrl || '(default)'}`,
      '',
      '===== LLM INPUT =====',
      params.prompt,
      '',
      params.error === undefined ? '===== LLM OUTPUT =====' : '===== LLM ERROR =====',
      params.error === undefined ? (params.output || '') : errorText,
      '',
    ].join('\n');

    if (params.log?.session) {
      await appendToLogSession(params.log.session, `${content}\n`);
    } else {
      const sequence = (logSequence = (logSequence + 1) % 10000);
      const filename = `${getLogTimestamp(params.startedAt)}_${String(sequence).padStart(4, '0')}.log`;
      const logDir = getLogDir();
      await fs.mkdir(logDir, { recursive: true });
      await fs.writeFile(path.join(logDir, filename), content, 'utf8');
    }
  } catch (logError) {
    console.error('LLM log write failed:', logError);
  }
}

function mergeSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter(Boolean) as AbortSignal[];
  if (!activeSignals.length) return undefined;
  if (activeSignals.some((signal) => signal.aborted)) return AbortSignal.abort();

  const controller = new AbortController();
  const abort = () => controller.abort();
  activeSignals.forEach((signal) => signal.addEventListener('abort', abort, { once: true }));
  return controller.signal;
}

export async function callLLM(prompt: string, settings?: LLMSettings, signal?: AbortSignal, log?: LLMLogOptions): Promise<string> {
  const cfg = settings || (await getLLMSettings());
  const startedAt = new Date();

  try {
    let output: string;
    if (cfg.provider === 'omlx') output = await callOmlx(prompt, cfg, signal);
    else if (cfg.provider === 'ollama') output = await callOllama(prompt, cfg, signal);
    else if (cfg.provider === 'anthropic') output = await callAnthropic(prompt, cfg, signal);
    else if (cfg.provider === 'gemini') output = await callGemini(prompt, cfg, signal);
    else output = await callOpenAI(prompt, cfg, signal);

    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, output, log });
    }
    return output;
  } catch (error) {
    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, error, log });
    }
    throw error;
  }
}

async function callOpenAI(prompt: string, cfg: LLMSettings, signal?: AbortSignal): Promise<string> {
  const baseUrl = cfg.baseUrl || 'https://api.openai.com/v1';
  const model = cfg.model || 'gpt-4o-mini';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(prompt: string, cfg: LLMSettings, signal?: AbortSignal): Promise<string> {
  const model = cfg.model || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content[0]?.text || '';
}

async function callGemini(prompt: string, cfg: LLMSettings, signal?: AbortSignal): Promise<string> {
  const model = cfg.model || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
      signal,
    }
  );
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates[0]?.content?.parts[0]?.text || '';
}

// omlx: OpenAI 호환이지만 로컬 Apple Silicon 서버 전용
// - 기본 URL: http://localhost:8000/v1
// - API 키 필수 (Bearer 인증)
// - maxConcurrency <= 1 시 한 번에 한 요청만 처리 (로컬 자원 보호)
async function callOmlx(prompt: string, cfg: LLMSettings, signal?: AbortSignal): Promise<string> {
  const baseUrl = cfg.baseUrl || 'http://localhost:8000/v1';
  const model = cfg.model;
  if (!model) throw new Error('omlx: 모델명을 설정해주세요. 서버에서 모델 가져오기를 사용하세요.');

  const doRequest = async (): Promise<string> => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '당신은 유능하고 친절한 AI 어시스턴트입니다.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
      // 로컬 LLM은 응답이 느릴 수 있으므로 5분 타임아웃
      signal: mergeSignals(signal, AbortSignal.timeout(300_000)),
    });
    if (!res.ok) throw new Error(`omlx API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content || '';
  };

  if (cfg.maxConcurrency <= 1) {
    // 순차 처리: 이전 요청이 끝날 때까지 대기
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    const prev = omlxLock;
    omlxLock = next;
    try {
      await prev;
      return await doRequest();
    } finally {
      resolve();
    }
  }
  return doRequest();
}

async function callOllama(prompt: string, cfg: LLMSettings, signal?: AbortSignal): Promise<string> {
  const baseUrl = cfg.baseUrl || 'http://localhost:11434';
  const model = cfg.model || 'llama3';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response || '';
}
