import fs from 'fs/promises';
import path from 'path';
import { queryAll } from './db';
import { LOG_DIR } from './storage';

export interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openai-compatible';
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  temperatureEnabled: boolean;
  temperatures: AiTemperatures;
  providerSettings: Record<string, {
    model: string;
    baseUrl: string;
    maxConcurrency: number;
    temperatureEnabled?: boolean;
    temperatures?: AiTemperatures;
  }>;
  // 호환용 필드: maxConcurrency <= 1이면 true
  sequentialMode: boolean;
  loggingEnabled: boolean;
  artifactStripIntroBlocks: boolean;
  artifactStripIntroBlocksDeprecated: boolean;
  pdfRedactionTopCm: number;
  aiEnabled: boolean;
}

const LLM_PROVIDERS = ['gemini', 'openai', 'anthropic', 'ollama', 'openai-compatible'] as const;

export interface AiTemperatures {
  domainManagement: number;
  recordsScoring: number;
  recordsComments: number;
}

function providerTemperatureMax(provider: string) {
  return provider === 'anthropic' ? 1 : 2;
}

function defaultTemperatures(provider: string): AiTemperatures {
  return provider === 'anthropic'
    ? { domainManagement: 0.4, recordsScoring: 0, recordsComments: 0.5 }
    : { domainManagement: 0.5, recordsScoring: 0, recordsComments: 0.7 };
}

function readTemperature(map: Record<string, string>, provider: string, key: keyof AiTemperatures, fallback: number) {
  const aliases = providerSettingKey(provider);
  const saved = aliases.map((alias) => map[`llm_temperature_${alias}_${key}`]).find((value) => value !== undefined);
  const numeric = parseFloat(saved ?? '');
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(providerTemperatureMax(provider), numeric));
}

function getProviderTemperatures(map: Record<string, string>, provider: string): AiTemperatures {
  const defaults = defaultTemperatures(provider);
  return {
    domainManagement: readTemperature(map, provider, 'domainManagement', defaults.domainManagement),
    recordsScoring: readTemperature(map, provider, 'recordsScoring', defaults.recordsScoring),
    recordsComments: readTemperature(map, provider, 'recordsComments', defaults.recordsComments),
  };
}

function clampTemperatureForProvider(provider: string, value: number | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.3;
  return Math.max(0, Math.min(providerTemperatureMax(provider), numeric));
}

export function supportsTemperature(provider: string, model: string) {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;
  if (provider === 'anthropic') return !normalized.includes('opus');
  if (provider === 'openai' || provider === 'openai-compatible') {
    return !(
      normalized.startsWith('o1') ||
      normalized.startsWith('o3') ||
      normalized.startsWith('o4') ||
      normalized.startsWith('gpt-5')
    );
  }
  return true;
}

function providerSettingKey(provider: string) {
  return provider === 'openai-compatible' ? ['openai-compatible', 'omlx'] : [provider];
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

export interface LLMImageAttachment {
  filename: string;
  mimeType: string;
  data: string;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const rows = await queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const maxConcurrency = parseInt(map['llm_max_concurrency'] || '5', 10);
  const savedProvider = map['llm_provider'] || 'gemini';
  const provider = (savedProvider === 'omlx' ? 'openai-compatible' : savedProvider) as LLMSettings['provider'];
  
  const apiKeys: Record<string, string> = {
    gemini: map['llm_api_key_gemini'] || map['llm_api_key'] || '', // Fallback to old key for backward compatibility
    openai: map['llm_api_key_openai'] || '',
    anthropic: map['llm_api_key_anthropic'] || '',
    'openai-compatible': map['llm_api_key_openai-compatible'] || map['llm_api_key_omlx'] || '',
  };
  const providerSettings = Object.fromEntries(LLM_PROVIDERS.map((p) => {
    const keys = providerSettingKey(p);
    const model = keys.map((key) => map[`llm_model_${key}`]).find((value) => value !== undefined) ?? '';
    const baseUrl = keys.map((key) => map[`llm_base_url_${key}`]).find((value) => value !== undefined) ?? '';
    const providerConcurrency = keys
      .map((key) => map[`llm_max_concurrency_${key}`])
      .find((value) => value !== undefined);
    return [p, {
      model,
      baseUrl,
      maxConcurrency: providerConcurrency !== undefined
        ? (parseInt(providerConcurrency, 10) || 1)
        : (p === provider ? maxConcurrency : p === 'openai-compatible' ? 1 : 5),
      temperatureEnabled: map[`llm_temperature_enabled_${p}`] === 'true',
      temperatures: getProviderTemperatures(map, p),
    }];
  }));
  const activeProviderSettings = providerSettings[provider] || { model: '', baseUrl: '', maxConcurrency };
  const model = activeProviderSettings.model || map['llm_model'] || '';
  const baseUrl = activeProviderSettings.baseUrl || map['llm_base_url'] || '';
  const activeMaxConcurrency = parseInt(String(activeProviderSettings.maxConcurrency || ''), 10) || maxConcurrency;

  return {
    provider,
    apiKey: apiKeys[provider] || '',
    apiKeys,
    model,
    baseUrl,
    maxConcurrency: activeMaxConcurrency,
    temperatureEnabled: activeProviderSettings.temperatureEnabled === true,
    temperatures: activeProviderSettings.temperatures || getProviderTemperatures(map, provider),
    providerSettings,
    sequentialMode: activeMaxConcurrency <= 1,
    loggingEnabled: map['llm_logging_enabled'] !== 'false',
    artifactStripIntroBlocks: map['artifact_strip_intro_blocks'] !== 'false',
    artifactStripIntroBlocksDeprecated: map['artifact_strip_intro_blocks_deprecated'] === 'true',
    pdfRedactionTopCm: Math.max(0, Math.min(30, parseFloat(map['pdf_redaction_top_cm'] || '0') || 0)),
    aiEnabled: map['ai_enabled'] === 'true',
  };
}

export async function fetchOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`모델 목록 조회 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string }[] };
  return data.data.map((m) => m.id);
}

export async function fetchOpenAIModels(apiKey: string, baseUrl = 'https://api.openai.com/v1'): Promise<string[]> {
  return fetchOpenAICompatibleModels(baseUrl, apiKey);
}

export async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Claude 모델 목록 조회 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data || []).map((m) => m.id).filter((id): id is string => Boolean(id));
}

export async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Gemini 모델 목록 조회 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[]; supportedActions?: string[] }[];
  };
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || m.supportedActions || []).includes('generateContent'))
    .map((m) => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);
}

export async function fetchOllamaModels(baseUrl = 'http://localhost:11434'): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama 모델 목록 조회 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { models?: { name?: string }[] };
  return (data.models || []).map((m) => m.name).filter((name): name is string => Boolean(name));
}

let compatibleLock: Promise<void> = Promise.resolve();
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
  return LOG_DIR;
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
  temperature?: number;
  prompt: string;
  attachments?: LLMImageAttachment[];
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
      `temperature: ${params.temperature ?? '(default)'}`,
      '',
      '===== LLM INPUT =====',
      params.prompt,
      ...(params.attachments?.length ? [
        '',
        '===== LLM IMAGE ATTACHMENTS =====',
        ...params.attachments.map((item, index) =>
          `${index + 1}. ${item.filename} (${item.mimeType}, base64 ${item.data.length} chars)`
        ),
      ] : []),
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

export async function callLLM(
  prompt: string,
  settings?: LLMSettings,
  signal?: AbortSignal,
  log?: LLMLogOptions,
  attachments: LLMImageAttachment[] = [],
  temperature?: number,
): Promise<string> {
  const cfg = settings || (await getLLMSettings());
  if (!cfg.aiEnabled) {
    throw new Error('AI 기능이 꺼져 있습니다. 환경 설정에서 AI 기능 사용을 켜세요.');
  }
  const startedAt = new Date();
  const requestTemperature = cfg.temperatureEnabled && supportsTemperature(cfg.provider, cfg.model)
    ? clampTemperatureForProvider(cfg.provider, temperature)
    : undefined;

  try {
    let output: string;
    if (cfg.provider === 'openai-compatible') output = await callOpenAICompatible(prompt, cfg, signal, attachments, requestTemperature);
    else if (cfg.provider === 'ollama') output = await callOllama(prompt, cfg, signal, attachments, requestTemperature);
    else if (cfg.provider === 'anthropic') output = await callAnthropic(prompt, cfg, signal, attachments, requestTemperature);
    else if (cfg.provider === 'gemini') output = await callGemini(prompt, cfg, signal, attachments, requestTemperature);
    else output = await callOpenAI(prompt, cfg, signal, attachments, requestTemperature);

    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, attachments, output, log, temperature: requestTemperature });
    }
    return output;
  } catch (error) {
    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, attachments, error, log, temperature: requestTemperature });
    }
    throw error;
  }
}

function buildOpenAIContent(prompt: string, attachments: LLMImageAttachment[]) {
  if (!attachments.length) return prompt;
  return [
    { type: 'text', text: prompt },
    ...attachments.map((item) => ({
      type: 'image_url',
      image_url: { url: `data:${item.mimeType};base64,${item.data}` },
    })),
  ];
}

async function callOpenAI(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<string> {
  const baseUrl = cfg.baseUrl || 'https://api.openai.com/v1';
  const model = cfg.model || 'gpt-4o-mini';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildOpenAIContent(prompt, attachments) }],
      ...(temperature !== undefined ? { temperature } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<string> {
  const model = cfg.model || 'claude-sonnet-4-6';
  const content = attachments.length
    ? [
        { type: 'text', text: prompt },
        ...attachments.map((item) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: item.mimeType,
            data: item.data,
          },
        })),
      ]
    : prompt;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(temperature !== undefined ? { temperature } : {}),
      messages: [{ role: 'user', content }],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content[0]?.text || '';
}

async function callGemini(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<string> {
  const model = cfg.model || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            ...attachments.map((item) => ({
              inline_data: {
                mime_type: item.mimeType,
                data: item.data,
              },
            })),
          ],
        }],
        ...(temperature !== undefined ? { generationConfig: { temperature } } : {}),
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

async function callOpenAICompatible(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<string> {
  const baseUrl = cfg.baseUrl || 'http://localhost:8000/v1';
  const model = cfg.model;
  if (!model) throw new Error('OpenAI 호환: 모델명을 설정해주세요. 모델 가져오기를 사용하거나 직접 입력하세요.');

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
          { role: 'user', content: buildOpenAIContent(prompt, attachments) },
        ],
        ...(temperature !== undefined ? { temperature } : {}),
        max_tokens: 4096,
      }),
      // 로컬 LLM은 응답이 느릴 수 있으므로 5분 타임아웃
      signal: mergeSignals(signal, AbortSignal.timeout(300_000)),
    });
    if (!res.ok) throw new Error(`OpenAI 호환 API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content || '';
  };

  if (cfg.maxConcurrency <= 1) {
    // 순차 처리: 이전 요청이 끝날 때까지 대기
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    const prev = compatibleLock;
    compatibleLock = next;
    try {
      await prev;
      return await doRequest();
    } finally {
      resolve();
    }
  }
  return doRequest();
}

async function callOllama(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<string> {
  const baseUrl = cfg.baseUrl || 'http://localhost:11434';
  const model = cfg.model || 'llama3';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(temperature !== undefined ? { options: { temperature } } : {}),
      ...(attachments.length ? { images: attachments.map((item) => item.data) } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response || '';
}
