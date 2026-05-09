import { useCallback } from 'react';
import { useAiOverlayStore } from '../stores/aiOverlayStore';

interface AiActionContext {
  signal: AbortSignal;
  setProgress: (progress: number, message?: string) => void;
  setMessage: (message: string) => void;
}

interface AiActionOptions {
  title: string;
  message?: string;
  errorMessage?: string;
  setLoading?: (loading: boolean) => void;
  initialProgress?: { progress: number; message?: string };
}

function isCanceled(error: any) {
  return error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError';
}

export function useAiAction() {
  const start = useAiOverlayStore(state => state.start);
  const finish = useAiOverlayStore(state => state.finish);
  const setProgress = useAiOverlayStore(state => state.setProgress);
  const setMessage = useAiOverlayStore(state => state.setMessage);

  return useCallback(async <T,>(
    options: AiActionOptions,
    action: (context: AiActionContext) => Promise<T>
  ): Promise<T | undefined> => {
    const controller = start(options.title, options.message);
    if (options.initialProgress) {
      setProgress(options.initialProgress.progress, options.initialProgress.message);
    }
    options.setLoading?.(true);

    try {
      return await action({
        signal: controller.signal,
        setProgress,
        setMessage,
      });
    } catch (error: any) {
      if (!isCanceled(error)) {
        alert(options.errorMessage || error?.response?.data?.error || error?.message || 'AI 처리 중 오류가 발생했습니다.');
      }
      return undefined;
    } finally {
      finish();
      options.setLoading?.(false);
    }
  }, [finish, setMessage, setProgress, start]);
}

