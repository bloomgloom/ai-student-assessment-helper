import { useState, useEffect } from 'react';
import { settingsApi } from '../lib/api';
import { Save, TestTube, CheckCircle, XCircle, Loader2, RefreshCw, Server, Trash2, AlertTriangle } from 'lucide-react';

interface Settings {
  provider: string;
  apiKey: string; // Current active provider's key
  apiKeys: Record<string, string>; // Keys for all providers
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  loggingEnabled: boolean;
}

const PROVIDERS = [
  { value: 'gemini',            label: 'Google Gemini' },
  { value: 'openai',            label: 'OpenAI' },
  { value: 'anthropic',         label: 'Anthropic (Claude)' },
  { value: 'omlx',              label: 'oMLX (로컬 · Apple Silicon)' },
  { value: 'ollama',            label: 'Ollama (로컬)' },
  { value: 'openai-compatible', label: 'OpenAI 호환 (커스텀)' },
];

const DEFAULT_MODELS: Record<string, string> = {
  gemini:            'gemini-2.5-flash',
  openai:            'gpt-4o-mini',
  anthropic:         'claude-sonnet-4-6',
  omlx:              '',   // 서버에서 목록 조회
  ollama:            'llama3',
  'openai-compatible': '',
};

const DEFAULT_URLS: Record<string, string> = {
  omlx:              'http://localhost:8000/v1',
  ollama:            'http://localhost:11434',
  'openai-compatible': '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    provider: 'gemini',
    apiKey: '',
    apiKeys: {},
    model: '',
    baseUrl: '',
    maxConcurrency: 5,
    loggingEnabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // omlx 전용: 서버에서 모델 목록
  const [omlxModels, setOmlxModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.get().then((r) => setSettings(r.data));
  }, []);

  const handleProviderChange = (provider: string) => {
    setSettings((s) => ({
      ...s,
      provider,
      apiKey: s.apiKeys?.[provider] || '',
      model: DEFAULT_MODELS[provider] ?? '',
      baseUrl: DEFAULT_URLS[provider] ?? '',
      // omlx는 로컬 자원 보호를 위해 동시 요청 1개 기본값
      maxConcurrency: provider === 'omlx' ? 1 : 5,
    }));
    setOmlxModels([]);
    setModelFetchError(null);
  };

  const handleFetchOmlxModels = async () => {
    setFetchingModels(true);
    setModelFetchError(null);
    try {
      const baseUrl = settings.baseUrl || 'http://localhost:8000/v1';
      const r = await settingsApi.getOmlxModels(baseUrl, settings.apiKey);
      const models: string[] = r.data.models;
      setOmlxModels(models);
      // 자동으로 첫 번째 모델 선택
      if (models.length > 0 && !settings.model) {
        setSettings((s) => ({ ...s, model: models[0] }));
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      setModelFetchError(msg);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await settingsApi.update(settings as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await settingsApi.update(settings as unknown as Record<string, unknown>);
      const r = await settingsApi.test();
      setTestResult({ ok: true, message: r.data.response });
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await settingsApi.reset();
      setResetConfirm(false);
      alert('초기화가 완료되었습니다. 모든 데이터와 업로드 파일이 삭제되었습니다.');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      alert(`초기화 중 오류: ${msg}`);
    } finally {
      setResetting(false);
    }
  };

  const isOmlx    = settings.provider === 'omlx';
  const isOllama  = settings.provider === 'ollama';
  const needsKey  = settings.provider !== 'ollama';
  const needsUrl  = isOmlx || isOllama || settings.provider === 'openai-compatible';

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-1">환경 설정</h2>
      <p className="text-sm text-gray-500 mb-6">LLM 공급자 및 API 키를 설정합니다.</p>

      <div className="card p-6 space-y-5">

        {/* Provider */}
        <div>
          <label className="label">LLM 공급자</label>
          <select
            className="select"
            value={settings.provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* omlx 안내 배너 */}
        {isOmlx && (
          <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800">
            <Server size={14} className="mt-0.5 shrink-0 text-indigo-500" />
            <div>
              <p className="font-semibold mb-0.5">oMLX — Apple Silicon 로컬 LLM</p>
              <p>macOS에서 MLX 기반 모델을 로컬 실행합니다. Parallels VM에서 접속 시 호스트 IP(예: 10.211.55.2)로 변경하세요.</p>
              <p className="mt-1">
                설치:{' '}
                <code className="bg-indigo-100 px-1 rounded">brew tap jundot/omlx && brew install omlx</code>
              </p>
            </div>
          </div>
        )}

        {/* API Key */}
        {needsKey && (
          <div>
            <label className="label">
              {isOmlx ? 'oMLX API 키' : 'API 키'}
            </label>
            <input
              type="password"
              className="input font-mono text-xs"
              placeholder={isOmlx ? 'oMLX 설정에서 발급한 API 키' : 'API 키를 입력하세요'}
              value={settings.apiKeys?.[settings.provider] || ''}
              onChange={(e) => setSettings((s) => ({ 
                ...s, 
                apiKey: e.target.value,
                apiKeys: { ...s.apiKeys, [s.provider]: e.target.value } 
              }))}
            />
          </div>
        )}

        {/* Base URL */}
        {needsUrl && (
          <div>
            <label className="label">
              {isOmlx ? 'oMLX 서버 URL' : isOllama ? 'Ollama 서버 URL' : 'API Base URL'}
            </label>
            <input
              type="text"
              className="input font-mono text-xs"
              placeholder={DEFAULT_URLS[settings.provider] || 'https://your-api-endpoint/v1'}
              value={settings.baseUrl}
              onChange={(e) => setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
            />
            {isOmlx && (
              <p className="text-xs text-gray-400 mt-1">
                Parallels VM에서 맥 호스트 접속 시: <code>http://10.211.55.2:8000/v1</code>
              </p>
            )}
          </div>
        )}

        {/* 모델 선택 */}
        <div>
          <label className="label">모델</label>

          {isOmlx ? (
            /* omlx: 서버에서 목록 조회 후 드롭다운 */
            <div className="space-y-2">
              <div className="flex gap-2">
                {omlxModels.length > 0 ? (
                  <select
                    className="select flex-1"
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  >
                    <option value="">모델을 선택하세요</option>
                    {omlxModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="모델명 직접 입력 (예: gemma-4-26b-a4b-it-4bit)"
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  />
                )}
                <button
                  className="btn-secondary shrink-0"
                  onClick={handleFetchOmlxModels}
                  disabled={fetchingModels}
                  title="서버에서 로드된 모델 목록 가져오기"
                >
                  {fetchingModels
                    ? <Loader2 size={14} className="animate-spin" />
                    : <RefreshCw size={14} />}
                  {fetchingModels ? '조회 중...' : '모델 가져오기'}
                </button>
              </div>
              {modelFetchError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <XCircle size={12} /> {modelFetchError}
                </p>
              )}
              {omlxModels.length > 0 && (
                <p className="text-xs text-green-600">
                  {omlxModels.length}개 모델 로드됨
                </p>
              )}
            </div>
          ) : (
            /* 그 외 공급자: 텍스트 입력 */
            <>
              <input
                type="text"
                className="input"
                placeholder={DEFAULT_MODELS[settings.provider] || '모델명 입력'}
                value={settings.model}
                onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
              />
              {DEFAULT_MODELS[settings.provider] && (
                <p className="text-xs text-gray-400 mt-1">
                  비워두면 기본값({DEFAULT_MODELS[settings.provider]})이 사용됩니다.
                </p>
              )}
            </>
          )}
        </div>

        {/* 최대 동시 요청 수 */}
        <div>
          <label className="label">최대 동시 요청 수</label>
          <input
            type="number"
            className="input w-24"
            min={1}
            max={20}
            value={settings.maxConcurrency}
            onChange={(e) =>
              setSettings((s) => ({ ...s, maxConcurrency: parseInt(e.target.value, 10) || 1 }))
            }
          />
          <p className="text-xs text-gray-400 mt-1">
            1이면 순차 처리, 2 이상이면 병렬 처리합니다. 로컬 LLM은 1~3 권장.
          </p>
        </div>

        {/* LLM 요청/응답 로그 */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={settings.loggingEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, loggingEnabled: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-700">LLM 요청/응답 로그 저장</span>
          </label>
          <p className="text-xs text-gray-400 mt-1 ml-6">
            켜면 실행 단위별 입력과 출력을 <code>.log</code> 폴더에 저장합니다. 학생 산출물 내용이 포함될 수 있습니다.
          </p>
        </div>

        {/* 저장 / 테스트 */}
        <div className="flex items-center gap-3 pt-2">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
          <button className="btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
            연결 테스트
          </button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle size={14} /> 저장됨
            </span>
          )}
        </div>
      </div>

      {/* 테스트 결과 */}
      {testResult && (
        <div
          className={`mt-4 p-4 rounded-lg border text-sm ${
            testResult.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-start gap-2">
            {testResult.ok
              ? <CheckCircle size={16} className="mt-0.5 shrink-0" />
              : <XCircle    size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{testResult.ok ? '연결 성공' : '연결 실패'}</p>
              <p className="mt-1 text-xs whitespace-pre-wrap">{testResult.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* 공급자별 안내 */}
      <div className="mt-6 card p-4">
        <h3 className="text-sm font-semibold mb-2">공급자별 안내</h3>
        <ul className="text-xs text-gray-600 space-y-1.5">
          <li><span className="font-medium">Google Gemini:</span> Google AI Studio에서 API 키 발급 → gemini-2.5-flash 권장</li>
          <li><span className="font-medium">OpenAI:</span> OpenAI 플랫폼에서 API 키 발급 → gpt-4o-mini 권장</li>
          <li><span className="font-medium">Anthropic:</span> Anthropic Console에서 API 키 발급 → claude-sonnet-4-6 권장</li>
          <li>
            <span className="font-medium">oMLX:</span> Apple Silicon 맥에서 로컬 LLM 실행.{' '}
            <code className="bg-gray-100 px-1 rounded">brew tap jundot/omlx && brew install omlx</code>
            으로 설치 후 모델 로드. 최대 동시 요청 수 1~3 권장.
          </li>
          <li><span className="font-medium">Ollama:</span> 로컬 Ollama 서버 실행 후 사용</li>
          <li><span className="font-medium">OpenAI 호환:</span> LM Studio, vLLM 등 OpenAI 호환 API</li>
        </ul>
      </div>

      {/* 데이터 초기화 */}
      <div className="mt-6 card p-4 border-red-100">
        <h3 className="text-sm font-semibold mb-1 text-red-700">데이터 초기화</h3>
        <p className="text-xs text-gray-500 mb-3">
          모든 수업·기준·기록 데이터와 업로드된 파일을 삭제합니다. LLM 설정은 유지됩니다.
        </p>

        {!resetConfirm ? (
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
            onClick={() => setResetConfirm(true)}
          >
            <Trash2 size={13} /> 전체 초기화
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">정말 초기화하시겠습니까?</p>
                <p className="mt-0.5">기준 관리, 영역 관리, 기록 관리의 모든 데이터와 업로드 파일이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {resetting ? '초기화 중...' : '확인, 모두 삭제'}
              </button>
              <button
                className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                onClick={() => setResetConfirm(false)}
                disabled={resetting}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
