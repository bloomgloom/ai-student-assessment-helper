import { useState } from 'react';
import { Save, TestTube, CheckCircle, XCircle, Loader2, RefreshCw, Trash2, AlertTriangle, FolderOpen, Eye, EyeOff } from 'lucide-react';
import { DEFAULT_MODELS, DEFAULT_URLS, PROVIDERS } from './constants';
import { useSettingsController } from './useSettingsController';
import { SettingsTab } from './types';

interface SettingsContentProps extends ReturnType<typeof useSettingsController> {
  activeTab: SettingsTab;
}

export function SettingsContent({
  activeTab,
  settings,
  setSettings,
  saving,
  testing,
  testResult,
  saved,
  resetting,
  resetConfirm,
  setResetConfirm,
  browsingStorage,
  compatibleModels,
  fetchingModels,
  modelFetchError,
  handleProviderChange,
  handleFetchCompatibleModels,
  handleSave,
  handleTest,
  handleReset,
  handleBrowseStoragePath,
  isOllama,
  isOpenAICompatible,
  needsKey,
  needsUrl,
}: SettingsContentProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="flex-1 min-h-0 overflow-auto scrollbar-stable">
      <div className="min-w-[720px] max-w-2xl p-6">
      {activeTab === 'ai' && (
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

        {/* API Key */}
        {needsKey && (
          <div>
            <label className="label">API 키</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="input font-mono text-xs pr-10"
                placeholder={isOpenAICompatible ? 'API 키가 필요 없는 로컬 서버면 비워두세요' : 'API 키를 입력하세요'}
                value={settings.apiKeys?.[settings.provider] || ''}
                onChange={(e) => setSettings((s) => ({
                  ...s,
                  apiKey: e.target.value,
                  apiKeys: { ...s.apiKeys, [s.provider]: e.target.value }
                }))}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded"
                onClick={() => setShowApiKey((visible) => !visible)}
                title={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
                aria-label={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL */}
        {needsUrl && (
          <div>
            <label className="label">
              {isOpenAICompatible ? 'OpenAI 호환 서버 URL' : isOllama ? 'Ollama 서버 URL' : 'API Base URL'}
            </label>
            <input
              type="text"
              className="input font-mono text-xs"
              placeholder={DEFAULT_URLS[settings.provider] || 'https://your-api-endpoint/v1'}
              value={settings.baseUrl}
              onChange={(e) => setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
            />
            {isOpenAICompatible && (
              <p className="text-xs text-gray-400 mt-1">
                예: <code>http://localhost:8000/v1</code>, <code>http://localhost:1234/v1</code>
              </p>
            )}
          </div>
        )}

        {/* 모델 선택 */}
        <div>
          <label className="label">모델</label>

          {isOpenAICompatible ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {compatibleModels.length > 0 ? (
                  <select
                    className="select flex-1"
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  >
                    <option value="">모델을 선택하세요</option>
                    {compatibleModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="모델명 직접 입력"
                    value={settings.model}
                    onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  />
                )}
                <button
                  className="btn-secondary shrink-0"
                  onClick={handleFetchCompatibleModels}
                  disabled={fetchingModels}
                  title="OpenAI 호환 서버에서 모델 목록 가져오기"
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
              {compatibleModels.length > 0 && (
                <p className="text-xs text-green-600">
                  {compatibleModels.length}개 모델 로드됨
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

        {/* 산출물 입력 전처리 */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={settings.artifactStripIntroBlocks}
              onChange={(e) => setSettings((s) => ({ ...s, artifactStripIntroBlocks: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-700">산출물 첫 설명 블록 제외</span>
          </label>
          <p className="text-xs text-gray-400 mt-1 ml-6">
            켜면 HWPX 첫 표 행, IPYNB 첫 마크다운 셀, 코드 파일 맨 앞의 블록 주석이나 docstring을 AI 입력에서 제외합니다.
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
      )}

      {/* 테스트 결과 */}
      {activeTab === 'ai' && testResult && (
        <div
          className={`mt-4 p-4 rounded-lg border text-sm ${testResult.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
            }`}
        >
          <div className="flex items-start gap-2">
            {testResult.ok
              ? <CheckCircle size={16} className="mt-0.5 shrink-0" />
              : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{testResult.ok ? '연결 성공' : '연결 실패'}</p>
              <p className="mt-1 text-xs whitespace-pre-wrap">{testResult.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* 공급자별 안내 */}
      {activeTab === 'ai' && <div className="mt-6 card p-4">
        <h3 className="text-sm font-semibold mb-2">공급자별 안내</h3>
        <ul className="text-xs text-gray-600 space-y-1.5">
          <li><span className="font-medium">Google Gemini:</span> Google AI Studio에서 API 키 발급 → gemini-2.5-flash 권장</li>
          <li><span className="font-medium">OpenAI:</span> OpenAI 플랫폼에서 API 키 발급 → gpt-4o-mini 권장</li>
          <li><span className="font-medium">Anthropic:</span> Anthropic Console에서 API 키 발급 → claude-sonnet-4-6 권장</li>
          <li><span className="font-medium">Ollama:</span> 로컬 Ollama 서버 실행 후 사용</li>
          <li><span className="font-medium">OpenAI 호환:</span> 기본 서버는 <code className="bg-gray-100 px-1 rounded">http://localhost:8000/v1</code>이며, 모델 가져오기로 목록을 불러올 수 있습니다.</li>
        </ul>
      </div>}

      {activeTab === 'data' && (
      <div className="card p-6 space-y-6">
        <div>
          <label className="label">데이터 저장 경로</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input font-mono text-xs flex-1"
              value={settings.storageRoot}
              disabled={settings.storage?.envLocked}
              placeholder={settings.storage?.defaultRoot || 'storage 경로'}
              onChange={(e) => setSettings((s) => ({ ...s, storageRoot: e.target.value }))}
            />
            <button
              className="btn-secondary shrink-0"
              onClick={handleBrowseStoragePath}
              disabled={browsingStorage || settings.storage?.envLocked}
              title="서버가 실행 중인 컴퓨터에서 폴더 선택"
            >
              {browsingStorage ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              찾아보기
            </button>
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-gray-400">
            <p>현재 적용 경로: <code>{settings.storage?.currentRoot || '-'}</code></p>
            <p>기본 경로: <code>{settings.storage?.defaultRoot || '-'}</code></p>
            {settings.storage?.envLocked ? (
              <p className="text-amber-600">APP_STORAGE_DIR 환경변수가 설정되어 있어 화면에서 변경할 수 없습니다.</p>
            ) : (
              <p>변경한 저장 경로는 저장 후 서버를 재시작한 뒤 적용됩니다. 비우거나 기본 경로를 입력하면 기본값을 사용합니다.</p>
            )}
          </div>
          <div className="flex items-center gap-3 pt-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving || settings.storage?.envLocked}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              저장
            </button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle size={14} /> 저장됨
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
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
                <p className="mt-0.5">성취 기준 관리, 평가 영역 관리, 채점 기록 관리의 모든 데이터와 업로드 파일이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
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
      )}
      </div>
    </div>
  );
}
