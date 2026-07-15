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
  anthropicOptionsEnabled: boolean;
  anthropicEffort: AnthropicEffort;
  anthropicThinkingEnabled: boolean;
  anthropicMaxTokens: number;
  providerSettings: Record<string, {
    model: string;
    baseUrl: string;
    maxConcurrency: number;
    temperatureEnabled?: boolean;
    temperatures?: AiTemperatures;
    anthropicOptionsEnabled?: boolean;
    anthropicEffort?: AnthropicEffort;
    anthropicThinkingEnabled?: boolean;
    anthropicMaxTokens?: number;
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

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const ANTHROPIC_EFFORTS = new Set<AnthropicEffort>(['low', 'medium', 'high', 'xhigh', 'max']);

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
  if (provider === 'anthropic') return false;
  const normalized = model.trim().toLowerCase();
  if (!normalized) return true;
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

function sanitizeAnthropicEffort(value: unknown): AnthropicEffort {
  return ANTHROPIC_EFFORTS.has(value as AnthropicEffort) ? value as AnthropicEffort : 'high';
}

function sanitizeAnthropicMaxTokens(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 8192;
  return Math.floor(numeric);
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

interface LLMCallResult {
  text: string;
  requestJson: unknown;
  responseJson: unknown;
}

export interface AnthropicBatchRequest {
  custom_id: string;
  params: Record<string, unknown>;
}

export type AnthropicJsonSchema = Record<string, unknown>;

export interface AnthropicBatchInfo {
  id: string;
  processing_status: string;
  request_counts?: {
    processing?: number;
    succeeded?: number;
    errored?: number;
    canceled?: number;
    expired?: number;
  };
  results_url?: string | null;
}

export interface AnthropicBatchResultLine {
  custom_id: string;
  result: {
    type: string;
    message?: { content?: { type?: string; text?: string }[] };
    error?: unknown;
  };
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
      anthropicOptionsEnabled: map[`llm_anthropic_options_enabled_${p}`] === 'true',
      anthropicEffort: sanitizeAnthropicEffort(map[`llm_anthropic_effort_${p}`]),
      anthropicThinkingEnabled: map[`llm_anthropic_thinking_enabled_${p}`] === 'true',
      anthropicMaxTokens: sanitizeAnthropicMaxTokens(map[`llm_anthropic_max_tokens_${p}`]),
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
    anthropicOptionsEnabled: activeProviderSettings.anthropicOptionsEnabled === true,
    anthropicEffort: sanitizeAnthropicEffort(activeProviderSettings.anthropicEffort),
    anthropicThinkingEnabled: activeProviderSettings.anthropicThinkingEnabled === true,
    anthropicMaxTokens: sanitizeAnthropicMaxTokens(activeProviderSettings.anthropicMaxTokens),
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

function formatLogJson(value: unknown): string {
  if (value === undefined) return '(없음)';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function writeLLMLog(params: {
  startedAt: Date;
  finishedAt: Date;
  settings: LLMSettings;
  temperature?: number;
  anthropicEffort?: AnthropicEffort;
  anthropicThinkingEnabled?: boolean;
  anthropicPromptCachingEnabled?: boolean;
  anthropicCachePrefixChars?: number;
  prompt: string;
  attachments?: LLMImageAttachment[];
  requestJson?: unknown;
  responseJson?: unknown;
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
      `anthropic_effort: ${params.anthropicEffort ?? '(default)'}`,
      `anthropic_thinking: ${params.anthropicThinkingEnabled === undefined ? '(default)' : String(params.anthropicThinkingEnabled)}`,
      `anthropic_prompt_caching: ${params.anthropicPromptCachingEnabled === undefined ? '(default)' : String(params.anthropicPromptCachingEnabled)}`,
      `anthropic_cache_prefix_chars: ${params.anthropicCachePrefixChars ?? 0}`,
      '',
      '===== LLM REQUEST JSON =====',
      formatLogJson(params.requestJson),
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
      '===== LLM RESPONSE JSON =====',
      formatLogJson(params.responseJson),
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

async function writeLLMJsonLog(params: {
  label: string;
  settings: LLMSettings;
  startedAt: Date;
  finishedAt: Date;
  requestJson?: unknown;
  responseJson?: unknown;
  error?: unknown;
}): Promise<void> {
  if (!params.settings.loggingEnabled) return;
  try {
    const errorText = params.error instanceof Error
      ? `${params.error.name}: ${params.error.message}`
      : params.error === undefined
        ? ''
        : String(params.error);
    const sequence = (logSequence = (logSequence + 1) % 10000);
    const filename = `${getLogTimestamp(params.startedAt)}_${String(sequence).padStart(4, '0')}.log`;
    const content = [
      `===== ${params.label} =====`,
      `request_started_at: ${params.startedAt.toISOString()}`,
      `request_finished_at: ${params.finishedAt.toISOString()}`,
      `provider: ${params.settings.provider}`,
      `model: ${params.settings.model || '(default)'}`,
      '',
      '===== LLM REQUEST JSON =====',
      formatLogJson(params.requestJson),
      '',
      '===== LLM RESPONSE JSON =====',
      formatLogJson(params.responseJson),
      '',
      params.error === undefined ? '' : '===== LLM ERROR =====',
      params.error === undefined ? '' : errorText,
      '',
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');
    const logDir = getLogDir();
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(path.join(logDir, filename), content, 'utf8');
  } catch (logError) {
    console.error('LLM JSON log write failed:', logError);
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
  cachePrefix?: string,
  outputSchema?: AnthropicJsonSchema,
): Promise<string> {
  const cfg = settings || (await getLLMSettings());
  if (!cfg.aiEnabled) {
    throw new Error('AI 기능이 꺼져 있습니다. 환경 설정에서 AI 기능 사용을 켜세요.');
  }
  const startedAt = new Date();
  const requestTemperature = cfg.temperatureEnabled && supportsTemperature(cfg.provider, cfg.model)
    ? clampTemperatureForProvider(cfg.provider, temperature)
    : undefined;
  const anthropicEffort = cfg.provider === 'anthropic' && cfg.anthropicOptionsEnabled
    ? cfg.anthropicEffort
    : undefined;
  const anthropicThinkingEnabled = cfg.provider === 'anthropic' && cfg.anthropicOptionsEnabled
    ? cfg.anthropicThinkingEnabled
    : undefined;
  const anthropicPromptCachingEnabled = cfg.provider === 'anthropic' ? true : undefined;

  try {
    let result: LLMCallResult;
    if (cfg.provider === 'openai-compatible') result = await callOpenAICompatible(prompt, cfg, signal, attachments, requestTemperature);
    else if (cfg.provider === 'ollama') result = await callOllama(prompt, cfg, signal, attachments, requestTemperature);
    else if (cfg.provider === 'anthropic') result = await callAnthropic(prompt, cfg, signal, attachments, requestTemperature, anthropicEffort, anthropicThinkingEnabled, anthropicPromptCachingEnabled, cachePrefix, outputSchema);
    else if (cfg.provider === 'gemini') result = await callGemini(prompt, cfg, signal, attachments, requestTemperature);
    else result = await callOpenAI(prompt, cfg, signal, attachments, requestTemperature);

    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, attachments, requestJson: result.requestJson, responseJson: result.responseJson, output: result.text, log, temperature: requestTemperature, anthropicEffort, anthropicThinkingEnabled, anthropicPromptCachingEnabled, anthropicCachePrefixChars: cachePrefix?.length });
    }
    return result.text;
  } catch (error) {
    if (cfg.loggingEnabled) {
      await writeLLMLog({ startedAt, finishedAt: new Date(), settings: cfg, prompt, attachments, error, log, temperature: requestTemperature, anthropicEffort, anthropicThinkingEnabled, anthropicPromptCachingEnabled, anthropicCachePrefixChars: cachePrefix?.length });
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

function splitPromptForCache(prompt: string, cachePrefix?: string) {
  const prefix = cachePrefix?.trim();
  if (!prefix || !prompt.startsWith(prefix)) return { prefix: '', dynamic: prompt };
  return {
    prefix,
    dynamic: prompt.slice(prefix.length).trimStart(),
  };
}

async function callOpenAI(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<LLMCallResult> {
  const baseUrl = cfg.baseUrl || 'https://api.openai.com/v1';
  const model = cfg.model || 'gpt-4o-mini';
  const requestJson = {
    model,
    messages: [{ role: 'user', content: buildOpenAIContent(prompt, attachments) }],
    ...(temperature !== undefined ? { temperature } : {}),
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(requestJson),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return { text: data.choices[0]?.message?.content || '', requestJson, responseJson: data };
}

function buildAnthropicContent(prompt: string, attachments: LLMImageAttachment[], promptCachingEnabled?: boolean, cachePrefix?: string) {
  const cached = promptCachingEnabled === true ? splitPromptForCache(prompt, cachePrefix) : { prefix: '', dynamic: prompt };
  const attachmentBlocks = attachments.map((item) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: item.mimeType,
      data: item.data,
    },
  }));

  if (cached.prefix) {
    return {
      system: [
        { type: 'text', text: cached.prefix, cache_control: { type: 'ephemeral' } },
      ],
      content: [
        ...(cached.dynamic ? [{ type: 'text', text: cached.dynamic }] : [{ type: 'text', text: '응답을 생성하세요.' }]),
        ...attachmentBlocks,
      ],
      usedBlockCache: true,
    };
  }

  if (promptCachingEnabled === true) {
    return {
      system: [
        { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
      ],
      content: [
        { type: 'text', text: '응답을 생성하세요.' },
        ...attachmentBlocks,
      ],
      usedBlockCache: true,
    };
  }

  return {
    system: undefined,
    content: attachments.length
      ? [{ type: 'text', text: prompt }, ...attachmentBlocks]
      : prompt,
    usedBlockCache: false,
  };
}

export function buildAnthropicMessageParams(
  prompt: string,
  cfg: LLMSettings,
  attachments: LLMImageAttachment[] = [],
  temperature?: number,
  cachePrefix?: string,
  outputSchema?: AnthropicJsonSchema,
): Record<string, unknown> {
  const model = cfg.model || 'claude-sonnet-5';
  const requestTemperature = cfg.temperatureEnabled && supportsTemperature(cfg.provider, cfg.model)
    ? clampTemperatureForProvider(cfg.provider, temperature)
    : undefined;
  const effort = cfg.anthropicOptionsEnabled ? cfg.anthropicEffort : undefined;
  const thinkingEnabled = cfg.anthropicOptionsEnabled ? cfg.anthropicThinkingEnabled : undefined;
  const { system, content } = buildAnthropicContent(prompt, attachments, true, cachePrefix);
  const outputConfig = {
    ...(effort !== undefined ? { effort } : {}),
    ...(outputSchema ? { format: { type: 'json_schema', schema: outputSchema } } : {}),
  };
  return {
    model,
    max_tokens: sanitizeAnthropicMaxTokens(cfg.anthropicMaxTokens),
    ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    ...(thinkingEnabled !== undefined ? { thinking: { type: thinkingEnabled === true ? 'adaptive' : 'disabled' } } : {}),
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content }],
  };
}

async function callAnthropic(
  prompt: string,
  cfg: LLMSettings,
  signal?: AbortSignal,
  attachments: LLMImageAttachment[] = [],
  temperature?: number,
  effort?: AnthropicEffort,
  thinkingEnabled?: boolean,
  promptCachingEnabled?: boolean,
  cachePrefix?: string,
  outputSchema?: AnthropicJsonSchema,
): Promise<LLMCallResult> {
  const params = buildAnthropicMessageParams(prompt, {
    ...cfg,
    temperatureEnabled: temperature !== undefined,
    anthropicOptionsEnabled: effort !== undefined || thinkingEnabled !== undefined,
    anthropicEffort: effort || cfg.anthropicEffort,
    anthropicThinkingEnabled: thinkingEnabled === true,
    anthropicMaxTokens: cfg.anthropicMaxTokens,
  }, attachments, temperature, promptCachingEnabled === true ? cachePrefix : undefined, outputSchema);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type?: string; text?: string }[] };
  const text = (data.content || [])
    .filter((block) => block.type === 'text' || block.text !== undefined)
    .map((block) => block.text || '')
    .join('\n')
    .trim();
  return { text, requestJson: params, responseJson: data };
}

export function extractAnthropicText(message: { content?: { type?: string; text?: string }[] } | undefined): string {
  return (message?.content || [])
    .filter((block) => block.type === 'text' || block.text !== undefined)
    .map((block) => block.text || '')
    .join('\n')
    .trim();
}

export async function createAnthropicMessageBatch(cfg: LLMSettings, requests: AnthropicBatchRequest[]): Promise<AnthropicBatchInfo> {
  const startedAt = new Date();
  const requestJson = { requests };
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestJson),
  });
  const responseJson = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok) {
    const error = new Error(`Anthropic Batch API error ${res.status}: ${formatLogJson(responseJson)}`);
    await writeLLMJsonLog({ label: 'ANTHROPIC BATCH CREATE', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson, error });
    throw error;
  }
  await writeLLMJsonLog({ label: 'ANTHROPIC BATCH CREATE', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson });
  return responseJson as AnthropicBatchInfo;
}

export async function retrieveAnthropicMessageBatch(cfg: LLMSettings, batchId: string): Promise<AnthropicBatchInfo> {
  const startedAt = new Date();
  const requestJson = { batch_id: batchId };
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${encodeURIComponent(batchId)}`, {
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  const responseJson = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok) {
    const error = new Error(`Anthropic Batch 조회 오류 ${res.status}: ${formatLogJson(responseJson)}`);
    await writeLLMJsonLog({ label: 'ANTHROPIC BATCH RETRIEVE', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson, error });
    throw error;
  }
  await writeLLMJsonLog({ label: 'ANTHROPIC BATCH RETRIEVE', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson });
  return responseJson as AnthropicBatchInfo;
}

export async function retrieveAnthropicMessageBatchResults(cfg: LLMSettings, batchId: string): Promise<AnthropicBatchResultLine[]> {
  const startedAt = new Date();
  const requestJson = { batch_id: batchId, results: true };
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${encodeURIComponent(batchId)}/results`, {
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const responseJson = { raw: text };
    const error = new Error(`Anthropic Batch 결과 조회 오류 ${res.status}: ${text}`);
    await writeLLMJsonLog({ label: 'ANTHROPIC BATCH RESULTS', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson, error });
    throw error;
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AnthropicBatchResultLine);
  await writeLLMJsonLog({ label: 'ANTHROPIC BATCH RESULTS', settings: cfg, startedAt, finishedAt: new Date(), requestJson, responseJson: lines });
  return lines;
}

async function callGemini(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<LLMCallResult> {
  const model = cfg.model || 'gemini-2.5-flash';
  const requestJson = {
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
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestJson),
      signal,
    }
  );
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return { text: data.candidates[0]?.content?.parts[0]?.text || '', requestJson, responseJson: data };
}

async function callOpenAICompatible(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<LLMCallResult> {
  const baseUrl = cfg.baseUrl || 'http://localhost:8000/v1';
  const model = cfg.model;
  if (!model) throw new Error('OpenAI 호환: 모델명을 설정해주세요. 모델 가져오기를 사용하거나 직접 입력하세요.');

  const doRequest = async (): Promise<LLMCallResult> => {
    const requestJson = {
      model,
      messages: [
        { role: 'system', content: '당신은 유능하고 친절한 AI 어시스턴트입니다.' },
        { role: 'user', content: buildOpenAIContent(prompt, attachments) },
      ],
      ...(temperature !== undefined ? { temperature } : {}),
      max_tokens: 8192,
    };
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(requestJson),
      // 로컬 LLM은 응답이 느릴 수 있으므로 5분 타임아웃
      signal: mergeSignals(signal, AbortSignal.timeout(300_000)),
    });
    if (!res.ok) throw new Error(`OpenAI 호환 API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return { text: data.choices[0]?.message?.content || '', requestJson, responseJson: data };
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

async function callOllama(prompt: string, cfg: LLMSettings, signal?: AbortSignal, attachments: LLMImageAttachment[] = [], temperature?: number): Promise<LLMCallResult> {
  const baseUrl = cfg.baseUrl || 'http://localhost:11434';
  const model = cfg.model || 'llama3';
  const requestJson = {
    model,
    prompt,
    stream: false,
    ...(temperature !== undefined ? { options: { temperature } } : {}),
    ...(attachments.length ? { images: attachments.map((item) => item.data) } : {}),
  };
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestJson),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return { text: data.response || '', requestJson, responseJson: data };
}
