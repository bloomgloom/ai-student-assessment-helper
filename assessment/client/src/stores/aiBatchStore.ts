import { create } from 'zustand';

export type BatchContentType = 'scoring' | 'comments';
export type BatchStatus = 'running' | 'stopping' | 'completed' | 'error' | 'stopped';

export interface GeneratedContentUpdate {
  studentId: number;
  contentType: BatchContentType;
  domain: string;
  content: string;
}

export interface BatchJob {
  id: string;
  classId: number;
  classLabel: string;
  domains: string[];
  contentType: BatchContentType;
  studentIds: number[];
  completed: number;
  total: number;
  errorCount: number;
  message: string;
  status: BatchStatus;
  startedAt: number;
}

interface StartBatchArgs {
  classId: number;
  classLabel: string;
  domains: string[];
  contentType: BatchContentType;
  studentIds: number[];
}

interface AiBatchState {
  currentJob: BatchJob | null;
  updates: GeneratedContentUpdate[];
  startBatch: (args: StartBatchArgs) => Promise<boolean>;
  stopBatch: () => void;
  clearFinished: () => void;
  isCellLocked: (classId: number, studentId: number, contentType: BatchContentType, domain: string) => boolean;
}

let activeController: AbortController | null = null;
let clearTimer: number | null = null;
let unloadListenerAttached = false;

function newJobId() {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isGeneratedContentUpdate(value: unknown): value is GeneratedContentUpdate {
  const event = value as Partial<GeneratedContentUpdate>;
  return Boolean(event.studentId && event.contentType && event.domain && event.content);
}

export const useAiBatchStore = create<AiBatchState>((set, get) => ({
  currentJob: null,
  updates: [],

  startBatch: async ({ classId, classLabel, domains, contentType, studentIds }) => {
    const existing = get().currentJob;
    if (existing && (existing.status === 'running' || existing.status === 'stopping')) return false;

    if (clearTimer) {
      window.clearTimeout(clearTimer);
      clearTimer = null;
    }

    const jobId = newJobId();
    activeController = new AbortController();
    set({
      updates: [],
      currentJob: {
        id: jobId,
        classId,
        classLabel,
        domains,
        contentType,
        studentIds,
        completed: 0,
        total: domains.length * studentIds.length,
        errorCount: 0,
        message: `[${domains[0]}] 준비 중...`,
        status: 'running',
        startedAt: Date.now(),
      },
    });

    let aggregateCompleted = 0;
    let aggregateErrors = 0;

    try {
      for (const domain of domains) {
        if (activeController.signal.aborted) break;
        const domainStartCompleted = aggregateCompleted;
        set((state) => state.currentJob?.id === jobId ? {
          currentJob: {
            ...state.currentJob,
            completed: aggregateCompleted,
            message: `[${domain}] 준비 중...`,
          },
        } : {});

        try {
          const response = await fetch('/api/ai/generate-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: activeController.signal,
            body: JSON.stringify({
              classId,
              domain,
              contentType,
              studentIds,
            }),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const reader = response.body?.getReader();
          if (!reader) throw new Error('진행 스트림을 열 수 없습니다.');

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              try {
                const event = JSON.parse(line.slice(6));

                if (event.type === 'progress' || event.type === 'error') {
                  aggregateCompleted = domainStartCompleted + Number(event.completed || 0);
                  if (event.type === 'error') aggregateErrors++;
                  const update = isGeneratedContentUpdate({
                    studentId: event.studentId,
                    contentType: event.contentType || contentType,
                    domain: event.domain || domain,
                    content: event.content,
                  })
                    ? {
                        studentId: event.studentId,
                        contentType: event.contentType || contentType,
                        domain: event.domain || domain,
                        content: event.content,
                      }
                    : null;

                  set((state) => {
                    if (state.currentJob?.id !== jobId) return {};
                    return {
                      updates: update ? [...state.updates, update] : state.updates,
                      currentJob: {
                        ...state.currentJob,
                        completed: aggregateCompleted,
                        errorCount: aggregateErrors,
                        message: event.type === 'error'
                          ? `[${domain}] ${event.name || '학생'} 오류: ${event.error || '생성 실패'}`
                          : `[${domain}] ${event.name} 완료`,
                      },
                    };
                  });
                } else if (event.type === 'done') {
                  aggregateCompleted = domainStartCompleted + Number(event.completed || studentIds.length);
                  set((state) => state.currentJob?.id === jobId ? {
                    currentJob: {
                      ...state.currentJob,
                      completed: aggregateCompleted,
                      errorCount: aggregateErrors,
                      message: aggregateErrors > 0
                        ? `[${domain}] 완료, 오류 ${aggregateErrors}건`
                        : `[${domain}] 완료`,
                    },
                  } : {});
                } else if (event.type === 'fatal') {
                  throw new Error(event.error || '일괄 생성 실패');
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') break;
          throw e;
        }
      }

      const stopped = Boolean(activeController?.signal.aborted);
      set((state) => state.currentJob?.id === jobId ? {
        currentJob: {
          ...state.currentJob,
          status: stopped ? 'stopped' : 'completed',
          errorCount: aggregateErrors,
          message: stopped
            ? '중단되었습니다.'
            : aggregateErrors > 0
              ? `AI 생성이 완료되었습니다. 오류 ${aggregateErrors}건은 작성하지 않았습니다.`
              : 'AI 생성이 완료되었습니다.',
        },
      } : {});

      if (stopped || aggregateErrors === 0) {
        clearTimer = window.setTimeout(() => {
          if (get().currentJob?.id === jobId) get().clearFinished();
        }, stopped ? 300 : 1200);
      }

      return !stopped;
    } catch (e) {
      set((state) => state.currentJob?.id === jobId ? {
        currentJob: {
          ...state.currentJob,
          status: 'error',
          message: `오류: ${e instanceof Error ? e.message : String(e)}`,
        },
      } : {});
      return false;
    } finally {
      activeController = null;
    }
  },

  stopBatch: () => {
    activeController?.abort();
    set((state) => state.currentJob ? {
      currentJob: {
        ...state.currentJob,
        status: 'stopping',
        message: '중단 중...',
      },
    } : {});
  },

  clearFinished: () => {
    const job = get().currentJob;
    if (!job || job.status === 'running' || job.status === 'stopping') return;
    set({ currentJob: null });
  },

  isCellLocked: (classId, studentId, contentType, domain) => {
    const job = get().currentJob;
    if (!job || job.classId !== classId) return false;
    if (job.status !== 'running' && job.status !== 'stopping') return false;
    return job.contentType === contentType
      && job.domains.includes(domain)
      && job.studentIds.includes(studentId);
  },
}));

if (typeof window !== 'undefined' && !unloadListenerAttached) {
  unloadListenerAttached = true;
  window.addEventListener('beforeunload', () => {
    activeController?.abort();
  });
  window.addEventListener('pagehide', () => {
    activeController?.abort();
  });
}
