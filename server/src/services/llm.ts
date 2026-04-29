import { queryAll } from './db';

export interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openai-compatible' | 'omlx';
  apiKey: string;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  // omlx 전용: 로컬 자원 보호를 위한 순차 처리 여부
  sequentialMode: boolean;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const rows = await queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    provider: (map['llm_provider'] as LLMSettings['provider']) || 'gemini',
    apiKey: map['llm_api_key'] || '',
    model: map['llm_model'] || '',
    baseUrl: map['llm_base_url'] || '',
    maxConcurrency: parseInt(map['llm_max_concurrency'] || '5', 10),
    sequentialMode: map['llm_sequential_mode'] === 'true',
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

export async function callLLM(prompt: string, settings?: LLMSettings): Promise<string> {
  const cfg = settings || (await getLLMSettings());

  if (cfg.provider === 'omlx') return callOmlx(prompt, cfg);
  if (cfg.provider === 'ollama') return callOllama(prompt, cfg);
  if (cfg.provider === 'anthropic') return callAnthropic(prompt, cfg);
  if (cfg.provider === 'gemini') return callGemini(prompt, cfg);
  return callOpenAI(prompt, cfg);
}

async function callOpenAI(prompt: string, cfg: LLMSettings): Promise<string> {
  const baseUrl = cfg.baseUrl || 'https://api.openai.com/v1';
  const model = cfg.model || 'gpt-4o-mini';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(prompt: string, cfg: LLMSettings): Promise<string> {
  const model = cfg.model || 'claude-sonnet-4-6';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content[0]?.text || '';
}

async function callGemini(prompt: string, cfg: LLMSettings): Promise<string> {
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
// - sequentialMode=true 시 한 번에 한 요청만 처리 (로컬 자원 보호)
async function callOmlx(prompt: string, cfg: LLMSettings): Promise<string> {
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
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`omlx API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content || '';
  };

  if (cfg.sequentialMode) {
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

async function callOllama(prompt: string, cfg: LLMSettings): Promise<string> {
  const baseUrl = cfg.baseUrl || 'http://localhost:11434';
  const model = cfg.model || 'llama3';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { response: string };
  return data.response || '';
}
