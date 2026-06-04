import { SetStateAction, useEffect, useState } from 'react';
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
    artifactStripIntroBlocks: true,
    aiEnabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [testedSignature, setTestedSignature] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [inputOptionsSaving, setInputOptionsSaving] = useState(false);

  const [compatibleModels, setCompatibleModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.get().then((r) => {
      const data = r.data as SettingsState;
      setSettings({
        ...data,
        providerSettings: data.providerSettings || {},
        artifactStripIntroBlocks: data.artifactStripIntroBlocks !== false,
        aiEnabled: data.aiEnabled === true,
      });
    });
  }, []);

  const handleProviderChange = (provider: string) => {
    setTestResult(null);
    setTestedSignature('');
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

  const getConnectionSignature = (value: SettingsState) => JSON.stringify({
    provider: value.provider,
    apiKey: value.apiKeys?.[value.provider] || value.apiKey || '',
    model: value.model,
    baseUrl: value.baseUrl,
    maxConcurrency: value.maxConcurrency,
    providerSettings: value.providerSettings?.[value.provider],
  });

  const currentConnectionSignature = getConnectionSignature(withCurrentProviderSettings(settings));
  const canSave = !settings.aiEnabled || testedSignature === currentConnectionSignature;

  const updateSettings = (updater: SetStateAction<SettingsState>) => {
    setTestResult(null);
    setTestedSignature('');
    setSettings(updater);
  };

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
      if (payload.aiEnabled && testedSignature !== getConnectionSignature(payload)) {
        alert('AI 기능 사용 상태에서는 연결 테스트 성공 후 저장할 수 있습니다.');
        return;
      }
      const r = await settingsApi.update(payload as unknown as Record<string, unknown>);
      const storage = r.data?.storage ?? settings.storage;
      setSettings((s) => ({ ...withCurrentProviderSettings(s), storage }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleInputOptionChange = async (
    key: 'loggingEnabled' | 'artifactStripIntroBlocks' | 'aiEnabled',
    value: boolean,
  ) => {
    const previousValue = settings[key];
    setTestResult(null);
    setTestedSignature('');
    setSettings((s) => ({ ...s, [key]: value }));
    setInputOptionsSaving(true);
    try {
      if (key === 'aiEnabled') return;
      await settingsApi.update({ [key]: value });
    } catch (e: unknown) {
      setSettings((s) => ({ ...s, [key]: previousValue }));
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      alert(`설정 저장 중 오류: ${msg}`);
    } finally {
      setInputOptionsSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = withCurrentProviderSettings({ ...settings, aiEnabled: true });
      const r = await settingsApi.test(payload as unknown as Record<string, unknown>);
      setTestedSignature(getConnectionSignature(payload));
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

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const r = await settingsApi.backup();
      const blob = new Blob([r.data], { type: 'application/zip' });
      const disposition = String(r.headers['content-disposition'] || '');
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `assessment-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      alert(`백업 중 오류: ${msg}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (file: File) => {
    const ok = window.confirm('현재 저장된 데이터가 선택한 백업 ZIP 내용으로 교체됩니다. 복원하시겠습니까?');
    if (!ok) return;

    setRestoring(true);
    try {
      const r = await settingsApi.restore(file);
      setSettings((s) => ({ ...s, storage: r.data?.storage ?? s.storage }));
      alert('복원이 완료되었습니다. 화면을 새로고침한 뒤 데이터를 확인하세요.');
      window.location.reload();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? String(e))
          : String(e);
      alert(`복원 중 오류: ${msg}`);
    } finally {
      setRestoring(false);
    }
  };

  const isOllama = settings.provider === 'ollama';
  const isOpenAICompatible = settings.provider === 'openai-compatible';
  const needsKey = settings.provider !== 'ollama';
  const needsUrl = isOllama || isOpenAICompatible;



  return {
    settings,
    setSettings: updateSettings,
    saving,
    testing,
    testResult,
    saved,
    resetting,
    resetConfirm,
    setResetConfirm,
    backingUp,
    restoring,
    inputOptionsSaving,
    compatibleModels,
    fetchingModels,
    modelFetchError,
    canSave,
    handleProviderChange,
    handleFetchCompatibleModels,
    handleSave,
    handleInputOptionChange,
    handleTest,
    handleReset,
    handleBackup,
    handleRestore,
    isOllama,
    isOpenAICompatible,
    needsKey,
    needsUrl,
  };
}
