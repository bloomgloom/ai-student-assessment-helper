import { create } from 'zustand';

interface RecordsUnsavedState {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
}

export const useRecordsUnsavedStore = create<RecordsUnsavedState>((set) => ({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
}));
