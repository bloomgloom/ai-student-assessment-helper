import { useEffect, useState } from 'react';
import { settingsApi } from '../../lib/api';
import { DEFAULT_MODELS, DEFAULT_URLS } from './constants';
import { SettingsState } from './types';

export function useSettingsController() {
  const [settings, setSettings] = useState<SettingsState>({
    provider: 'gemini',
    apiKey: '',
    apiKeys: {},
    model: '',
    baseUrl: '',
    maxConcurrency: 5,
    providerSettings: {},
    loggingEnabled: true,
    storageRoot: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [browsingStorage, setBrowsingStorage] = useState(false);

  const [compatibleModels, setCompatibleModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.get().then((r) => {
      const data = r.data as SettingsState;
      setSettings({
        ...data,
        providerSettings: data.providerSettings || {},
        storageRoot: data.storage?.configuredRoot || data.storage?.currentRoot || '',
      });
    });
  }, []);

  const handleProviderChange = (provider: string) => {
    setSettings((s) => ({
      ...s,
      provider,
      apiKey: s.apiKeys?.[provider] || '',
      providerSettings: {
        ...s.providerSettings,
        [s.provider]: {
          model: s.model,
          baseUrl: s.baseUrl,
          maxConcurrency: s.maxConcurrency,
        },
      },
      model: s.providerSettings?.[provider]?.model ?? DEFAULT_MODELS[provider] ?? '',
      baseUrl: s.providerSettings?.[provider]?.baseUrl ?? DEFAULT_URLS[provider] ?? '',
      maxConcurrency: s.providerSettings?.[provider]?.maxConcurrency ?? (provider === 'openai-compatible' ? 1 : 5),
    }));
    setCompatibleModels([]);
    setModelFetchError(null);
  };

  const withCurrentProviderSettings = (value: SettingsState): SettingsState => ({
    ...value,
    providerSettings: {
      ...value.providerSettings,
      [value.provider]: {
        model: value.model,
        baseUrl: value.baseUrl,
        maxConcurrency: value.maxConcurrency,
      },
    },
  });

  const handleFetchCompatibleModels = async () => {
    setFetchingModels(true);
    setModelFetchError(null);
    try {
      const baseUrl = settings.baseUrl || DEFAULT_URLS['openai-compatible'] || 'http://localhost:8000/v1';
      const r = await settingsApi.getCompatibleModels(baseUrl, settings.apiKey);
      const models: string[] = r.data.models;
      setCompatibleModels(models);
      // 자동으로 첫 번째 모델 선택
      if (models.length > 0 && !settings.model) {
        setSettings((s) => ({
          ...s,
          model: models[0],
          providerSettings: {
            ...s.providerSettings,
            [s.provider]: {
              model: models[0],
              baseUrl: s.baseUrl,
              maxConcurrency: s.maxConcurrency,
            },
          },
        }));
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
      const payload = withCurrentProviderSettings(settings);
      const r = await settingsApi.update(payload as unknown as Record<string, unknown>);
      const storage = r.data?.storage ?? settings.storage;
      setSettings((s) => ({ ...withCurrentProviderSettings(s), storage }));
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
      await settingsApi.update(withCurrentProviderSettings(settings) as unknown as Record<string, unknown>);
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

  const handleBrowseStoragePath = async () => {
    setBrowsingStorage(true);
    try {
      const r = await settingsApi.browseStoragePath();
      if (r.data.cancelled) return;
      setSettings((s) => ({ ...s, storageRoot: r.data.path }));
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      alert(msg);
    } finally {
      setBrowsingStorage(false);
    }
  };

  const isOllama = settings.provider === 'ollama';
  const isOpenAICompatible = settings.provider === 'openai-compatible';
  const needsKey = settings.provider !== 'ollama';
  const needsUrl = isOllama || isOpenAICompatible;



  return {
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
  };
}
