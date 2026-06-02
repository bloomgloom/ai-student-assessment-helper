import { create } from 'zustand';

interface OverlayState {
  active: boolean;
  stopping: boolean;
  title: string;
  message: string;
  progress: number; // 0-100, or -1 for indeterminate
  controller: AbortController | null;
  start: (title: string, message?: string) => AbortController;
  stop: () => void;
  setMessage: (message: string) => void;
  setProgress: (progress: number, message?: string) => void;
  finish: () => void;
}

export const useAiOverlayStore = create<OverlayState>((set) => ({
  active: false,
  stopping: false,
  title: '',
  message: '',
  progress: -1,
  controller: null,

  start: (title: string, message = '처리 중...') => {
    const controller = new AbortController();
    set({ active: true, stopping: false, title, message, progress: -1, controller });
    return controller;
  },

  stop: () => set((state) => {
    state.controller?.abort();
    return state.active
      ? { stopping: true, message: '중단 중...' }
      : {};
  }),

  setMessage: (message: string) => set({ message }),

  setProgress: (progress: number, message?: string) =>
    set(state => ({ progress, message: message ?? state.message })),

  finish: () => set({ active: false, stopping: false, title: '', message: '', progress: -1, controller: null }),
}));
